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
    /**
     * Explicit manager "Allow AI tools" / request-execution path.
     * Not a leaked ingress enqueue — allowed under suggest_only + SUGGESTION_BLOCK_EXEC.
     */
    explicitManagerRequest?: boolean;
};

export type EnqueueTaskExecutionRequestedResult = {
    enqueued: boolean;
    blocked: boolean;
};

/**
 * Enqueue boundary for task.execution.requested.
 * Refuse writes when suggestion ingress is on and suggest_only + SUGGESTION_BLOCK_EXEC,
 * unless this is an explicit manager request (S2.4).
 * When ingress is disabled, enqueue proceeds (legacy path).
 */
export async function enqueueTaskExecutionRequested(
    input: EnqueueTaskExecutionRequestedInput
): Promise<EnqueueTaskExecutionRequestedResult> {
    const explicitManagerRequest = input.explicitManagerRequest === true
        || input.payload.explicitManagerRequest === true;

    if (
        !explicitManagerRequest
        && isSuggestionIngressEnabled()
        && shouldBlockExecutionEnqueue(input.executionMode)
    ) {
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
        payload: explicitManagerRequest
            ? { ...input.payload, explicitManagerRequest: true }
            : input.payload,
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
