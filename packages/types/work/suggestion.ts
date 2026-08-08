import type { TaskPriority } from "../task/task.js";

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

/**
 * Reviewable proposed work extracted from a message.
 * Distinct from MessageIntent (facts) and Task (committed work).
 */
export interface WorkSuggestionRecord {
    _id: string;
    messageId: string;
    conversationId: string;
    organizationId: string | null;
    intentId: string | null;
    status: WorkSuggestionStatus;
    title: string;
    summary: string;
    confidence: number;
    candidates: WorkSuggestionCandidates;
    dismissReason: string | null;
    convertedTaskId: string | null;
    extractorVersion: string;
    createdAt: string;
    updatedAt: string;
}
