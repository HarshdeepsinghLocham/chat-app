import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { requireConversationAccess } from "@/lib/utils/auth/requireConversationAccess";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import {
    isCoordinationBoardEnabled,
} from "@semantask/services/organization-policy.service";
import { listWorkBoard } from "@semantask/services/work-board.service";
import {
    organizationApiErrorStatus,
    ValidationError,
} from "@semantask/services/organization-errors";
import { isBoardStatus, type TaskPriority } from "@semantask/types";

const TASK_PRIORITIES = new Set<TaskPriority>(["low", "medium", "high", "urgent"]);

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTaskPriority(value: string | null): value is TaskPriority {
    return Boolean(value && TASK_PRIORITIES.has(value as TaskPriority));
}

export async function GET(req: Request) {
    if (!isCoordinationBoardEnabled()) {
        return NextResponse.json(
            { success: false, error: "Not found" },
            { status: 404 }
        );
    }

    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() || undefined;
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const boardStatusParam = url.searchParams.get("boardStatus");
    const priorityParam = url.searchParams.get("priority")?.trim() || null;
    const dueParam = url.searchParams.get("due")?.trim() || null;
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 20);

    if (!conversationId && !organizationId) {
        return NextResponse.json(
            { success: false, error: "conversationId or organizationId is required" },
            { status: 400 }
        );
    }

    if (boardStatusParam && !isBoardStatus(boardStatusParam)) {
        return NextResponse.json(
            { success: false, error: "Invalid boardStatus" },
            { status: 400 }
        );
    }

    if (priorityParam && !isTaskPriority(priorityParam)) {
        return NextResponse.json(
            { success: false, error: "Invalid priority" },
            { status: 400 }
        );
    }

    if (dueParam && dueParam !== "all" && dueParam !== "overdue" && dueParam !== "none") {
        return NextResponse.json(
            { success: false, error: "Invalid due filter" },
            { status: 400 }
        );
    }

    try {
        if (conversationId) {
            const access = await requireConversationAccess(conversationId, guard.user);
            if (access.response) {
                return access.response;
            }
        }

        if (organizationId) {
            await assertOrganizationActive(organizationId);
            await assertMembership(organizationId, guard.user.id);
        }

        const result = await listWorkBoard({
            conversationId,
            organizationId,
            boardStatus: isBoardStatus(boardStatusParam) ? boardStatusParam : undefined,
            priority: isTaskPriority(priorityParam) ? priorityParam : undefined,
            due: dueParam === "overdue" || dueParam === "none" ? dueParam : undefined,
            page,
            limit,
        });

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        if (error instanceof ValidationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 400 }
            );
        }
        console.error("GET /api/work-board error", error);
        return NextResponse.json(
            { success: false, error: "Failed to list work board" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
