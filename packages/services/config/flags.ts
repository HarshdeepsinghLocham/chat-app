import type { ExecutionMode } from "@semantask/types";

export type ClassifierMode = "regex" | "shadow" | "llm";

/** WorkSuggestion ingress is always on. Env `SUGGESTION_INGRESS` is not read. */
export function isSuggestionIngressEnabled(): boolean {
    return true;
}

/** True when execution enqueue must be refused for the given effective mode. */
export function shouldBlockExecutionEnqueue(executionMode: ExecutionMode): boolean {
    return executionMode === "suggest_only";
}

/** Accept never creates execution. Env `ACCEPT_CREATES_EXECUTION` is not read. */
export function isAcceptCreatesExecutionEnabled(): boolean {
    return false;
}

/** Kept at accept call sites. No-op: the dangerous env cannot be turned on. */
export function assertAcceptCreatesCoordinationOnly(): void {
    // coordination-only accept is the only path
}

/** Work Inbox `/inbox` is always on. Env `WORK_INBOX_UI` is not read. */
export function isWorkInboxUiEnabled(): boolean {
    return true;
}

/** TASK_CLASSIFIER_MODE: regex (default) | shadow | llm. */
export function getClassifierMode(raw?: string | null): ClassifierMode {
    const value = (raw ?? process.env.TASK_CLASSIFIER_MODE ?? "regex").trim().toLowerCase();
    if (value === "shadow" || value === "llm") {
        return value;
    }
    return "regex";
}
