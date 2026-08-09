import { Types } from "mongoose";
import { connectToDatabase } from "@semantask/db";
import { Conversation } from "@semantask/db/models/Conversation";
import TaskModel from "@semantask/db/models/Task";
import {
    assertMembership,
    assertOrganizationActive,
    canManageMembers,
    getMembership,
} from "./organization.service";
import { AuthorizationError } from "./authorization-errors";

export { AuthorizationError } from "./authorization-errors";

export type AuthorizationRole = "user" | "moderator" | "admin";

export type ConversationAccessOptions = {
    allowAdminBypass?: boolean;
    userRole?: AuthorizationRole;
};

type ConversationAccessRecord = {
    _id: Types.ObjectId;
    participants: Types.ObjectId[];
    organizationId?: Types.ObjectId | null;
};

function isValidObjectId(value: string): boolean {
    return Types.ObjectId.isValid(value);
}

function participantIdsFromConversation(conversation: ConversationAccessRecord): string[] {
    return conversation.participants.map((participant) => participant.toString());
}

function isParticipant(conversation: ConversationAccessRecord, userId: string): boolean {
    return conversation.participants.some((participant) => participant.toString() === userId);
}

function organizationIdFromConversation(
    conversation: ConversationAccessRecord
): string | null {
    if (!conversation.organizationId) {
        return null;
    }
    return conversation.organizationId.toString();
}

function canAdminBypass(
    options: ConversationAccessOptions | undefined,
    conversation: ConversationAccessRecord | null,
    userId: string
): conversation is ConversationAccessRecord {
    if (!conversation) {
        return false;
    }

    if (options?.allowAdminBypass === false) {
        return false;
    }

    if (options?.userRole !== "admin") {
        return false;
    }

    return !isParticipant(conversation, userId);
}

async function loadConversationForAccess(
    conversationId: string
): Promise<ConversationAccessRecord | null> {
    if (!isValidObjectId(conversationId)) {
        return null;
    }

    await connectToDatabase();

    return Conversation.findById(conversationId)
        .select("_id participants organizationId")
        .lean<ConversationAccessRecord>();
}

async function assertOrgConversationAccess(
    userId: string,
    conversation: ConversationAccessRecord,
    options?: ConversationAccessOptions
): Promise<boolean> {
    const organizationId = organizationIdFromConversation(conversation);
    if (!organizationId) {
        return false;
    }

    try {
        await assertOrganizationActive(organizationId);
    } catch {
        return canAdminBypass(options, conversation, userId);
    }

    const membership = await getMembership(organizationId, userId);
    if (membership && isParticipant(conversation, userId)) {
        return true;
    }

    // Platform admin bypass still works for org conversations.
    return canAdminBypass(options, conversation, userId);
}

export async function canAccessConversation(
    userId: string,
    conversationId: string,
    options?: ConversationAccessOptions
): Promise<boolean> {
    if (!isValidObjectId(userId)) {
        return false;
    }

    const conversation = await loadConversationForAccess(conversationId);
    if (!conversation) {
        return false;
    }

    const organizationId = organizationIdFromConversation(conversation);
    if (organizationId) {
        return assertOrgConversationAccess(userId, conversation, options);
    }

    if (isParticipant(conversation, userId)) {
        return true;
    }

    return canAdminBypass(options, conversation, userId);
}

export async function getAuthorizedConversation(
    userId: string,
    conversationId: string,
    options?: ConversationAccessOptions
): Promise<ConversationAccessRecord> {
    const access = await assertConversationAccess(userId, conversationId, options);
    const conversation = await loadConversationForAccess(access.conversationId);

    if (!conversation) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }

    return conversation;
}

export async function assertConversationAccess(
    userId: string,
    conversationId: string,
    options?: ConversationAccessOptions
): Promise<{
    conversationId: string;
    participantIds: string[];
    organizationId: string | null;
}> {
    if (!isValidObjectId(userId) || !isValidObjectId(conversationId)) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }

    const conversation = await loadConversationForAccess(conversationId);
    if (!conversation) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }

    const organizationId = organizationIdFromConversation(conversation);

    if (organizationId) {
        const allowed = await assertOrgConversationAccess(userId, conversation, options);
        if (!allowed) {
            throw new AuthorizationError("FORBIDDEN", "Forbidden");
        }
        return {
            conversationId,
            participantIds: participantIdsFromConversation(conversation),
            organizationId,
        };
    }

    if (isParticipant(conversation, userId) || canAdminBypass(options, conversation, userId)) {
        return {
            conversationId,
            participantIds: participantIdsFromConversation(conversation),
            organizationId: null,
        };
    }

    throw new AuthorizationError("FORBIDDEN", "Forbidden");
}

export async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
    const conversation = await loadConversationForAccess(conversationId);
    if (!conversation) {
        return [];
    }

    return participantIdsFromConversation(conversation);
}

export async function assertTaskAccess(
    userId: string,
    taskId: string,
    options?: ConversationAccessOptions
): Promise<{ taskId: string; conversationId: string; organizationId: string | null }> {
    if (!isValidObjectId(userId) || !isValidObjectId(taskId)) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }

    await connectToDatabase();

    const task = await TaskModel.findById(taskId).select("conversationId organizationId").lean<{
        _id: Types.ObjectId;
        conversationId: Types.ObjectId;
        organizationId?: Types.ObjectId | null;
    }>();

    if (!task) {
        throw new AuthorizationError("NOT_FOUND", "Task not found");
    }

    const conversationId = task.conversationId.toString();
    const access = await assertConversationAccess(userId, conversationId, options);

    return {
        taskId,
        conversationId,
        organizationId: access.organizationId
            ?? (task.organizationId ? task.organizationId.toString() : null),
    };
}

export async function assertMessageConversationAccess(
    userId: string,
    conversationId: string,
    options?: ConversationAccessOptions
): Promise<void> {
    await assertConversationAccess(userId, conversationId, options);
}

export async function assertMessageInAccessibleConversation(
    userId: string,
    messageConversationId: string,
    options?: ConversationAccessOptions
): Promise<string> {
    await assertConversationAccess(userId, messageConversationId, options);
    return messageConversationId;
}

/** Ensure user is a member when attaching organizationId to a resource. */
export async function assertOrganizationMemberAccess(
    userId: string,
    organizationId: string
): Promise<void> {
    await assertOrganizationActive(organizationId);
    await assertMembership(organizationId, userId);
}

export type WorkSuggestionAccessTarget = {
    conversationId: string;
    organizationId?: string | null;
};

/**
 * Allow access when the user can access the source conversation, OR when the
 * suggestion is org-scoped and the user is an active organization member.
 *
 * Active membership = an OrganizationMembership row for (org, user). Removed /
 * inactive members have no row (hard-delete); there is no soft status field.
 * Organization must also be active (`assertOrganizationActive`).
 * Does not change assertConversationAccess (org chats remain member AND participant).
 */
export async function canAccessWorkSuggestion(
    userId: string,
    suggestion: WorkSuggestionAccessTarget,
    options?: ConversationAccessOptions
): Promise<boolean> {
    if (!isValidObjectId(userId) || !isValidObjectId(suggestion.conversationId)) {
        return false;
    }

    if (await canAccessConversation(userId, suggestion.conversationId, options)) {
        return true;
    }

    const organizationId = suggestion.organizationId ?? null;
    if (!organizationId || !isValidObjectId(organizationId)) {
        return false;
    }

    try {
        await assertOrganizationActive(organizationId);
        await assertMembership(organizationId, userId);
        return true;
    } catch {
        return false;
    }
}

export async function assertWorkSuggestionAccess(
    userId: string,
    suggestion: WorkSuggestionAccessTarget,
    options?: ConversationAccessOptions
): Promise<void> {
    const allowed = await canAccessWorkSuggestion(userId, suggestion, options);
    if (!allowed) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }
}

/**
 * Mutation AuthZ (accept/dismiss/assign): conversation participant, OR org
 * owner/admin for org-scoped suggestions. Plain org members without
 * conversation access cannot mutate (stricter than read access).
 */
export async function canMutateWorkSuggestion(
    userId: string,
    suggestion: WorkSuggestionAccessTarget,
    options?: ConversationAccessOptions
): Promise<boolean> {
    if (!isValidObjectId(userId) || !isValidObjectId(suggestion.conversationId)) {
        return false;
    }

    if (await canAccessConversation(userId, suggestion.conversationId, options)) {
        return true;
    }

    const organizationId = suggestion.organizationId ?? null;
    if (!organizationId || !isValidObjectId(organizationId)) {
        return false;
    }

    try {
        await assertOrganizationActive(organizationId);
        const membership = await getMembership(organizationId, userId);
        if (!membership) {
            return false;
        }
        return canManageMembers(membership.role);
    } catch {
        return false;
    }
}

export async function assertWorkSuggestionMutationAccess(
    userId: string,
    suggestion: WorkSuggestionAccessTarget,
    options?: ConversationAccessOptions
): Promise<void> {
    const allowed = await canMutateWorkSuggestion(userId, suggestion, options);
    if (!allowed) {
        throw new AuthorizationError("FORBIDDEN", "Forbidden");
    }
}
