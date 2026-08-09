import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const suggestionFindById = jest.fn();
const suggestionFindOneAndUpdate = jest.fn();
const taskFindOne = jest.fn();
const taskFindById = jest.fn();
const createTask = jest.fn();
const updateTask = jest.fn();
const enqueueOutboxEvent = jest.fn();
const assertAcceptCreatesCoordinationOnly = jest.fn();
const suggestionsAcceptedCounter = { inc: jest.fn() };
const suggestionsDismissedCounter = { inc: jest.fn() };
const acceptToTaskLatencyMs = { observe: jest.fn() };

jest.mock("@semantask/observability/metrics", () => ({
    suggestionsAcceptedCounter,
    suggestionsDismissedCounter,
    acceptToTaskLatencyMs,
}));

jest.mock("@semantask/db/models/WorkSuggestion", () => ({
    __esModule: true,
    default: {
        findById: (...args: unknown[]) => suggestionFindById(...args),
        findOneAndUpdate: (...args: unknown[]) => suggestionFindOneAndUpdate(...args),
    },
    WORK_SUGGESTION_STATUSES: ["proposed", "accepted", "dismissed", "converted"],
}));

const taskDeleteOne = jest.fn();

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        findOne: (...args: unknown[]) => taskFindOne(...args),
        findById: (...args: unknown[]) => taskFindById(...args),
        deleteOne: (...args: unknown[]) => taskDeleteOne(...args),
    },
}));

jest.mock("../repositories/task.repo", () => ({
    createTask: (...args: unknown[]) => createTask(...args),
    updateTask: (...args: unknown[]) => updateTask(...args),
}));

jest.mock("../outbox.service", () => ({
    enqueueOutboxEvent: (...args: unknown[]) => enqueueOutboxEvent(...args),
}));

jest.mock("../organization-policy.service", () => ({
    assertAcceptCreatesCoordinationOnly: (...args: unknown[]) =>
        assertAcceptCreatesCoordinationOnly(...args),
}));

import {
    acceptWorkSuggestion,
    assignWorkSuggestion,
    dismissWorkSuggestion,
} from "../work-suggestion.service";
import { ConflictError, ValidationError } from "../organization-errors";
import type { IWorkSuggestion } from "@semantask/db/models/WorkSuggestion";
import type { ITask } from "@semantask/db/models/Task";

const messageId = new Types.ObjectId().toString();
const conversationId = new Types.ObjectId().toString();
const organizationId = new Types.ObjectId().toString();
const suggestionId = new Types.ObjectId().toString();
const taskId = new Types.ObjectId().toString();
const actorUserId = new Types.ObjectId().toString();

function buildSuggestion(overrides: Partial<IWorkSuggestion> = {}): IWorkSuggestion {
    const now = new Date("2026-08-08T10:00:00.000Z");
    return {
        _id: new Types.ObjectId(suggestionId),
        messageId: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
        intentId: null,
        status: "proposed",
        title: "Follow up with the team",
        summary: "Suggested from chat",
        confidence: 0.9,
        candidates: {
            assigneeCandidates: [],
            dueAtCandidate: null,
            priorityCandidate: "",
        },
        dismissReason: null,
        convertedTaskId: null,
        extractorVersion: "intelligent-v7",
        createdAt: now,
        updatedAt: now,
        ...overrides,
    } as IWorkSuggestion;
}

function buildTask(overrides: Partial<ITask> = {}): ITask {
    const now = new Date("2026-08-08T10:00:00.000Z");
    return {
        _id: new Types.ObjectId(taskId),
        conversationId: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
        parentTaskId: null,
        suggestionId: new Types.ObjectId(suggestionId),
        title: "Follow up with the team",
        description: "Suggested from chat",
        status: "pending",
        lifecycleState: "ready",
        priority: "medium",
        assignees: [],
        dueAt: null,
        createdBy: new Types.ObjectId(actorUserId),
        source: "ai",
        sourceMessageIds: [new Types.ObjectId(messageId)],
        latestContextMessageId: new Types.ObjectId(messageId),
        confidence: 0.9,
        tags: ["work-suggestion"],
        dedupeKey: `suggestion.accept::${suggestionId}`,
        subTasks: [],
        dependencyIds: [],
        retryCount: 0,
        maxRetries: 2,
        iterationCount: 0,
        progress: 0,
        checkpoints: [],
        executionHistory: { attempts: 0, failures: 0, results: [] },
        result: { success: false, confidence: 0, evidence: null },
        version: 1,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    } as ITask;
}

describe("work-suggestion mutations", () => {
    let infoSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        suggestionFindById.mockReset();
        suggestionFindOneAndUpdate.mockReset();
        taskFindOne.mockReset();
        taskFindById.mockReset();
        taskDeleteOne.mockReset();
        createTask.mockReset();
        updateTask.mockReset();
        enqueueOutboxEvent.mockReset();
        assertAcceptCreatesCoordinationOnly.mockReset();
        suggestionsAcceptedCounter.inc.mockReset();
        suggestionsDismissedCounter.inc.mockReset();
        acceptToTaskLatencyMs.observe.mockReset();
        assertAcceptCreatesCoordinationOnly.mockImplementation(() => undefined);
        enqueueOutboxEvent.mockResolvedValue({});
        taskDeleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) });
        infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    });

    afterEach(() => {
        infoSpy.mockRestore();
    });

    describe("acceptWorkSuggestion", () => {
        it("creates a coordination task, converts suggestion, and never enqueues execution", async () => {
            const proposed = buildSuggestion();
            const task = buildTask();
            const converted = buildSuggestion({
                status: "converted",
                convertedTaskId: new Types.ObjectId(taskId),
            });

            suggestionFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(proposed) });
            taskFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            createTask.mockResolvedValue(task);
            suggestionFindOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(converted),
            });

            const result = await acceptWorkSuggestion({
                suggestionId,
                actorUserId,
            });

            expect(result.suggestion.status).toBe("converted");
            expect(result.suggestion.convertedTaskId).toBe(taskId);
            expect(result.task._id).toBe(taskId);
            expect(result.task.suggestionId).toBe(suggestionId);
            expect(createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    suggestionId,
                    dedupeKey: `suggestion.accept::${suggestionId}`,
                    source: "ai",
                    lifecycleState: "ready",
                })
            );
            expect(enqueueOutboxEvent).toHaveBeenCalledTimes(2);
            expect(enqueueOutboxEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: "work.suggestion.accepted",
                    dedupeKey: `work.suggestion.accepted:${suggestionId}`,
                    payload: expect.objectContaining({
                        suggestionId,
                        taskId,
                        conversationId,
                        organizationId,
                        actorUserId,
                    }),
                })
            );
            expect(enqueueOutboxEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: "task.created",
                })
            );
            const topics = enqueueOutboxEvent.mock.calls.map(
                (call) => (call[0] as { topic: string }).topic
            );
            expect(topics).toContain("work.suggestion.accepted");
            expect(topics).toContain("task.created");
            expect(topics).not.toContain("task.execution.requested");
            expect(topics).not.toContain("task.execution.approved");
            expect(suggestionsAcceptedCounter.inc).toHaveBeenCalledTimes(1);
            expect(acceptToTaskLatencyMs.observe).toHaveBeenCalledWith(expect.any(Number));
            const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
            expect(payload.event).toBe("suggestion.converted");
        });

        it("refuses when ACCEPT_CREATES_EXECUTION rail fails closed", async () => {
            assertAcceptCreatesCoordinationOnly.mockImplementation(() => {
                throw new ConflictError("ACCEPT_CREATES_EXECUTION is enabled");
            });

            await expect(
                acceptWorkSuggestion({ suggestionId, actorUserId })
            ).rejects.toBeInstanceOf(ConflictError);

            expect(createTask).not.toHaveBeenCalled();
            expect(suggestionFindOneAndUpdate).not.toHaveBeenCalled();
            expect(enqueueOutboxEvent).not.toHaveBeenCalled();
        });

        it("keeps suggestion proposed when task creation fails", async () => {
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(buildSuggestion()),
            });
            taskFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            createTask.mockRejectedValue(new Error("db write failed"));

            await expect(
                acceptWorkSuggestion({ suggestionId, actorUserId })
            ).rejects.toThrow("db write failed");

            expect(suggestionFindOneAndUpdate).not.toHaveBeenCalled();
            expect(enqueueOutboxEvent).not.toHaveBeenCalled();
        });

        it("is idempotent when already converted", async () => {
            const converted = buildSuggestion({
                status: "converted",
                convertedTaskId: new Types.ObjectId(taskId),
            });
            const task = buildTask();
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(converted),
            });
            taskFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(task) });

            const result = await acceptWorkSuggestion({ suggestionId, actorUserId });

            expect(result.task._id).toBe(taskId);
            expect(createTask).not.toHaveBeenCalled();
            expect(enqueueOutboxEvent).not.toHaveBeenCalled();
            expect(suggestionsAcceptedCounter.inc).not.toHaveBeenCalled();
            expect(acceptToTaskLatencyMs.observe).not.toHaveBeenCalled();
        });

        it("rejects dismiss-to-accept conflict", async () => {
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(buildSuggestion({ status: "dismissed" })),
            });

            await expect(
                acceptWorkSuggestion({ suggestionId, actorUserId })
            ).rejects.toBeInstanceOf(ConflictError);
            expect(createTask).not.toHaveBeenCalled();
        });

        it("discards orphan task when dismiss wins the accept CAS", async () => {
            const proposed = buildSuggestion();
            const dismissed = buildSuggestion({ status: "dismissed", dismissReason: "Nope" });
            const task = buildTask();
            suggestionFindById
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(proposed) })
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(dismissed) })
                // discardOrphan re-reads suggestion; dismissed is not linked to the task
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(dismissed) });
            taskFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            createTask.mockResolvedValue(task);
            suggestionFindOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            });

            await expect(
                acceptWorkSuggestion({ suggestionId, actorUserId })
            ).rejects.toBeInstanceOf(ConflictError);

            expect(taskDeleteOne).toHaveBeenCalledWith({
                _id: task._id,
                dedupeKey: `suggestion.accept::${suggestionId}`,
            });
            expect(enqueueOutboxEvent).not.toHaveBeenCalled();
        });

        it("does not delete a task that a concurrent accept already linked", async () => {
            const proposed = buildSuggestion();
            const converted = buildSuggestion({
                status: "converted",
                convertedTaskId: new Types.ObjectId(taskId),
            });
            const task = buildTask();
            suggestionFindById
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(proposed) })
                // CAS lost to a different status race read that is not our task yet
                .mockReturnValueOnce({
                    exec: jest.fn().mockResolvedValue(
                        buildSuggestion({ status: "dismissed", dismissReason: "stale" })
                    ),
                })
                // discard check sees a concurrent accept already linked this task
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(converted) });
            taskFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            createTask.mockResolvedValue(task);
            suggestionFindOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            });

            await expect(
                acceptWorkSuggestion({ suggestionId, actorUserId })
            ).rejects.toBeInstanceOf(ConflictError);

            expect(taskDeleteOne).not.toHaveBeenCalled();
        });
    });

    describe("dismissWorkSuggestion", () => {
        it("CAS dismisses a proposed suggestion with reason", async () => {
            const proposed = buildSuggestion();
            const dismissed = buildSuggestion({
                status: "dismissed",
                dismissReason: "Not actionable",
            });
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(proposed),
            });
            suggestionFindOneAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(dismissed),
            });

            const result = await dismissWorkSuggestion({
                suggestionId,
                actorUserId,
                reason: "Not actionable",
            });

            expect(result.status).toBe("dismissed");
            expect(result.dismissReason).toBe("Not actionable");
            expect(suggestionFindOneAndUpdate).toHaveBeenCalledWith(
                { _id: proposed._id, status: "proposed" },
                { $set: { status: "dismissed", dismissReason: "Not actionable" } },
                { new: true }
            );
            expect(enqueueOutboxEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    topic: "work.suggestion.dismissed",
                    dedupeKey: `work.suggestion.dismissed:${suggestionId}`,
                    payload: expect.objectContaining({
                        suggestionId,
                        conversationId,
                        organizationId,
                        actorUserId,
                        dismissReason: "Not actionable",
                    }),
                })
            );
            const topics = enqueueOutboxEvent.mock.calls.map(
                (call) => (call[0] as { topic: string }).topic
            );
            expect(topics).not.toContain("task.execution.requested");
            expect(topics).not.toContain("task.execution.approved");
            expect(suggestionsDismissedCounter.inc).toHaveBeenCalledTimes(1);
            const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
            expect(payload.event).toBe("suggestion.dismissed");
        });

        it("rejects dismiss after conversion", async () => {
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(
                    buildSuggestion({
                        status: "converted",
                        convertedTaskId: new Types.ObjectId(taskId),
                    })
                ),
            });

            await expect(
                dismissWorkSuggestion({
                    suggestionId,
                    actorUserId,
                    reason: "too late",
                })
            ).rejects.toBeInstanceOf(ConflictError);
        });

        it("requires a dismiss reason", async () => {
            await expect(
                dismissWorkSuggestion({
                    suggestionId,
                    actorUserId,
                    reason: "   ",
                })
            ).rejects.toBeInstanceOf(ValidationError);
        });
    });

    describe("assignWorkSuggestion", () => {
        it("updates converted task assignees without execution enqueue", async () => {
            const assignee = new Types.ObjectId().toString();
            const converted = buildSuggestion({
                status: "converted",
                convertedTaskId: new Types.ObjectId(taskId),
            });
            const updatedTask = buildTask({
                assignees: [new Types.ObjectId(assignee)],
                version: 2,
                updatedAt: new Date("2026-08-08T11:00:00.000Z"),
            });

            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(converted),
            });
            updateTask.mockResolvedValue(updatedTask);

            const result = await assignWorkSuggestion({
                suggestionId,
                actorUserId,
                assignees: [assignee],
                priority: "high",
            });

            expect(result.task.assignees).toEqual([assignee]);
            expect(updateTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskId,
                    assignees: [assignee],
                    priority: "high",
                    updatedBy: actorUserId,
                })
            );
            expect(enqueueOutboxEvent).toHaveBeenCalledWith(
                expect.objectContaining({ topic: "task.updated" })
            );
            const topics = enqueueOutboxEvent.mock.calls.map(
                (call) => (call[0] as { topic: string }).topic
            );
            expect(topics).not.toContain("task.execution.requested");
        });

        it("rejects assign before conversion", async () => {
            suggestionFindById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(buildSuggestion({ status: "proposed" })),
            });

            await expect(
                assignWorkSuggestion({
                    suggestionId,
                    actorUserId,
                    assignees: [actorUserId],
                })
            ).rejects.toBeInstanceOf(ConflictError);
            expect(updateTask).not.toHaveBeenCalled();
        });
    });
});
