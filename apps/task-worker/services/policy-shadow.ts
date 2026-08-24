import TaskModel from "@semantask/db/models/Task";
import type { ExecutionEvent, ExecutionState } from "@semantask/types";
import {
    appendShadowHistory,
    createQueuedShadowState,
    reduceShadowExecutionEvent,
    resolveCurrentShadowState,
    type ShadowExecutionStateHistoryEntry,
} from "./execution-state-shadow.js";
import { isPolicyShadowEmitEnabled } from "../config/migration.js";
import { logExecution } from "./execution-logger.js";
import { maybeLogTaskStateDivergence } from "./state-divergence-check.js";
import { applyLifecycleProjection } from "./state-projection.js";

/**
 * Policy early-return paths in `processTaskExecutionRequested` (blocked / approval)
 * historically updated only the legacy fields, leaving the shadow FSM stale.
 * These paths always emit the matching `POLICY_BLOCKED` / `POLICY_APPROVAL_REQUIRED`
 * events and keep the legacy `lifecycleState` aligned with the FSM projection.
 */
export { isPolicyShadowEmitEnabled };

function baselineForPolicyEvaluation(executionState: unknown): ExecutionState {
    const current = resolveCurrentShadowState(executionState);
    // Policy evaluation always begins a fresh request; POLICY_EVALUATE is only legal
    // from `queued`, so normalize any non-queued prior state to a fresh queued baseline.
    return current.kind === "queued" ? current : createQueuedShadowState();
}

export interface EmitPolicyShadowStateInput {
    taskId: string;
    events: ExecutionEvent[];
    workerId?: string;
    source?: string;
}

/**
 * Applies the given execution events to the task's shadow FSM and persists the
 * resulting `executionState` + `stateHistory` together with an aligned legacy
 * `lifecycleState`. Always on in the authoritative FSM stage.
 */
export async function emitPolicyShadowState(input: EmitPolicyShadowStateInput): Promise<boolean> {
    if (!isPolicyShadowEmitEnabled() || input.events.length === 0) {
        return false;
    }

    const task = await TaskModel.findById(input.taskId);
    if (!task) {
        return false;
    }

    let current = baselineForPolicyEvaluation(task.executionState);
    let history: ShadowExecutionStateHistoryEntry[] = (
        Array.isArray(task.stateHistory) ? task.stateHistory : []
    ) as unknown as ShadowExecutionStateHistoryEntry[];

    for (const event of input.events) {
        const result = reduceShadowExecutionEvent({
            current,
            event,
            workerId: input.workerId ?? null,
        });

        current = result.to;
        history = appendShadowHistory(history, result.historyEntry);

        logExecution(result.ok ? "info" : "warn", {
            event: result.ok
                ? "execution.fsm_shadow.transition"
                : "execution.fsm_shadow.invalid_transition",
            workerId: input.workerId,
            taskId: input.taskId,
            transitionEvent: event.type,
            from: result.from.kind,
            to: result.to.kind,
            source: input.source ?? "policy_shadow",
            ...(result.ok ? {} : { error: result.error.message }),
        });
    }

    task.executionState = current as unknown as typeof task.executionState;
    task.stateHistory = history as unknown as typeof task.stateHistory;
    applyLifecycleProjection(task, input.source ?? "policy_shadow", {
        treatOffAs: "enforce",
        workerId: input.workerId,
    });

    try {
        await task.save();
    } catch (error) {
        logExecution("warn", {
            event: "execution.fsm_shadow.persist_failed",
            workerId: input.workerId,
            taskId: input.taskId,
            source: input.source ?? "policy_shadow",
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }

    maybeLogTaskStateDivergence({
        taskId: input.taskId,
        lifecycleState: task.lifecycleState,
        executionState: task.executionState,
        workerId: input.workerId,
        source: input.source ?? "policy_shadow",
    });

    return true;
}
