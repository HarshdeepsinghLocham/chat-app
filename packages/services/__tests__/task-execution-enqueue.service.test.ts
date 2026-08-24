import { beforeEach, describe, expect, it } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@semantask/db/models/OrganizationPolicy", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
    EXECUTION_MODES: ["suggest_only", "require_approval", "auto_execute"],
    PROMPT_GUARD_MODES: ["off", "monitor", "enforce"],
}));

jest.mock("../organization.service", () => ({
    assertCanManageMembers: jest.fn().mockResolvedValue(undefined),
    assertMembership: jest.fn().mockResolvedValue(undefined),
}));

const enqueueOutboxEvent = jest.fn();
const executionEnqueueAttemptedWhileSuggestOnlyCounter = {
    inc: jest.fn(),
};
const acceptExecutionEnqueueAttemptedWhileDisabledCounter = {
    inc: jest.fn(),
};

jest.mock("../outbox.service", () => ({
    enqueueOutboxEvent: (...args: unknown[]) => enqueueOutboxEvent(...args),
}));

jest.mock("@semantask/observability/metrics", () => ({
    executionEnqueueAttemptedWhileSuggestOnlyCounter,
    acceptExecutionEnqueueAttemptedWhileDisabledCounter,
}));

import {
    enqueueTaskExecutionRequested,
    recordSuggestOnlyExecutionEnqueueAttempt,
    shouldFailClosedOnLeakedExecution,
    SUGGESTION_ACCEPT_EXECUTION_SOURCE,
} from "../task-execution-enqueue.service";

beforeEach(() => {
    enqueueOutboxEvent.mockReset();
    executionEnqueueAttemptedWhileSuggestOnlyCounter.inc.mockReset();
    acceptExecutionEnqueueAttemptedWhileDisabledCounter.inc.mockReset();
});

describe("enqueueTaskExecutionRequested", () => {
    it("blocks enqueue under suggest_only", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:m1:none",
            payload: {
                taskId: "t1",
                conversationId: "c1",
                triggerMessageId: "m1",
            },
            executionMode: "suggest_only",
        });

        expect(result).toEqual({ enqueued: false, blocked: true });
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).toHaveBeenCalledTimes(1);
        const log = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
        expect(log.event).toBe("execution.enqueue.suggest_only_invariant");
        errorSpy.mockRestore();
    });

    it("enqueues when mode is auto_execute", async () => {
        enqueueOutboxEvent.mockResolvedValue({ _id: "evt-1" });

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:m1:none",
            payload: { taskId: "t1", conversationId: "c1" },
            executionMode: "auto_execute",
        });

        expect(result).toEqual({ enqueued: true, blocked: false });
        expect(enqueueOutboxEvent).toHaveBeenCalledWith({
            topic: "task.execution.requested",
            dedupeKey: "task.execution.requested:t1:m1:none",
            payload: { taskId: "t1", conversationId: "c1" },
            session: undefined,
        });
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).not.toHaveBeenCalled();
    });

    it("allows explicit manager request under suggest_only", async () => {
        enqueueOutboxEvent.mockResolvedValue({ _id: "evt-1" });

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:explicit:u1",
            payload: {
                taskId: "t1",
                conversationId: "c1",
                explicitManagerRequest: true,
                needsApproval: true,
            },
            executionMode: "suggest_only",
            explicitManagerRequest: true,
        });

        expect(result).toEqual({ enqueued: true, blocked: false });
        expect(enqueueOutboxEvent).toHaveBeenCalled();
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).not.toHaveBeenCalled();
    });

    it("always blocks suggestion.accept enqueue and records metric", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:accept-leak",
            payload: {
                taskId: "t1",
                conversationId: "c1",
                source: SUGGESTION_ACCEPT_EXECUTION_SOURCE,
            },
            executionMode: "auto_execute",
            source: SUGGESTION_ACCEPT_EXECUTION_SOURCE,
        });

        expect(result).toEqual({ enqueued: false, blocked: true });
        expect(enqueueOutboxEvent).not.toHaveBeenCalled();
        expect(acceptExecutionEnqueueAttemptedWhileDisabledCounter.inc).toHaveBeenCalledTimes(1);
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).not.toHaveBeenCalled();
        const log = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
        expect(log.event).toBe("execution.enqueue.accept_while_disabled_invariant");
        expect(log.source).toBe(SUGGESTION_ACCEPT_EXECUTION_SOURCE);
        errorSpy.mockRestore();
    });
});

describe("shouldFailClosedOnLeakedExecution", () => {
    it("is true only for suggest_only", () => {
        expect(shouldFailClosedOnLeakedExecution("suggest_only")).toBe(true);
        expect(shouldFailClosedOnLeakedExecution("require_approval")).toBe(false);
        expect(shouldFailClosedOnLeakedExecution("auto_execute")).toBe(false);
    });
});

describe("recordSuggestOnlyExecutionEnqueueAttempt", () => {
    it("increments metric and logs invariant", () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        recordSuggestOnlyExecutionEnqueueAttempt({
            taskId: "t1",
            conversationId: "c1",
            triggerMessageId: "m1",
            executionMode: "suggest_only",
            source: "processTaskExecutionRequested.leaked",
        });
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).toHaveBeenCalledTimes(1);
        const log = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
        expect(log.leakedOutboxEvent).toBe(true);
        expect(log.source).toBe("processTaskExecutionRequested.leaked");
        errorSpy.mockRestore();
    });
});
