import type { ExecutionMode } from "@semantask/types";
import { executionEnqueueAttemptedWhileSuggestOnlyCounter } from "@semantask/observability/metrics";
import { enqueueOutboxEvent, type EnqueueOutboxEventInput } from "./outbox.service";
import {
    isSuggestionIngressEnabled,
    shouldBlockExecutionEnqueue,
} from "./organization-policy.service";

/** Consumer fail-closed when ingress is on and suggest_only block applies. */
export function shouldFailClosedOnLeakedExecution(executionMode: ExecutionMode): boolean {
    return isSuggestionIngressEnabled() && shouldBlockExecutionEnqueue(executionMode);
}

export type EnqueueTaskExecutionRequestedInput = {
    dedupeKey: string;
    payload: Record<string, unknown>;
    executionMode: ExecutionMode;
    session?: EnqueueOutboxEventInput["session"];
};

export type EnqueueTaskExecutionRequestedResult = {
    enqueued: boolean;
    blocked: boolean;
};

/**
 * Enqueue boundary for task.execution.requested.
 * Refuse writes when suggest_only + SUGGESTION_BLOCK_EXEC (invariant).
 */
export async function enqueueTaskExecutionRequested(
    input: EnqueueTaskExecutionRequestedInput
): Promise<EnqueueTaskExecutionRequestedResult> {
    if (shouldBlockExecutionEnqueue(input.executionMode)) {
        executionEnqueueAttemptedWhileSuggestOnlyCounter.inc();
        console.error(JSON.stringify({
            event: "execution.enqueue.suggest_only_invariant",
            dedupeKey: input.dedupeKey,
            executionMode: input.executionMode,
            taskId: typeof input.payload.taskId === "string" ? input.payload.taskId : null,
            conversationId: typeof input.payload.conversationId === "string"
                ? input.payload.conversationId
                : null,
            triggerMessageId: typeof input.payload.triggerMessageId === "string"
                ? input.payload.triggerMessageId
                : null,
        }));
        return { enqueued: false, blocked: true };
    }

    await enqueueOutboxEvent({
        topic: "task.execution.requested",
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        session: input.session,
    });

    return { enqueued: true, blocked: false };
}

/**
 * Record a leaked consumer-side attempt (event already in outbox).
 * Does not enqueue; used for defense-in-depth metrics/alerts.
 */
export function recordSuggestOnlyExecutionEnqueueAttempt(details: {
    taskId: string;
    conversationId: string;
    triggerMessageId?: string | null;
    executionMode: ExecutionMode;
    source: string;
}): void {
    executionEnqueueAttemptedWhileSuggestOnlyCounter.inc();
    console.error(JSON.stringify({
        event: "execution.enqueue.suggest_only_invariant",
        source: details.source,
        taskId: details.taskId,
        conversationId: details.conversationId,
        triggerMessageId: details.triggerMessageId ?? null,
        executionMode: details.executionMode,
        leakedOutboxEvent: true,
    }));
}
