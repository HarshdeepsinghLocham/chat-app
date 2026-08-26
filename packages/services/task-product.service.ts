import type {
    CoordinationStatus,
    SuggestedWorkTool,
    TaskActionRecord,
    TaskRecord,
} from "@semantask/types";
import { deriveCoordinationStatus } from "@semantask/types";
import TaskActionModel, { type ITaskAction } from "@semantask/db/models/TaskAction";
import type { ITask } from "@semantask/db/models/Task";
import { connectToDatabase } from "@semantask/db";
import { Types } from "mongoose";
import { normalizeTask } from "./normalizers/task.normalizer";
import { resolveConversationLabels } from "./conversation-label.service";
import { resolveUserRefs, userRefOrFallback } from "./user-ref.service";

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

export function serializeTaskAction(action: ITaskAction): TaskActionRecord {
    return {
        _id: action._id.toString(),
        taskId: action.taskId.toString(),
        conversationId: action.conversationId.toString(),
        actorType: action.actorType,
        actorId: action.actorId ? action.actorId.toString() : null,
        actionType: action.actionType,
        toolName: action.toolName ?? null,
        messageId: action.messageId ? action.messageId.toString() : null,
        executionState: action.executionState ?? null,
        parameters: (action.parameters ?? {}) as Record<string, unknown>,
        summary: action.summary ?? null,
        error: action.error ?? null,
        patch: action.patch,
        reason: action.reason,
        idempotencyKey: action.idempotencyKey,
        createdAt: new Date(action.createdAt).toISOString(),
    };
}

export async function listTaskActionsForTask(taskId: string): Promise<ITaskAction[]> {
    if (!isValidObjectId(taskId)) return [];
    await connectToDatabase();
    return TaskActionModel.find({ taskId: new Types.ObjectId(taskId) })
        .sort({ createdAt: 1 })
        .limit(100)
        .exec();
}

export async function enrichTaskForProduct(doc: ITask): Promise<TaskRecord> {
    const record = normalizeTask(doc);
    const actions = await listTaskActionsForTask(record._id);
    const pendingApproval = actions.some(
        (action) => action.executionState === "approval_pending" || action.executionState === "requested"
    );
    const coordinationStatus: CoordinationStatus = deriveCoordinationStatus({
        boardStatus: record.boardStatus,
        status: record.status,
        lifecycleState: record.lifecycleState,
        cancelRequestedAt: record.cancelRequestedAt ?? null,
        pendingApproval,
    });

    const ownerId = record.assignees[0] ?? null;
    const userIds = [
        ...record.assignees,
        record.createdBy,
        ...actions.map((action) => action.actorId?.toString()).filter(Boolean) as string[],
    ];
    const refs = await resolveUserRefs(userIds);
    const labels = await resolveConversationLabels([record.conversationId]);

    return {
        ...record,
        coordinationStatus,
        conversationLabel: labels.get(record.conversationId) ?? record.conversationLabel ?? null,
        ownerRef: ownerId ? userRefOrFallback(ownerId, refs) : null,
        assigneeRefs: record.assignees.map((id) => userRefOrFallback(id, refs)),
        executionActions: actions.map(serializeTaskAction),
    };
}
