import type { ExecutionMode } from "@semantask/types";
import { ConflictError } from "../organization-errors";
import { isEnvFlagEnabled } from "./parse";

export type ClassifierMode = "regex" | "shadow" | "llm";

/** WorkSuggestion ingress is always on. Env `SUGGESTION_INGRESS` is not read. */
export function isSuggestionIngressEnabled(): boolean {
    return true;
}

/** True when execution enqueue must be refused for the given effective mode. */
export function shouldBlockExecutionEnqueue(executionMode: ExecutionMode): boolean {
    return executionMode === "suggest_only";
}

/**
 * ACCEPT_CREATES_EXECUTION=0|1 (default 0).
 * Must stay 0 so suggestion accept creates coordination Tasks only.
 */
export function isAcceptCreatesExecutionEnabled(raw?: string | null): boolean {
    return isEnvFlagEnabled(raw ?? process.env.ACCEPT_CREATES_EXECUTION, false);
}

/** Fail closed when accept would be allowed to enqueue execution. */
export function assertAcceptCreatesCoordinationOnly(raw?: string | null): void {
    if (isAcceptCreatesExecutionEnabled(raw)) {
        throw new ConflictError(
            "ACCEPT_CREATES_EXECUTION is enabled; coordination-only accept is refused"
        );
    }
}

/** WORK_INBOX_UI=0|1 (default 1). Expose /inbox manager surface. */
export function isWorkInboxUiEnabled(raw?: string | null): boolean {
    return isEnvFlagEnabled(raw ?? process.env.WORK_INBOX_UI, true);
}

/** TASK_CLASSIFIER_MODE: regex (default) | shadow | llm. */
export function getClassifierMode(raw?: string | null): ClassifierMode {
    const value = (raw ?? process.env.TASK_CLASSIFIER_MODE ?? "regex").trim().toLowerCase();
    if (value === "shadow" || value === "llm") {
        return value;
    }
    return "regex";
}
