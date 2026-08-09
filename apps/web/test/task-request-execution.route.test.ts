import { NextResponse } from "next/server";

jest.mock("@/lib/Db/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
}));

jest.mock("@/lib/observability/with-correlation", () => ({
    withRequestCorrelation: async (_req: unknown, handler: () => Promise<Response>) => handler(),
}));

class MockAuthorizationError extends Error {
    code: "FORBIDDEN" | "NOT_FOUND";
    constructor(code: "FORBIDDEN" | "NOT_FOUND", message: string) {
        super(message);
        this.code = code;
        this.name = "AuthorizationError";
    }
}

jest.mock("@semantask/services/authorization.service", () => ({
    AuthorizationError: MockAuthorizationError,
}));

jest.mock("@semantask/services/organization-errors", () => {
    class ValidationError extends Error {
        code = "VALIDATION_ERROR" as const;
        constructor(message: string) {
            super(message);
            this.name = "ValidationError";
        }
    }
    class ConflictError extends Error {
        code = "CONFLICT" as const;
        constructor(message: string) {
            super(message);
            this.name = "ConflictError";
        }
    }
    return { ValidationError, ConflictError };
});

const requestTaskExecution = jest.fn();

jest.mock("@semantask/services/task-execution-request.service", () => ({
    requestTaskExecution: (...args: unknown[]) => requestTaskExecution(...args),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { POST } from "../app/api/tasks/[id]/request-execution/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    email: "manager@example.com",
    role: "user" as const,
};

describe("POST /api/tasks/[id]/request-execution", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
    });

    it("returns 401 when unauthenticated", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const response = await POST(
            new Request("http://localhost/api/tasks/507f1f77bcf86cd799439012/request-execution", {
                method: "POST",
                body: "{}",
            }) as never,
            { params: Promise.resolve({ id: "507f1f77bcf86cd799439012" }) }
        );
        expect(response.status).toBe(401);
        expect(requestTaskExecution).not.toHaveBeenCalled();
    });

    it("requests execution for authorized manager", async () => {
        requestTaskExecution.mockResolvedValue({
            taskAction: {
                _id: { toString: () => "action-1" },
                taskId: { toString: () => "507f1f77bcf86cd799439012" },
                conversationId: { toString: () => "507f1f77bcf86cd799439013" },
                actorType: "user",
                actorId: { toString: () => user.id },
                actionType: "none",
                toolName: "none",
                messageId: null,
                parameters: {},
                executionState: "requested",
                summary: "Explicit manager request",
                error: null,
                patch: { before: null, after: { explicitManagerRequest: true } },
                reason: "Manager requested AI tool execution",
                idempotencyKey: "idem",
                createdAt: new Date("2026-08-09T10:00:00.000Z"),
            },
            enqueued: true,
            alreadyPending: false,
        });

        const response = await POST(
            new Request("http://localhost/api/tasks/507f1f77bcf86cd799439012/request-execution", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ reason: "please run" }),
            }) as never,
            { params: Promise.resolve({ id: "507f1f77bcf86cd799439012" }) }
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.enqueued).toBe(true);
        expect(requestTaskExecution).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "507f1f77bcf86cd799439012",
                actorUserId: user.id,
                reason: "please run",
            })
        );
    });

    it("returns 403 when unauthorized", async () => {
        requestTaskExecution.mockRejectedValue(new MockAuthorizationError("FORBIDDEN", "Forbidden"));

        const response = await POST(
            new Request("http://localhost/api/tasks/507f1f77bcf86cd799439012/request-execution", {
                method: "POST",
                body: "{}",
            }) as never,
            { params: Promise.resolve({ id: "507f1f77bcf86cd799439012" }) }
        );
        expect(response.status).toBe(403);
    });
});
