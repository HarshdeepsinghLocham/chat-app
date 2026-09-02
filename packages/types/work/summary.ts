import type { BoardStatus } from "../task/task.js";
import type { UserRef } from "../user/user.js";

export type WorkSummaryOpenTaskRow = {
    _id: string;
    title: string;
    boardStatus: BoardStatus;
    dueAt: string | null;
    conversationId: string;
    conversationLabel?: string | null;
    createdAt: string;
    assignees?: string[];
    assigneeRefs?: UserRef[];
};

export type WorkSummaryApprovalRow = {
    _id: string;
    taskId: string;
    toolName: string | null;
    createdAt: string;
    conversationId: string;
};

export type WorkSummaryApprovalBucket = {
    pending: number;
    aging: number;
    oldest: WorkSummaryApprovalRow[];
};

export type WorkSummaryOpenWork = {
    counts: Record<BoardStatus, number>;
    overdue: number;
    openAgeMs: { p50: number; p95: number } | null;
    oldest: WorkSummaryOpenTaskRow[];
};

export type WorkSummaryAttentionCounts = {
    members: number;
    open: number;
    overdue: number;
    blocked: number;
    unassigned: number;
    awaitingConfirmation: number;
};

export type WorkSummaryOwnerBucket = {
    user: UserRef;
    openCount: number;
};

export type WorkSummarySuggestionRow = {
    _id: string;
    title: string;
    conversationId: string;
    conversationLabel?: string | null;
    createdAt: string;
};

export type WorkSummaryAttention = {
    counts: WorkSummaryAttentionCounts;
    overdue: WorkSummaryOpenTaskRow[];
    blocked: WorkSummaryOpenTaskRow[];
    unassigned: WorkSummaryOpenTaskRow[];
    awaitingConfirmation: WorkSummarySuggestionRow[];
    recentlyCreated: WorkSummaryOpenTaskRow[];
    byOwner: WorkSummaryOwnerBucket[];
};

export type WorkSummary = {
    openWork: WorkSummaryOpenWork;
    agingApprovals: WorkSummaryApprovalBucket;
    highRiskPending: WorkSummaryApprovalBucket;
    /** Actionable manager glance queues (additive). */
    attention?: WorkSummaryAttention;
    generatedAt: string;
};
