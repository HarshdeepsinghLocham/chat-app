import { Types } from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import WorkSuggestionModel from "@semantask/db/models/WorkSuggestion";
import TaskActionModel from "@semantask/db/models/TaskAction";
import OrganizationMembershipModel from "@semantask/db/models/OrganizationMembership";
import { Conversation } from "@semantask/db/models/Conversation";
import { resolveUserRefs, userRefOrFallback } from "./user-ref.service";
import { ValidationError } from "./organization-errors";

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

export type WorkSearchHit = {
    kind: "task" | "conversation" | "person" | "suggestion" | "execution";
    id: string;
    title: string;
    href: string;
    subtitle?: string | null;
};

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchOrganizationWork(input: {
    organizationId: string;
    query: string;
}): Promise<WorkSearchHit[]> {
    if (!isValidObjectId(input.organizationId)) {
        throw new ValidationError("Invalid organization");
    }
    const q = input.query.trim().slice(0, 80);
    if (q.length < 2) return [];

    await connectToDatabase();
    const orgId = new Types.ObjectId(input.organizationId);
    const rx = new RegExp(escapeRegex(q), "i");

    const [tasks, conversations, members, suggestions, actionsParentTasks] = await Promise.all([
        TaskModel.find({ organizationId: orgId, title: rx })
            .select({ title: 1 })
            .limit(8)
            .lean<{ _id: Types.ObjectId; title: string }[]>(),
        Conversation.find({
            organizationId: orgId,
            $or: [{ name: rx }, { groupName: rx }],
        })
            .select({ name: 1, groupName: 1 })
            .limit(6)
            .lean<{ _id: Types.ObjectId; name?: string; groupName?: string }[]>(),
        OrganizationMembershipModel.find({ organizationId: orgId })
            .select({ userId: 1, role: 1 })
            .limit(50)
            .lean<{ userId: Types.ObjectId; role: string }[]>(),
        WorkSuggestionModel.find({ organizationId: orgId, title: rx })
            .select({ title: 1 })
            .limit(6)
            .lean<{ _id: Types.ObjectId; title: string }[]>(),
        TaskModel.find({ organizationId: orgId })
            .select({ _id: 1 })
            .limit(200)
            .lean<{ _id: Types.ObjectId }[]>(),
    ]);

    const actionTaskIds = actionsParentTasks.map((row) => row._id);
    const actions = actionTaskIds.length
        ? await TaskActionModel.find({
            taskId: { $in: actionTaskIds },
            $or: [{ toolName: rx }, { actionType: rx }, { summary: rx }],
        })
            .select({ toolName: 1, actionType: 1, taskId: 1, summary: 1 })
            .limit(6)
            .lean<{
                _id: Types.ObjectId;
                toolName?: string | null;
                actionType: string;
                taskId: Types.ObjectId;
                summary?: string | null;
            }[]>()
        : [];

    const refs = await resolveUserRefs(members.map((row) => row.userId.toString()));
    const people = members
        .map((row) => {
            const user = userRefOrFallback(row.userId.toString(), refs);
            const hay = `${user.username} ${user.email ?? ""} ${row.role}`.toLowerCase();
            return hay.includes(q.toLowerCase())
                ? {
                    kind: "person" as const,
                    id: user.id,
                    title: user.username,
                    subtitle: row.role,
                    href: "/organizations",
                }
                : null;
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .slice(0, 6);

    return [
        ...tasks.map((task) => ({
            kind: "task" as const,
            id: task._id.toString(),
            title: task.title,
            href: `/work/${task._id.toString()}`,
        })),
        ...conversations.map((conversation) => ({
            kind: "conversation" as const,
            id: conversation._id.toString(),
            title: conversation.name || conversation.groupName || "Conversation",
            href: `/c/${conversation._id.toString()}`,
        })),
        ...people,
        ...suggestions.map((suggestion) => ({
            kind: "suggestion" as const,
            id: suggestion._id.toString(),
            title: suggestion.title,
            href: `/work-suggestions/${suggestion._id.toString()}`,
        })),
        ...actions.map((action) => ({
            kind: "execution" as const,
            id: action._id.toString(),
            title: (action.toolName || action.actionType).replace(/_/g, " "),
            subtitle: action.summary ?? null,
            href: `/work/${action.taskId.toString()}`,
        })),
    ].slice(0, 24);
}
