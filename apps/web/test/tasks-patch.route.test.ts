import { NextResponse } from "next/server";
import { Types } from "mongoose";

jest.mock("@/lib/observability/with-correlation", () => ({
    withRequestCorrelation: async (_req: unknown, handler: () => Promise<Response>) => handler(),
}));

jest.mock("@/lib/Db/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
}));

jest.mock("@/lib/utils/auth/requireConversationAccess", () => ({
    requireTaskAccess: jest.fn(),
}));

class MockAuthorizationError extends Error {
    code: "FORBIDDEN" | "NOT_FOUND";
    constructor(code: "FORBIDDEN" | "NOT_FOUND", message: string) {
        super(message);
        this.code = code;
        this.name = "AuthorizationError";
    }
}

const assertCanMutateCoordinationTask = jest.fn();

jest.mock("@semantask/services/authorization.service", () => ({
    AuthorizationError: MockAuthorizationError,
    assertCanMutateCoordinationTask: (...args: unknown[]) => assertCanMutateCoordinationTask(...args),
}));

const updateTask = jest.fn();
jest.mock("@/lib/repositories/task.repo", () => ({
    updateTask: (...args: unknown[]) => updateTask(...args),
}));

const enqueueOutboxEvent = jest.fn();
jest.mock("@/lib/services/outbox.service", () => ({
    enqueueOutboxEvent: (...args: unknown[]) => enqueueOutboxEvent(...args),
}));

const findById = jest.fn();
jest.mock("@/models/Task", () => ({
    __esModule: true,
    default: {
        findById: (...args: unknown[]) => findById(...args),
    },
}));

jest.mock("@/server/normalizers/task.normalizer", () => ({
    normalizeTask: (doc: { _id: { toString(): string }; conversationId: { toString(): string }; boardStatus?: string; version: number; updatedAt: Date }) => ({
        _id: doc._id.toString(),
        conversationId: doc.conversationId.toString(),
        boardStatus: doc.boardStatus ?? "todo",
        version: doc.version,
        updatedAt: doc.updatedAt.toISOString(),
    }),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { requireTaskAccess } from "@/lib/utils/auth/requireConversationAccess";
import { GET, PATCH } from "../app/api/tasks/[id]/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    role: "user" as const,
};
const taskId = "507f1f77bcf86cd799439012";
const conversationId = new Types.ObjectId("507f1f77bcf86cd799439013");
const organizationId = new Types.ObjectId("507f1f77bcf86cd799439014");

function buildTask(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(taskId),
        conversationId,
        organizationId,
        status: "pending",
        boardStatus: "todo",
        version: 1,
        updatedAt: new Date("2026-08-22T10:00:00.000Z"),
        ...overrides,
    };
}

describe("PATCH /api/tasks/:id boardStatus", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (requireTaskAccess as jest.Mock).mockResolvedValue({ response: null });
        assertCanMutateCoordinationTask.mockResolvedValue(undefined);
        findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(buildTask()) });
        updateTask.mockResolvedValue(buildTask({ boardStatus: "doing", version: 2 }));
        enqueueOutboxEvent.mockResolvedValue(undefined);
    });

    it("uses the manager matrix for board-only writes and skips requireTaskAccess", async () => {
        const response = await PATCH(
            new Request(`http://localhost/api/tasks/${taskId}`, {
                method: "PATCH",
                body: JSON.stringify({ boardStatus: "doing" }),
            }) as never,
            { params: Promise.resolve({ id: taskId }) }
        );

        expect(response.status).toBe(200);
        expect(requireTaskAccess).not.toHaveBeenCalled();
        expect(assertCanMutateCoordinationTask).toHaveBeenCalledWith(
            user.id,
            {
                conversationId: conversationId.toString(),
                organizationId: organizationId.toString(),
            },
            expect.objectContaining({ allowAdminBypass: true })
        );
        expect(updateTask).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId,
                boardStatus: "doing",
                updatedBy: user.id,
            })
        );
        const topics = enqueueOutboxEvent.mock.calls.map(
            (call) => (call[0] as { topic: string }).topic
        );
        expect(topics).toContain("task.updated");
        expect(topics).toContain("task.board.updated");
        expect(enqueueOutboxEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                topic: "task.board.updated",
                dedupeKey: `task.board.updated:${taskId}:doing:2`,
            })
        );
    });

    it("does not enqueue task.board.updated when the column is unchanged", async () => {
        updateTask.mockResolvedValue(buildTask({ boardStatus: "todo", version: 2 }));
        const response = await PATCH(
            new Request(`http://localhost/api/tasks/${taskId}`, {
                method: "PATCH",
                body: JSON.stringify({ boardStatus: "todo" }),
            }) as never,
            { params: Promise.resolve({ id: taskId }) }
        );
        expect(response.status).toBe(200);
        const topics = enqueueOutboxEvent.mock.calls.map(
            (call) => (call[0] as { topic: string }).topic
        );
        expect(topics).toContain("task.updated");
        expect(topics).not.toContain("task.board.updated");
    });

    it("returns 403 when an org member cannot move the card", async () => {
        assertCanMutateCoordinationTask.mockRejectedValue(
            new MockAuthorizationError("FORBIDDEN", "Forbidden")
        );
        const response = await PATCH(
            new Request(`http://localhost/api/tasks/${taskId}`, {
                method: "PATCH",
                body: JSON.stringify({ boardStatus: "doing" }),
            }) as never,
            { params: Promise.resolve({ id: taskId }) }
        );
        expect(response.status).toBe(403);
        expect(updateTask).not.toHaveBeenCalled();
    });

    it("still uses requireTaskAccess for non-board fields", async () => {
        const response = await PATCH(
            new Request(`http://localhost/api/tasks/${taskId}`, {
                method: "PATCH",
                body: JSON.stringify({ title: "Renamed coordination task" }),
            }) as never,
            { params: Promise.resolve({ id: taskId }) }
        );
        expect(response.status).toBe(200);
        expect(requireTaskAccess).toHaveBeenCalled();
        expect(assertCanMutateCoordinationTask).not.toHaveBeenCalled();
    });
});

describe("GET /api/tasks/:id", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (requireTaskAccess as jest.Mock).mockResolvedValue({ response: null });
        findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(buildTask()) });
    });

    it("returns 401 when unauthenticated", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const response = await GET(
            new Request(`http://localhost/api/tasks/${taskId}`) as never,
            { params: Promise.resolve({ id: taskId }) }
        );

        expect(response.status).toBe(401);
        expect(requireTaskAccess).not.toHaveBeenCalled();
        expect(findById).not.toHaveBeenCalled();
    });

    it("returns 403 when requireTaskAccess forbids the caller", async () => {
        (requireTaskAccess as jest.Mock).mockResolvedValue({
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        });

        const response = await GET(
            new Request(`http://localhost/api/tasks/${taskId}`) as never,
            { params: Promise.resolve({ id: taskId }) }
        );

        expect(response.status).toBe(403);
        expect(requireTaskAccess).toHaveBeenCalledWith(taskId, user);
        expect(findById).not.toHaveBeenCalled();
    });

    it("returns the normalized task for a participant", async () => {
        const response = await GET(
            new Request(`http://localhost/api/tasks/${taskId}`) as never,
            { params: Promise.resolve({ id: taskId }) }
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(requireTaskAccess).toHaveBeenCalledWith(taskId, user);
        expect(body).toEqual(
            expect.objectContaining({
                _id: taskId,
                conversationId: conversationId.toString(),
                boardStatus: "todo",
            })
        );
    });
});
