import mongoose from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import TaskActionModel from "@semantask/db/models/TaskAction";
import { Conversation } from "@semantask/db/models/Conversation";
import {
    HIGH_RISK_TOOLS,
    isHighRiskToolName,
} from "@semantask/db/models/ToolGrant";
import {
    BOARD_STATUSES,
    resolveBoardStatus,
    type BoardStatus,
    type WorkSummary,
    type WorkSummaryApprovalBucket,
    type WorkSummaryApprovalRow,
} from "@semantask/types";
import { ValidationError } from "./organization-errors";
import { boardStatusQuery, isValidObjectId } from "./work-board.service";

export const WORK_SUMMARY_AGING_MS = 24 * 60 * 60 * 1000;
const OLDEST_LIMIT = 5;

type PendingActionDoc = {
    _id: mongoose.Types.ObjectId;
    taskId: mongoose.Types.ObjectId;
    conversationId: mongoose.Types.ObjectId;
    toolName?: string | null;
    actionType: string;
    createdAt: Date;
};

function openBoardStatusOrClause(): Record<string, unknown>[] {
    const todo = boardStatusQuery("todo") as { $or: Record<string, unknown>[] };
    const doing = boardStatusQuery("doing") as { $or: Record<string, unknown>[] };
    return [...todo.$or, ...doing.$or];
}

function orgTaskFilter(organizationId: string): Record<string, unknown> {
    return { organizationId: new mongoose.Types.ObjectId(organizationId) };
}

function percentile(sortedValues: number[], p: number): number | null {
    if (sortedValues.length === 0) return null;
    if (sortedValues.length === 1) return sortedValues[0];
    const index = (sortedValues.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computeOpenAgeMs(ages: number[]): { p50: number; p95: number } | null {
    if (ages.length === 0) return null;
    const sorted = [...ages].sort((left, right) => left - right);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    if (p50 == null || p95 == null) return null;
    return { p50: Math.round(p50), p95: Math.round(p95) };
}

function isHighRiskPendingAction(action: Pick<PendingActionDoc, "toolName" | "actionType">): boolean {
    if (action.toolName && isHighRiskToolName(action.toolName)) {
        return true;
    }
    return (HIGH_RISK_TOOLS as readonly string[]).includes(action.actionType);
}

function serializeApprovalRow(action: PendingActionDoc): WorkSummaryApprovalRow {
    return {
        _id: action._id.toString(),
        taskId: action.taskId.toString(),
        toolName: action.toolName ?? null,
        createdAt: new Date(action.createdAt).toISOString(),
        conversationId: action.conversationId.toString(),
    };
}

function buildApprovalBucket(
    pendingActions: PendingActionDoc[],
    agingCutoff: Date
): WorkSummaryApprovalBucket {
    const agingActions = pendingActions.filter(
        (action) => new Date(action.createdAt).getTime() < agingCutoff.getTime()
    );
    const oldest = [...pendingActions]
        .sort(
            (left, right) =>
                new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        )
        .slice(0, OLDEST_LIMIT)
        .map(serializeApprovalRow);

    return {
        pending: pendingActions.length,
        aging: agingActions.length,
        oldest,
    };
}

export async function getOrganizationWorkSummary(organizationId: string): Promise<WorkSummary> {
    await connectToDatabase();

    if (!isValidObjectId(organizationId)) {
        throw new ValidationError("Invalid organizationId");
    }

    const orgFilter = orgTaskFilter(organizationId);
    const openOr = openBoardStatusOrClause();
    const now = new Date();
    const agingCutoff = new Date(now.getTime() - WORK_SUMMARY_AGING_MS);

    const [todoCount, doingCount, doneCount, overdueCount, openAgeRows, oldestTasks, conversations] =
        await Promise.all([
            TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("todo") }),
            TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("doing") }),
            TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("done") }),
            TaskModel.countDocuments({
                ...orgFilter,
                $or: openOr,
                dueAt: { $ne: null, $lt: now },
            }),
            TaskModel.find({ ...orgFilter, $or: openOr })
                .select("createdAt")
                .lean<{ createdAt: Date }[]>(),
            TaskModel.find({ ...orgFilter, $or: openOr })
                .sort({ dueAt: 1, createdAt: 1 })
                .limit(OLDEST_LIMIT)
                .select("_id title boardStatus status dueAt conversationId createdAt")
                .lean<
                    Array<{
                        _id: mongoose.Types.ObjectId;
                        title: string;
                        boardStatus?: BoardStatus | null;
                        status: string;
                        dueAt?: Date | null;
                        conversationId: mongoose.Types.ObjectId;
                        createdAt: Date;
                    }>
                >(),
            Conversation.find({ organizationId: orgFilter.organizationId })
                .select("_id")
                .lean<{ _id: mongoose.Types.ObjectId }[]>(),
        ]);

    const openAgesMs = openAgeRows.map(
        (row) => now.getTime() - new Date(row.createdAt).getTime()
    );

    const counts = {
        todo: todoCount,
        doing: doingCount,
        done: doneCount,
    } satisfies Record<BoardStatus, number>;

    for (const status of BOARD_STATUSES) {
        if (typeof counts[status] !== "number") {
            counts[status] = 0;
        }
    }

    let pendingActions: PendingActionDoc[] = [];
    if (conversations.length > 0) {
        const conversationIds = conversations.map((conversation) => conversation._id);
        pendingActions = await TaskActionModel.find({
            executionState: "approval_pending",
            conversationId: { $in: conversationIds },
        })
            .select("_id taskId conversationId toolName actionType createdAt")
            .lean<PendingActionDoc[]>();
    }

    const highRiskPendingActions = pendingActions.filter(isHighRiskPendingAction);

    return {
        openWork: {
            counts,
            overdue: overdueCount,
            openAgeMs: computeOpenAgeMs(openAgesMs),
            oldest: oldestTasks.map((task) => ({
                _id: task._id.toString(),
                title: task.title,
                boardStatus: resolveBoardStatus({
                    boardStatus: task.boardStatus,
                    status: task.status as Parameters<typeof resolveBoardStatus>[0]["status"],
                }),
                dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
                conversationId: task.conversationId.toString(),
                createdAt: new Date(task.createdAt).toISOString(),
            })),
        },
        agingApprovals: buildApprovalBucket(pendingActions, agingCutoff),
        highRiskPending: buildApprovalBucket(highRiskPendingActions, agingCutoff),
        generatedAt: now.toISOString(),
    };
}
