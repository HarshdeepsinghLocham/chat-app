import type { BoardStatus } from "../task/task.js";

export type WorkSummaryOpenTaskRow = {
    _id: string;
    title: string;
    boardStatus: BoardStatus;
    dueAt: string | null;
    conversationId: string;
    createdAt: string;
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

export type WorkSummary = {
    openWork: WorkSummaryOpenWork;
    agingApprovals: WorkSummaryApprovalBucket;
    highRiskPending: WorkSummaryApprovalBucket;
    generatedAt: string;
};
