import mongoose from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import TaskActionModel from "@semantask/db/models/TaskAction";
import WorkSuggestionModel from "@semantask/db/models/WorkSuggestion";
import OrganizationMembershipModel from "@semantask/db/models/OrganizationMembership";
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
    type WorkSummaryOpenTaskRow,
} from "@semantask/types";
import { ValidationError } from "./organization-errors";
import { boardStatusQuery, isValidObjectId } from "./work-board.service";
import { resolveConversationLabels } from "./conversation-label.service";
import { resolveUserRefs, userRefOrFallback } from "./user-ref.service";

export const WORK_SUMMARY_AGING_MS = 24 * 60 * 60 * 1000;
const OLDEST_LIMIT = 5;
const ATTENTION_LIMIT = 8;

type PendingActionDoc = {
    _id: mongoose.Types.ObjectId;
    taskId: mongoose.Types.ObjectId;
    conversationId: mongoose.Types.ObjectId;
    toolName?: string | null;
    actionType: string;
    createdAt: Date;
};

type OpenTaskDoc = {
    _id: mongoose.Types.ObjectId;
    title: string;
    boardStatus?: BoardStatus | null;
    status: string;
    lifecycleState?: string | null;
    dueAt?: Date | null;
    conversationId: mongoose.Types.ObjectId;
    createdAt: Date;
    assignees?: mongoose.Types.ObjectId[];
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

function serializeOpenTask(
    task: OpenTaskDoc,
    labels: Map<string, string>,
    userRefs: Map<string, ReturnType<typeof userRefOrFallback>>
): WorkSummaryOpenTaskRow {
    const assignees = (task.assignees ?? []).map((id) => id.toString());
    const conversationId = task.conversationId.toString();
    return {
        _id: task._id.toString(),
        title: task.title,
        boardStatus: resolveBoardStatus({
            boardStatus: task.boardStatus,
            status: task.status as Parameters<typeof resolveBoardStatus>[0]["status"],
        }),
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
        conversationId,
        conversationLabel: labels.get(conversationId) ?? null,
        createdAt: new Date(task.createdAt).toISOString(),
        assignees,
        assigneeRefs: assignees.map((id) => userRefOrFallback(id, userRefs)),
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
    const openFilter = { ...orgFilter, $or: openOr };

    const [
        todoCount,
        doingCount,
        doneCount,
        overdueCount,
        blockedCount,
        unassignedCount,
        memberCount,
        proposedCount,
        openAgeRows,
        oldestTasks,
        overdueTasks,
        blockedTasks,
        unassignedTasks,
        recentTasks,
        openAssigneeRows,
        proposedSuggestions,
        conversations,
    ] = await Promise.all([
        TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("todo") }),
        TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("doing") }),
        TaskModel.countDocuments({ ...orgFilter, ...boardStatusQuery("done") }),
        TaskModel.countDocuments({
            ...openFilter,
            dueAt: { $ne: null, $lt: now },
        }),
        TaskModel.countDocuments({
            ...orgFilter,
            lifecycleState: "blocked",
        }),
        TaskModel.countDocuments({
            ...orgFilter,
            $and: [
                { $or: openOr },
                {
                    $or: [
                        { assignees: { $exists: false } },
                        { assignees: { $size: 0 } },
                        { assignees: null },
                    ],
                },
            ],
        }),
        OrganizationMembershipModel.countDocuments({
            organizationId: orgFilter.organizationId,
        }),
        WorkSuggestionModel.countDocuments({
            organizationId: orgFilter.organizationId,
            status: "proposed",
        }),
        TaskModel.find(openFilter).select("createdAt").lean<{ createdAt: Date }[]>(),
        TaskModel.find(openFilter)
            .sort({ dueAt: 1, createdAt: 1 })
            .limit(OLDEST_LIMIT)
            .select("_id title boardStatus status dueAt conversationId createdAt assignees")
            .lean<OpenTaskDoc[]>(),
        TaskModel.find({
            ...openFilter,
            dueAt: { $ne: null, $lt: now },
        })
            .sort({ dueAt: 1 })
            .limit(ATTENTION_LIMIT)
            .select("_id title boardStatus status dueAt conversationId createdAt assignees")
            .lean<OpenTaskDoc[]>(),
        TaskModel.find({
            ...orgFilter,
            lifecycleState: "blocked",
        })
            .sort({ updatedAt: -1 })
            .limit(ATTENTION_LIMIT)
            .select("_id title boardStatus status dueAt conversationId createdAt assignees")
            .lean<OpenTaskDoc[]>(),
        TaskModel.find({
            ...orgFilter,
            $and: [
                { $or: openOr },
                {
                    $or: [
                        { assignees: { $exists: false } },
                        { assignees: { $size: 0 } },
                        { assignees: null },
                    ],
                },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(ATTENTION_LIMIT)
            .select("_id title boardStatus status dueAt conversationId createdAt assignees")
            .lean<OpenTaskDoc[]>(),
        TaskModel.find(openFilter)
            .sort({ createdAt: -1 })
            .limit(ATTENTION_LIMIT)
            .select("_id title boardStatus status dueAt conversationId createdAt assignees")
            .lean<OpenTaskDoc[]>(),
        TaskModel.find(openFilter)
            .select("assignees")
            .lean<Array<{ assignees?: mongoose.Types.ObjectId[] }>>(),
        WorkSuggestionModel.find({
            organizationId: orgFilter.organizationId,
            status: "proposed",
        })
            .sort({ createdAt: -1 })
            .limit(ATTENTION_LIMIT)
            .select("_id title conversationId createdAt")
            .lean<
                Array<{
                    _id: mongoose.Types.ObjectId;
                    title: string;
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

    const attentionTaskPool = [
        ...oldestTasks,
        ...overdueTasks,
        ...blockedTasks,
        ...unassignedTasks,
        ...recentTasks,
    ];
    const conversationIdsForLabels = [
        ...attentionTaskPool.map((task) => task.conversationId.toString()),
        ...proposedSuggestions.map((row) => row.conversationId.toString()),
    ];
    const assigneeIds = [
        ...attentionTaskPool.flatMap((task) => (task.assignees ?? []).map((id) => id.toString())),
        ...openAssigneeRows.flatMap((row) => (row.assignees ?? []).map((id) => id.toString())),
    ];
    const [labels, userRefs] = await Promise.all([
        resolveConversationLabels(conversationIdsForLabels),
        resolveUserRefs(assigneeIds),
    ]);

    const byOwnerCounts = new Map<string, number>();
    for (const row of openAssigneeRows) {
        for (const assignee of row.assignees ?? []) {
            const id = assignee.toString();
            byOwnerCounts.set(id, (byOwnerCounts.get(id) ?? 0) + 1);
        }
    }

    return {
        openWork: {
            counts,
            overdue: overdueCount,
            openAgeMs: computeOpenAgeMs(openAgesMs),
            oldest: oldestTasks.map((task) => serializeOpenTask(task, labels, userRefs)),
        },
        agingApprovals: buildApprovalBucket(pendingActions, agingCutoff),
        highRiskPending: buildApprovalBucket(highRiskPendingActions, agingCutoff),
        attention: {
            counts: {
                members: memberCount,
                open: todoCount + doingCount,
                overdue: overdueCount,
                blocked: blockedCount,
                unassigned: unassignedCount,
                awaitingConfirmation: proposedCount,
            },
            overdue: overdueTasks.map((task) => serializeOpenTask(task, labels, userRefs)),
            blocked: blockedTasks.map((task) => serializeOpenTask(task, labels, userRefs)),
            unassigned: unassignedTasks.map((task) => serializeOpenTask(task, labels, userRefs)),
            awaitingConfirmation: proposedSuggestions.map((row) => {
                const conversationId = row.conversationId.toString();
                return {
                    _id: row._id.toString(),
                    title: row.title,
                    conversationId,
                    conversationLabel: labels.get(conversationId) ?? null,
                    createdAt: new Date(row.createdAt).toISOString(),
                };
            }),
            recentlyCreated: recentTasks.map((task) => serializeOpenTask(task, labels, userRefs)),
            byOwner: Array.from(byOwnerCounts.entries())
                .map(([userId, openCount]) => ({
                    user: userRefOrFallback(userId, userRefs),
                    openCount,
                }))
                .sort((left, right) => right.openCount - left.openCount)
                .slice(0, ATTENTION_LIMIT),
        },
        generatedAt: now.toISOString(),
    };
}
