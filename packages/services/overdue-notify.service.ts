import mongoose from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import { boardStatusQuery, isValidObjectId } from "./work-board.service";
import { notifyUser } from "./notify.service";
import { escapeHtml } from "./html-escape";

function openBoardStatusOrClause(): Record<string, unknown>[] {
    const todo = boardStatusQuery("todo") as { $or: Record<string, unknown>[] };
    const doing = boardStatusQuery("doing") as { $or: Record<string, unknown>[] };
    return [...todo.$or, ...doing.$or];
}

/**
 * Email assignees once per task per UTC day for overdue open coordination work.
 */
export async function notifyOverdueTasks(options?: {
    organizationId?: string;
    limit?: number;
}): Promise<{ notified: number }> {
    await connectToDatabase();
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const limit = Math.min(200, Math.max(1, options?.limit ?? 50));

    const filter: Record<string, unknown> = {
        $or: openBoardStatusOrClause(),
        dueAt: { $ne: null, $lt: now },
        assignees: { $exists: true, $ne: [] },
    };
    if (options?.organizationId) {
        if (!isValidObjectId(options.organizationId)) {
            return { notified: 0 };
        }
        filter.organizationId = new mongoose.Types.ObjectId(options.organizationId);
    }

    const tasks = await TaskModel.find(filter)
        .sort({ dueAt: 1 })
        .limit(limit)
        .select("_id title conversationId assignees dueAt")
        .lean<
            Array<{
                _id: mongoose.Types.ObjectId;
                title: string;
                conversationId: mongoose.Types.ObjectId;
                assignees: mongoose.Types.ObjectId[];
                dueAt: Date;
            }>
        >();

    let notified = 0;
    for (const task of tasks) {
        for (const assignee of task.assignees ?? []) {
            const userId = assignee.toString();
            await notifyUser({
                userId,
                kind: "task_overdue",
                subject: `Overdue: ${task.title}`,
                text: `Task "${task.title}" is overdue (due ${new Date(task.dueAt).toLocaleDateString()}).`,
                html: `<p>Task <b>${escapeHtml(task.title)}</b> is overdue (due ${new Date(task.dueAt).toLocaleDateString()}).</p>`,
                dedupeKey: `overdue:${task._id.toString()}:${dayKey}`,
                conversationId: task.conversationId.toString(),
                entityId: task._id.toString(),
            });
            notified += 1;
        }
    }

    return { notified };
}
