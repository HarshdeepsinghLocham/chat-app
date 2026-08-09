import { NextResponse } from "next/server";

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
}));

jest.mock("@/lib/services/repositories/task.repo", () => ({
    getPendingApprovalTaskActions: jest.fn(),
    getPendingApprovalTaskActionsForOrganization: jest.fn(),
    getTaskActionById: jest.fn(),
    updateTaskActionExecutionState: jest.fn(),
}));

jest.mock("@/lib/services/outbox.service", () => ({
    enqueueOutboxEvent: jest.fn(),
}));

jest.mock("@/lib/observability/with-correlation", () => ({
    withRequestCorrelation: async (_req: unknown, handler: () => Promise<Response>) => handler(),
}));

jest.mock("@semantask/services/authorization.service", () => {
    class AuthorizationError extends Error {
        code: "FORBIDDEN" | "NOT_FOUND";
        constructor(code: "FORBIDDEN" | "NOT_FOUND", message: string) {
            super(message);
            this.code = code;
            this.name = "AuthorizationError";
        }
    }
    return {
        AuthorizationError,
        assertCanDecideTaskExecutionApproval: jest.fn(),
    };
});

jest.mock("@semantask/services/organization.service", () => ({
    assertOrganizationActive: jest.fn().mockResolvedValue(undefined),
    canManageMembers: jest.fn((role: string) => role === "owner" || role === "admin"),
    getMembership: jest.fn(),
}));

jest.mock("@/models/Conversation", () => ({
    Conversation: {
        findById: jest.fn(),
    },
}));

jest.mock("@/models/Task", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
    },
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    getPendingApprovalTaskActions,
    getPendingApprovalTaskActionsForOrganization,
    getTaskActionById,
    updateTaskActionExecutionState,
} from "@/lib/services/repositories/task.repo";
import { enqueueOutboxEvent } from "@/lib/services/outbox.service";
import {
    AuthorizationError,
    assertCanDecideTaskExecutionApproval,
} from "@semantask/services/authorization.service";
import { getMembership } from "@semantask/services/organization.service";
import { Conversation } from "@/models/Conversation";
import { GET, POST } from "../app/api/task-approvals/route";

const adminUser = {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin" as const,
};

const managerUser = {
    id: "507f1f77bcf86cd799439011",
    email: "manager@example.com",
    role: "user" as const,
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
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const response = await GET(new Request("http://localhost/api/task-approvals") as never);
        expect(response.status).toBe(401);
        expect(getPendingApprovalTaskActions).not.toHaveBeenCalled();
    });

    it("allows platform admin global list", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getPendingApprovalTaskActions as jest.Mock).mockResolvedValue([pendingAction()]);

        const response = await GET(new Request("http://localhost/api/task-approvals") as never);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.approvals).toHaveLength(1);
    });

    it("requires scope for non-admin and allows org manager", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: managerUser, response: null });
        (getMembership as jest.Mock).mockResolvedValue({ role: "owner" });
        (getPendingApprovalTaskActionsForOrganization as jest.Mock).mockResolvedValue([pendingAction()]);

        const response = await GET(
            new Request("http://localhost/api/task-approvals?organizationId=507f1f77bcf86cd799439015") as never
        );
        expect(response.status).toBe(200);
        expect(getPendingApprovalTaskActionsForOrganization).toHaveBeenCalledWith(
            "507f1f77bcf86cd799439015"
        );
    });

    it("forbids non-manager org member listing another org", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: managerUser, response: null });
        (getMembership as jest.Mock).mockResolvedValue({ role: "member" });

        const response = await GET(
            new Request("http://localhost/api/task-approvals?organizationId=507f1f77bcf86cd799439015") as never
        );
        expect(response.status).toBe(403);
        expect(getPendingApprovalTaskActionsForOrganization).not.toHaveBeenCalled();
    });
});

describe("POST /api/task-approvals", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Conversation.findById as jest.Mock).mockReturnValue({
            select: () => ({
                lean: async () => ({ organizationId: { toString: () => "507f1f77bcf86cd799439015" } }),
            }),
        });
    });

    it("forbids unauthorized manager decide", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: managerUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(pendingAction());
        (assertCanDecideTaskExecutionApproval as jest.Mock).mockRejectedValue(
            new AuthorizationError("FORBIDDEN", "Forbidden")
        );

        const response = await POST(
            new Request("http://localhost/api/task-approvals", {
                method: "POST",
                body: JSON.stringify({ taskActionId: "action-1", decision: "approve" }),
            }) as never
        );
        expect(response.status).toBe(403);
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    });

    it("approves pending action and enqueues task.execution.approved", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(pendingAction());
        (assertCanDecideTaskExecutionApproval as jest.Mock).mockResolvedValue(undefined);
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
        expect(enqueueOutboxEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                topic: "task.execution.approved",
                dedupeKey: "task.execution.approved:action-1",
                payload: expect.objectContaining({
                    humanApprovedExecution: true,
                }),
            })
        );
    });

    it("rejects pending action without outbox event", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({ user: adminUser, response: null });
        (getTaskActionById as jest.Mock).mockResolvedValue(pendingAction());
        (assertCanDecideTaskExecutionApproval as jest.Mock).mockResolvedValue(undefined);
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
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
    });
});
