import { notifyUsers } from "./notify.service";

export async function notifyTaskBlocked(input: {
    taskId: string;
    title: string;
    conversationId: string;
    assigneeIds: string[];
    reason?: string | null;
}): Promise<void> {
    if (input.assigneeIds.length === 0) return;
    const reason = input.reason?.trim();
    await notifyUsers(input.assigneeIds, {
        kind: "task_blocked",
        subject: `Blocked: ${input.title}`,
        text: reason
            ? `Task "${input.title}" is blocked: ${reason}`
            : `Task "${input.title}" is blocked.`,
        html: reason
            ? `<p>Task <b>${input.title}</b> is blocked:</p><p>${reason}</p>`
            : `<p>Task <b>${input.title}</b> is blocked.</p>`,
        dedupeKey: `blocked:${input.taskId}:${new Date().toISOString().slice(0, 13)}`,
        conversationId: input.conversationId,
        entityId: input.taskId,
    });
}
