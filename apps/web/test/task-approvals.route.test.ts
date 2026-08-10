import { NextResponse } from "next/server";

jest.mock("@/lib/utils/auth/requireAdminUser", () => ({
    requireAdminUser: jest.fn(),
}));

jest.mock("@/lib/services/repositories/task.repo", () => ({
    getPendingApprovalTaskActions: jest.fn(),
    getTaskActionById: jest.fn(),
    updateTaskActionExecutionState: jest.fn(),
}));

jest.mock("@/lib/services/outbox.service", () => ({
    enqueueOutboxEvent: jest.fn(),
}));

jest.mock("@/lib/observability/with-correlation", () => ({
    withRequestCorrelation: async (_req: unknown, handler: () => Promise<Response>) => handler(),
}));

import { requireAdminUser } from "@/lib/utils/auth/requireAdminUser";
import {
    getPendingApprovalTaskActions,
    getTaskActionById,
    updateTaskActionExecutionState,
} from "@/lib/services/repositories/task.repo";
import { enqueueOutboxEvent } from "@/lib/services/outbox.service";
import { GET, POST } from "../app/api/task-approvals/route";

const adminUser = {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin" as const,
};

function pendingAction(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => "action-1" },
        taskId: { toString: () => "task-1" },
        conversationId: { toString: () => "conv-1" },
        actorType: "agent",
        actorId: { toString: () => "actor-1" },
        actionType: "send_email",
        toolName: "email.send",
        messageId: null,
        parameters: { to: "a@example.com" },
        executionState: "approval_pending",
        summary: "Send email",
        error: null,
        patch: { before: null, after: { policyDecision: { reasons: ["require_approval"] } } },
        reason: "policy",
        idempotencyKey: "idem-1",
        createdAt: new Date("2026-08-08T10:00:00.000Z"),
        ...overrides,
    };
}

describe("GET /api/task-approvals", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 when unauthenticated", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const response = await GET(new Request("http://localhost/api/task-approvals") as never);
        expect(response.status).toBe(401);
        expect(getPendingApprovalTaskActions).not.toHaveBeenCalled();
    });

    it("returns 403 for non-admin users", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        });

        const response = await GET(new Request("http://localhost/api/task-approvals") as never);
        expect(response.status).toBe(403);
        expect(getPendingApprovalTaskActions).not.toHaveBeenCalled();
    });

    it("returns pending approvals for admin", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getPendingApprovalTaskActions as jest.Mock).mockResolvedValue([pendingAction()]);

        const response = await GET(new Request("http://localhost/api/task-approvals") as never);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.approvals).toHaveLength(1);
        expect(body.approvals[0]._id).toBe("action-1");
        expect(getPendingApprovalTaskActions).toHaveBeenCalledWith(undefined);
    });
});

describe("POST /api/task-approvals", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 403 for non-admin users and does not mutate", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        });

        const response = await POST(
            new Request("http://localhost/api/task-approvals", {
                method: "POST",
                body: JSON.stringify({ taskActionId: "action-1", decision: "approve" }),
            }) as never
        );
        expect(response.status).toBe(403);
        expect(getTaskActionById).not.toHaveBeenCalled();
        expect(updateTaskActionExecutionState).not.toHaveBeenCalled();
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    });

    it("approves pending action and enqueues task.execution.approved", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(pendingAction());
        (updateTaskActionExecutionState as jest.Mock).mockResolvedValue(
            pendingAction({ executionState: "approved" })
        );

        const response = await POST(
            new Request("http://localhost/api/task-approvals", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    taskActionId: "action-1",
                    decision: "approve",
                    reviewerComment: "ok",
                }),
            }) as never
        );

        expect(response.status).toBe(200);
        expect(updateTaskActionExecutionState).toHaveBeenCalledWith(
            expect.objectContaining({
                taskActionId: "action-1",
                executionState: "approved",
            })
        );
        expect(enqueueOutboxEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                topic: "task.execution.approved",
                dedupeKey: "task.execution.approved:action-1",
            })
        );
    });

    it("rejects pending action without outbox event", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(pendingAction());
        (updateTaskActionExecutionState as jest.Mock).mockResolvedValue(
            pendingAction({ executionState: "rejected" })
        );

        const response = await POST(
            new Request("http://localhost/api/task-approvals", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    taskActionId: "action-1",
                    decision: "reject",
                    reason: "nope",
                }),
            }) as never
        );

        expect(response.status).toBe(200);
        expect(updateTaskActionExecutionState).toHaveBeenCalledWith(
            expect.objectContaining({
                taskActionId: "action-1",
                executionState: "rejected",
            })
        );
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    });

    it("returns 409 when action is not pending", async () => {
        (requireAdminUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(
            pendingAction({ executionState: "approved" })
        );

        const response = await POST(
            new Request("http://localhost/api/task-approvals", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ taskActionId: "action-1", decision: "approve" }),
            }) as never
        );

        expect(response.status).toBe(409);
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    });
});
