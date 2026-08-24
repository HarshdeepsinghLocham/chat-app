import type { ExecutionMode } from "@semantask/types";
import {
    acceptExecutionEnqueueAttemptedWhileDisabledCounter,
    executionEnqueueAttemptedWhileSuggestOnlyCounter,
} from "@semantask/observability/metrics";
import { enqueueOutboxEvent, type EnqueueOutboxEventInput } from "./outbox.service";
import { shouldBlockExecutionEnqueue } from "./organization-policy.service";

/** Consumer fail-closed when a leaked execution event arrives under suggest_only. */
export function shouldFailClosedOnLeakedExecution(executionMode: ExecutionMode): boolean {
    return shouldBlockExecutionEnqueue(executionMode);
}

/** Miswired accept → execution path marker (observability only when flag is off). */
export const SUGGESTION_ACCEPT_EXECUTION_SOURCE = "suggestion.accept" as const;

export type EnqueueTaskExecutionRequestedInput = {
    dedupeKey: string;
    payload: Record<string, unknown>;
    executionMode: ExecutionMode;
    session?: EnqueueOutboxEventInput["session"];
    /**
     * Explicit manager "Allow AI tools" / request-execution path.
     * Not a leaked ingress enqueue — allowed under suggest_only.
     */
    explicitManagerRequest?: boolean;
    /**
     * Call-site marker. `suggestion.accept` is always refused — accept creates
     * coordination Tasks only and never enqueues execution.
     */
    source?: string;
};

export type EnqueueTaskExecutionRequestedResult = {
    enqueued: boolean;
    blocked: boolean;
};

/**
 * Enqueue boundary for task.execution.requested.
 * Refuse writes under suggest_only unless this is an explicit manager request (S2.4).
 */
export async function enqueueTaskExecutionRequested(
    input: EnqueueTaskExecutionRequestedInput
): Promise<EnqueueTaskExecutionRequestedResult> {
    const source = input.source
        ?? (typeof input.payload.source === "string" ? input.payload.source : undefined);
    const fromSuggestionAccept = source === SUGGESTION_ACCEPT_EXECUTION_SOURCE;

    if (fromSuggestionAccept) {
        acceptExecutionEnqueueAttemptedWhileDisabledCounter.inc();
        console.error(JSON.stringify({
            event: "execution.enqueue.accept_while_disabled_invariant",
            source: SUGGESTION_ACCEPT_EXECUTION_SOURCE,
            dedupeKey: input.dedupeKey,
            executionMode: input.executionMode,
            taskId: typeof input.payload.taskId === "string" ? input.payload.taskId : null,
            conversationId: typeof input.payload.conversationId === "string"
                ? input.payload.conversationId
                : null,
            acceptCreatesExecution: false,
        }));
        return { enqueued: false, blocked: true };
    }

    const explicitManagerRequest = input.explicitManagerRequest === true
        || input.payload.explicitManagerRequest === true;

    if (
        !explicitManagerRequest
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
