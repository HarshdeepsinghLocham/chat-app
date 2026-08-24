import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionState } from "@semantask/types";
import { taskLifecycleMatchesExecutionProjection } from "@semantask/types";
import {
    detectTaskStateDivergence,
    isTaskStateDivergenceCheckEnabled,
    maybeLogTaskStateDivergence,
} from "../services/state-divergence-check.js";

const succeeded: ExecutionState = {
    kind: "succeeded",
    finishedAt: "2026-07-01T00:00:00.000Z",
    runId: "run-1",
    result: { confidence: 1, summary: "done", evidence: null },
};

test("taskLifecycleMatchesExecutionProjection aligns succeeded with completed", () => {
    assert.equal(taskLifecycleMatchesExecutionProjection("completed", succeeded), true);
});

test("detectTaskStateDivergence returns null when lifecycle matches projection", () => {
    const result = detectTaskStateDivergence("completed", succeeded);
    assert.equal(result, null);
});

test("detectTaskStateDivergence reports mismatch between legacy and FSM", () => {
    const reasoning: ExecutionState = {
        kind: "reasoning",
        iteration: 1,
        runId: "run-1",
        workerId: "worker-1",
        leaseExpiresAt: "2026-07-01T00:05:00.000Z",
    };

    const result = detectTaskStateDivergence("ready", reasoning);
    assert.ok(result);
    assert.equal(result.lifecycleState, "ready");
    assert.equal(result.executionStateKind, "reasoning");
    assert.equal(result.projectedLifecycleState, "executing");
});

test("detectTaskStateDivergence skips when executionState is missing or invalid", () => {
    assert.equal(detectTaskStateDivergence("ready", null), null);
    assert.equal(detectTaskStateDivergence("ready", { kind: "not_a_state" }), null);
    assert.equal(detectTaskStateDivergence(undefined, succeeded), null);
});

test("maybeLogTaskStateDivergence returns false when lifecycle matches projection", () => {
    assert.equal(isTaskStateDivergenceCheckEnabled(), true);
    assert.equal(
        maybeLogTaskStateDivergence({
            taskId: "task-1",
            lifecycleState: "completed",
            executionState: succeeded,
        }),
        false
    );
});

test("maybeLogTaskStateDivergence returns true on divergence", () => {
    assert.equal(isTaskStateDivergenceCheckEnabled(), true);
    assert.equal(
        maybeLogTaskStateDivergence({
            taskId: "task-diverged",
            lifecycleState: "ready",
            executionState: succeeded,
            workerId: "worker-1",
            runId: "run-1",
            source: "test",
        }),
        true
    );
});
