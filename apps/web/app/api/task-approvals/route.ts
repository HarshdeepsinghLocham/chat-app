import { NextRequest, NextResponse } from "next/server";
import { withRequestCorrelation } from "@/lib/observability/with-correlation";
import { z } from "zod";
import { enqueueOutboxEvent } from "@/lib/services/outbox.service";
import {
    getPendingApprovalTaskActions,
    getPendingApprovalTaskActionsForOrganization,
    getTaskActionById,
    updateTaskActionExecutionState,
} from "@/lib/services/repositories/task.repo";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    AuthorizationError,
    assertCanDecideTaskExecutionApproval,
} from "@semantask/services/authorization.service";
import {
    assertOrganizationActive,
    canManageMembers,
    getMembership,
} from "@semantask/services/organization.service";
import { Conversation } from "@/models/Conversation";
import TaskModel from "@/models/Task";

const decisionSchema = z.object({
    taskActionId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().max(2000).optional(),
    reviewerComment: z.string().max(2000).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
});

function serializeTaskAction(action: Awaited<ReturnType<typeof getPendingApprovalTaskActions>>[number]) {
    return {
        _id: action._id.toString(),
        taskId: action.taskId.toString(),
        conversationId: action.conversationId.toString(),
        actorType: action.actorType,
        actorId: action.actorId ? action.actorId.toString() : null,
        actionType: action.actionType,
        toolName: action.toolName ?? null,
        messageId: action.messageId ? action.messageId.toString() : null,
        parameters: action.parameters ?? {},
        executionState: action.executionState ?? null,
        summary: action.summary ?? null,
        error: action.error ?? null,
        patch: action.patch,
        reason: action.reason,
        idempotencyKey: action.idempotencyKey,
        createdAt: action.createdAt.toISOString(),
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return {};
}

async function resolveOrganizationIdForAction(action: {
    conversationId: { toString(): string };
    taskId: { toString(): string };
}): Promise<string | null> {
    const conversationId = action.conversationId.toString();
    const conversation = await Conversation.findById(conversationId)
        .select("organizationId")
        .lean<{ organizationId?: { toString(): string } | null }>();
    if (conversation?.organizationId) {
        return conversation.organizationId.toString();
    }

    const task = await TaskModel.findById(action.taskId.toString())
        .select("organizationId")
        .lean<{ organizationId?: { toString(): string } | null }>();
    return task?.organizationId ? task.organizationId.toString() : null;
}

export async function GET(req: NextRequest) {
    const guard = await requireAuthUser();
    if (guard.response) return guard.response;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId") ?? undefined;
    const organizationId = searchParams.get("organizationId") ?? undefined;
    const isPlatformAdmin = guard.user.role === "admin";

    try {
        if (isPlatformAdmin && !conversationId && !organizationId) {
            const actions = await getPendingApprovalTaskActions();
            return NextResponse.json({ approvals: actions.map(serializeTaskAction) }, { status: 200 });
        }

        if (conversationId) {
            const conversation = await Conversation.findById(conversationId)
                .select("organizationId")
                .lean<{ organizationId?: { toString(): string } | null }>();
            const orgId = conversation?.organizationId?.toString() ?? null;
            await assertCanDecideTaskExecutionApproval(
                guard.user.id,
                { conversationId, organizationId: orgId },
                { userRole: guard.user.role, allowAdminBypass: true }
            );
            const actions = await getPendingApprovalTaskActions(conversationId);
            return NextResponse.json({ approvals: actions.map(serializeTaskAction) }, { status: 200 });
        }

        if (organizationId) {
            await assertOrganizationActive(organizationId);
            if (!isPlatformAdmin) {
                const membership = await getMembership(organizationId, guard.user.id);
                if (!membership || !canManageMembers(membership.role)) {
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
                }
            }

            const actions = await getPendingApprovalTaskActionsForOrganization(organizationId);
            return NextResponse.json({ approvals: actions.map(serializeTaskAction) }, { status: 200 });
        }

        return NextResponse.json(
            { error: "organizationId or conversationId is required" },
            { status: 400 }
        );
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { error: error.code === "NOT_FOUND" ? "Not found" : "Forbidden" },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        console.error("GET /api/task-approvals error", error);
        return NextResponse.json({ error: "Failed to load approvals" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return withRequestCorrelation(req, async () => {
        const guard = await requireAuthUser();
        if (guard.response) return guard.response;

        const parse = decisionSchema.safeParse(await req.json());
        if (!parse.success) {
            return NextResponse.json({ error: "Invalid approval decision payload" }, { status: 400 });
        }

        const body = parse.data;
        const action = await getTaskActionById(body.taskActionId);

        if (!action) {
            return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
        }

        if (action.executionState !== "approval_pending") {
            return NextResponse.json(
                { error: `Approval request is not pending (state=${action.executionState ?? "null"})` },
                { status: 409 }
            );
        }

        try {
            const organizationId = await resolveOrganizationIdForAction(action);
            await assertCanDecideTaskExecutionApproval(
                guard.user.id,
                {
                    conversationId: action.conversationId.toString(),
                    organizationId,
                },
                { userRole: guard.user.role, allowAdminBypass: true }
            );
        } catch (error) {
            if (error instanceof AuthorizationError) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            throw error;
        }

        if (body.decision === "reject") {
            const rejectNote = body.reason ?? body.reviewerComment ?? "Rejected by reviewer.";
            const updated = await updateTaskActionExecutionState({
                taskActionId: body.taskActionId,
                executionState: "rejected",
                summary: action.summary ?? null,
                error: rejectNote,
                reason: `${action.reason}${rejectNote ? ` | reviewer: ${rejectNote}` : ""}`,
            });

            return NextResponse.json({ approval: updated ? serializeTaskAction(updated) : null }, { status: 200 });
        }

        const approvedParameters = body.parameters ?? action.parameters ?? {};
        const reviewerComment = body.reviewerComment ?? body.reason ?? "Approved by reviewer.";
        const patchAfter = asRecord(action.patch?.after);
        const explicitManagerRequest = patchAfter.explicitManagerRequest === true;
        // S2.4: only the explicit manager "Allow AI tools" path bypasses suggest_only.
        const humanApprovedExecution = explicitManagerRequest;

        const updated = await updateTaskActionExecutionState({
            taskActionId: body.taskActionId,
            executionState: "approved",
            summary: action.summary ?? null,
            error: null,
            parameters: approvedParameters,
            reason: `${action.reason}${reviewerComment ? ` | reviewer: ${reviewerComment}` : ""}`,
            patch: {
                before: action.patch?.before ?? null,
                after: {
                    ...patchAfter,
                    approvedParameters,
                    reviewerComment,
                    approvedAt: new Date().toISOString(),
                    explicitManagerRequest,
                    humanApprovedExecution,
                },
            },
        });

        await enqueueOutboxEvent({
            topic: "task.execution.approved",
            dedupeKey: `task.execution.approved:${body.taskActionId}`,
            payload: {
                taskId: action.taskId.toString(),
                conversationId: action.conversationId.toString(),
                taskActionId: body.taskActionId,
                approvedByType: guard.user.role === "admin" ? "system" : "user",
                approvedById: guard.user.id,
                reason: reviewerComment,
                humanApprovedExecution,
                explicitManagerRequest,
            },
        });

        return NextResponse.json({ approval: updated ? serializeTaskAction(updated) : null }, { status: 200 });
    });
}
