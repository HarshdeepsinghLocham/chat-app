import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestCorrelation } from "@/lib/observability/with-correlation";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { AuthorizationError } from "@semantask/services/authorization.service";
import { ValidationError, ConflictError } from "@semantask/services/organization-errors";
import { requestTaskExecution } from "@semantask/services/task-execution-request.service";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
    reason: z.string().trim().max(2000).optional(),
}).strict();

function serializeTaskAction(action: {
    _id: { toString(): string };
    taskId: { toString(): string };
    conversationId: { toString(): string };
    actorType: string;
    actorId?: { toString(): string } | null;
    actionType: string;
    toolName?: string | null;
    messageId?: { toString(): string } | null;
    parameters?: Record<string, unknown>;
    executionState?: string | null;
    summary?: string | null;
    error?: string | null;
    patch: unknown;
    reason: string;
    idempotencyKey: string;
    createdAt: Date;
}) {
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

export async function POST(req: NextRequest, context: RouteContext) {
    return withRequestCorrelation(req, async () => {
        const guard = await requireAuthUser();
        if (guard.response) {
            return guard.response;
        }

        const { id } = await context.params;

        try {
            await connectToDatabase();

            let body: z.infer<typeof bodySchema> = {};
            const raw = await req.text();
            if (raw.trim().length > 0) {
                body = bodySchema.parse(JSON.parse(raw));
            }

            const result = await requestTaskExecution({
                taskId: id,
                actorUserId: guard.user.id,
                reason: body.reason,
                authOptions: {
                    userRole: guard.user.role,
                    allowAdminBypass: true,
                },
            });

            return NextResponse.json({
                success: true,
                data: {
                    taskAction: serializeTaskAction(result.taskAction),
                    enqueued: result.enqueued,
                    alreadyPending: result.alreadyPending,
                },
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return NextResponse.json(
                    { success: false, error: "Invalid request-execution payload" },
                    { status: 400 }
                );
            }
            if (error instanceof ValidationError) {
                return NextResponse.json({ success: false, error: error.message }, { status: 400 });
            }
            if (error instanceof ConflictError) {
                return NextResponse.json({ success: false, error: error.message }, { status: 409 });
            }
            if (error instanceof AuthorizationError) {
                const status = error.code === "NOT_FOUND" ? 404 : 403;
                return NextResponse.json(
                    {
                        success: false,
                        error: error.code === "NOT_FOUND" ? "Task not found" : "Forbidden",
                    },
                    { status }
                );
            }
            console.error("POST /api/tasks/[id]/request-execution error", error);
            return NextResponse.json(
                { success: false, error: "Failed to request execution" },
                { status: 500 }
            );
        }
    });
}
