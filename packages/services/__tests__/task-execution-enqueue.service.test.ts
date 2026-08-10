import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

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

jest.mock("../outbox.service", () => ({
    enqueueOutboxEvent: (...args: unknown[]) => enqueueOutboxEvent(...args),
}));

jest.mock("@semantask/observability/metrics", () => ({
    executionEnqueueAttemptedWhileSuggestOnlyCounter,
}));

import {
    enqueueTaskExecutionRequested,
    recordSuggestOnlyExecutionEnqueueAttempt,
    shouldFailClosedOnLeakedExecution,
} from "../task-execution-enqueue.service";

const ENV_KEYS = ["SUGGESTION_INGRESS", "SUGGESTION_BLOCK_EXEC"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
    }
    enqueueOutboxEvent.mockReset();
    executionEnqueueAttemptedWhileSuggestOnlyCounter.inc.mockReset();
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        const value = originalEnv[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

describe("enqueueTaskExecutionRequested", () => {
    it("blocks enqueue under suggest_only when ingress and SUGGESTION_BLOCK_EXEC are on", async () => {
        process.env.SUGGESTION_INGRESS = "1";
        process.env.SUGGESTION_BLOCK_EXEC = "1";
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

    it("enqueues suggest_only when ingress is disabled even if SUGGESTION_BLOCK_EXEC is on", async () => {
        process.env.SUGGESTION_INGRESS = "0";
        process.env.SUGGESTION_BLOCK_EXEC = "1";
        enqueueOutboxEvent.mockResolvedValue({ _id: "evt-1" });

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:m1:none",
            payload: { taskId: "t1", conversationId: "c1" },
            executionMode: "suggest_only",
        });

        expect(result).toEqual({ enqueued: true, blocked: false });
        expect(enqueueOutboxEvent).toHaveBeenCalled();
        expect(executionEnqueueAttemptedWhileSuggestOnlyCounter.inc).not.toHaveBeenCalled();
    });

    it("enqueues when mode is auto_execute", async () => {
        process.env.SUGGESTION_INGRESS = "1";
        process.env.SUGGESTION_BLOCK_EXEC = "1";
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

    it("allows enqueue under suggest_only when SUGGESTION_BLOCK_EXEC=0", async () => {
        process.env.SUGGESTION_INGRESS = "1";
        process.env.SUGGESTION_BLOCK_EXEC = "0";
        enqueueOutboxEvent.mockResolvedValue({ _id: "evt-1" });

        const result = await enqueueTaskExecutionRequested({
            dedupeKey: "task.execution.requested:t1:m1:none",
            payload: { taskId: "t1" },
            executionMode: "suggest_only",
        });

        expect(result.enqueued).toBe(true);
        expect(enqueueOutboxEvent).toHaveBeenCalled();
    });

    it("allows explicit manager request under suggest_only + SUGGESTION_BLOCK_EXEC", async () => {
        process.env.SUGGESTION_INGRESS = "1";
        process.env.SUGGESTION_BLOCK_EXEC = "1";
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
});

describe("shouldFailClosedOnLeakedExecution", () => {
    it("requires ingress enabled and suggest_only block", () => {
        process.env.SUGGESTION_INGRESS = "0";
        process.env.SUGGESTION_BLOCK_EXEC = "1";
        expect(shouldFailClosedOnLeakedExecution("suggest_only")).toBe(false);

        process.env.SUGGESTION_INGRESS = "1";
        expect(shouldFailClosedOnLeakedExecution("suggest_only")).toBe(true);
        expect(shouldFailClosedOnLeakedExecution("require_approval")).toBe(false);
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
