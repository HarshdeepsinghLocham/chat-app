import type { TaskExecutionActionType, TaskPriority } from "../task/task.js";

export const WORK_SUGGESTION_STATUSES = [
    "proposed",
    "accepted",
    "dismissed",
    "converted",
] as const;

export type WorkSuggestionStatus = (typeof WORK_SUGGESTION_STATUSES)[number];

export function isWorkSuggestionStatus(value: unknown): value is WorkSuggestionStatus {
    return typeof value === "string"
        && (WORK_SUGGESTION_STATUSES as readonly string[]).includes(value);
}

export interface WorkSuggestionCandidates {
    assigneeCandidates: string[];
    dueAtCandidate: string | null;
    priorityCandidate: TaskPriority | "";
}

export const SUGGESTION_EXECUTION_POLICIES = [
    "approval_required",
    "auto_execute_allowed",
    "prohibited",
] as const;

export type SuggestionExecutionPolicy = (typeof SUGGESTION_EXECUTION_POLICIES)[number];

export function isSuggestionExecutionPolicy(
    value: unknown
): value is SuggestionExecutionPolicy {
    return typeof value === "string"
        && (SUGGESTION_EXECUTION_POLICIES as readonly string[]).includes(value);
}

export const SUGGESTION_CONFIDENCE_SIGNALS = [
    "explicit_action",
    "recipient_or_object",
    "deadline",
] as const;

export type SuggestionConfidenceSignal = (typeof SUGGESTION_CONFIDENCE_SIGNALS)[number];

export type SuggestedWorkTool = Exclude<TaskExecutionActionType, "none">;

/**
 * Reviewable proposed work extracted from a message.
 * Distinct from MessageIntent (facts) and Task (committed work).
 */
export interface WorkSuggestionRecord {
    _id: string;
    messageId: string;
    conversationId: string;
    /** Human-readable conversation title when enriched for product UI. */
    conversationLabel?: string | null;
    organizationId: string | null;
    intentId: string | null;
    status: WorkSuggestionStatus;
    title: string;
    summary: string;
    confidence: number;
    /** Structured requested outcome. Summary remains populated for older clients. */
    requestedOutcome?: string | null;
    /** Consequential tool inferred from the message; null when unknown. */
    suggestedTool?: SuggestedWorkTool | null;
    /** Policy stamp at suggestion time. Enforcement still happens at execute time. */
    executionPolicy?: SuggestionExecutionPolicy | null;
    /** Deterministic extraction signals — never chain-of-thought. */
    confidenceSignals?: SuggestionConfidenceSignal[];
    /** Open task in the same conversation with the same title key; hint only. */
    possibleDuplicateTaskId?: string | null;
    candidates: WorkSuggestionCandidates;
    dismissReason: string | null;
    convertedTaskId: string | null;
    extractorVersion: string;
    createdAt: string;
    updatedAt: string;
}
