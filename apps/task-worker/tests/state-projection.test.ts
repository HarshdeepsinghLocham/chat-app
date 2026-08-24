import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionState } from "@semantask/types";
import {
    applyLifecycleProjection,
    getTaskStateProjectionMode,
    type ProjectableTask,
} from "../services/state-projection.js";

const reasoning: ExecutionState = {
    kind: "reasoning",
    iteration: 1,
    runId: "run-1",
    workerId: "worker-1",
    leaseExpiresAt: "2026-07-01T00:05:00.000Z",
};

const succeeded: ExecutionState = {
    kind: "succeeded",
    finishedAt: "2026-07-01T00:00:00.000Z",
    runId: "run-1",
    result: { confidence: 1, summary: "done", evidence: null },
};

function makeTask(overrides?: Partial<ProjectableTask>): ProjectableTask {
    return {
        _id: { toString: () => "task-1" },
        lifecycleState: "ready",
        status: "pending",
        executionState: reasoning,
        ...overrides,
    };
}

test("getTaskStateProjectionMode is always enforce", () => {
    assert.equal(getTaskStateProjectionMode(), "enforce");
});

test("applyLifecycleProjection writes projected lifecycle and status", () => {
    const task = makeTask();
    applyLifecycleProjection(task, "test");
    assert.equal(task.lifecycleState, "executing");
    assert.equal(task.status, "executing");
});

test("applyLifecycleProjection projects succeeded to completed", () => {
    const task = makeTask({
        lifecycleState: "executing",
        status: "executing",
        executionState: succeeded,
    });
    applyLifecycleProjection(task, "test");
    assert.equal(task.lifecycleState, "completed");
    assert.equal(task.status, "completed");
});

test("applyLifecycleProjection skips invalid executionState", () => {
    const task = makeTask({ executionState: { kind: "not_a_state" } });
    applyLifecycleProjection(task, "test");
    assert.equal(task.lifecycleState, "ready");
    assert.equal(task.status, "pending");
});
