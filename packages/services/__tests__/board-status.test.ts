import { Types } from "mongoose";
import {
    resolveBoardStatus,
    type TaskStatus,
} from "../../types/task/task";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        countDocuments: jest.fn(),
        find: jest.fn(),
    },
}));

jest.mock("../conversation-label.service", () => ({
    resolveConversationLabels: jest.fn(async () => new Map()),
}));

jest.mock("../user-ref.service", () => ({
    resolveUserRefs: jest.fn(async () => new Map()),
    userRefOrFallback: (userId: string) => ({ id: userId, username: "Unknown user" }),
}));

import { boardStatusQuery, listWorkBoard } from "../work-board.service";
import { ValidationError } from "../organization-errors";
import { normalizeTask } from "../normalizers/task.normalizer";
import type { ITask } from "@semantask/db/models/Task";

describe("resolveBoardStatus", () => {
    it("keeps an explicit persisted column", () => {
        expect(resolveBoardStatus({ boardStatus: "doing", status: "pending" })).toBe("doing");
        expect(resolveBoardStatus({ boardStatus: "todo", status: "completed" })).toBe("todo");
    });

    it.each<[TaskStatus, "todo" | "doing" | "done"]>([
        ["completed", "done"],
        ["executing", "doing"],
        ["partial", "doing"],
        ["waiting_for_input", "doing"],
        ["pending", "todo"],
        ["failed", "todo"],
    ])("maps missing field from status %s to %s", (status, expected) => {
        expect(resolveBoardStatus({ status })).toBe(expected);
        expect(resolveBoardStatus({ boardStatus: null, status })).toBe(expected);
    });
});

describe("boardStatusQuery", () => {
    it("includes historical docs for todo", () => {
        const query = boardStatusQuery("todo");
        expect(query.$or).toEqual(
            expect.arrayContaining([
                { boardStatus: "todo" },
                expect.objectContaining({ boardStatus: { $exists: false } }),
            ])
        );
    });

    it("maps completed execution status into done", () => {
        const query = boardStatusQuery("done");
        expect(query.$or).toEqual(
            expect.arrayContaining([
                { boardStatus: "done" },
                { boardStatus: { $exists: false }, status: "completed" },
            ])
        );
    });
});

describe("listWorkBoard", () => {
    it("requires conversation or organization scope", async () => {
        await expect(listWorkBoard({})).rejects.toBeInstanceOf(ValidationError);
    });
});

describe("normalizeTask boardStatus", () => {
    it("does not persist — only fills the API shape", () => {
        const now = new Date("2026-08-22T10:00:00.000Z");
        const doc = {
            _id: new Types.ObjectId(),
            conversationId: new Types.ObjectId(),
            title: "Legacy task",
            description: "",
            status: "executing",
            lifecycleState: "executing",
            priority: "medium",
            assignees: [],
            createdBy: new Types.ObjectId(),
            source: "ai",
            sourceMessageIds: [],
            confidence: 1,
            tags: [],
            dedupeKey: "legacy",
            subTasks: [],
            dependencyIds: [],
            retryCount: 0,
            maxRetries: 2,
            progress: 0,
            checkpoints: [],
            executionHistory: { attempts: 0, failures: 0, results: [] },
            result: { success: false, confidence: 0, evidence: null },
            version: 1,
            createdAt: now,
            updatedAt: now,
        } as unknown as ITask;

        expect(doc.boardStatus).toBeUndefined();
        expect(normalizeTask(doc).boardStatus).toBe("doing");
        expect(doc.boardStatus).toBeUndefined();
    });
});
