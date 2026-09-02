import { Types } from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import WorkSuggestionModel from "@semantask/db/models/WorkSuggestion";
import TaskActionModel from "@semantask/db/models/TaskAction";
import OrganizationMembershipModel from "@semantask/db/models/OrganizationMembership";
import { Conversation } from "@semantask/db/models/Conversation";
import { User } from "@semantask/db/models/User";
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

    const [tasks, conversations, userHits, suggestions, actionHits] = await Promise.all([
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
        User.find({ $or: [{ username: rx }, { email: rx }] })
            .select({ _id: 1, username: 1, email: 1 })
            .limit(50)
            .lean<{ _id: Types.ObjectId; username: string; email?: string }[]>(),
        WorkSuggestionModel.find({ organizationId: orgId, title: rx })
            .select({ title: 1 })
            .limit(6)
            .lean<{ _id: Types.ObjectId; title: string }[]>(),
        TaskActionModel.find({
            $or: [{ toolName: rx }, { actionType: rx }, { summary: rx }],
        })
            .select({ toolName: 1, actionType: 1, taskId: 1, summary: 1 })
            .limit(50)
            .lean<{
                _id: Types.ObjectId;
                toolName?: string | null;
                actionType: string;
                taskId: Types.ObjectId;
                summary?: string | null;
            }[]>(),
    ]);

    const userIds = userHits.map((user) => user._id);
    const actionTaskIds = actionHits.map((action) => action.taskId);
    const [memberHits, orgActionTasks] = await Promise.all([
        userIds.length
            ? OrganizationMembershipModel.find({
                organizationId: orgId,
                userId: { $in: userIds },
            })
                .select({ userId: 1, role: 1 })
                .limit(6)
                .lean<{ userId: Types.ObjectId; role: string }[]>()
            : Promise.resolve([] as { userId: Types.ObjectId; role: string }[]),
        actionTaskIds.length
            ? TaskModel.find({
                organizationId: orgId,
                _id: { $in: actionTaskIds },
            })
                .select({ _id: 1 })
                .limit(6)
                .lean<{ _id: Types.ObjectId }[]>()
            : Promise.resolve([] as { _id: Types.ObjectId }[]),
    ]);

    const orgActionTaskIds = new Set(orgActionTasks.map((row) => row._id.toString()));
    const actions = actionHits
        .filter((action) => orgActionTaskIds.has(action.taskId.toString()))
        .slice(0, 6);

    const refs = await resolveUserRefs(memberHits.map((row) => row.userId.toString()));
    const people = memberHits
        .map((row) => {
            const user = userRefOrFallback(row.userId.toString(), refs);
            return {
                kind: "person" as const,
                id: user.id,
                title: user.username,
                subtitle: row.role,
                href: "/organizations",
            };
        })
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
