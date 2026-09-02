import { Types } from "mongoose";
import { connectToDatabase } from "@semantask/db";
import { Conversation } from "@semantask/db/models/Conversation";
import type { IUser } from "@semantask/db/models/User";

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

type LeanConversation = {
    _id: Types.ObjectId;
    isGroup?: boolean;
    groupName?: string;
    name?: string;
    participants?: Array<Types.ObjectId | IUser | { _id?: Types.ObjectId; username?: string }>;
};

function labelFromConversation(doc: LeanConversation): string {
    if (doc.isGroup) {
        const group = doc.groupName?.trim() || doc.name?.trim();
        return group || "Group conversation";
    }
    const participants = doc.participants ?? [];
    for (const participant of participants) {
        if (participant && typeof participant === "object" && "username" in participant) {
            const username = (participant as { username?: string }).username?.trim();
            if (username) return username;
        }
    }
    return doc.name?.trim() || "Conversation";
}

/**
 * Batch-resolve human-readable conversation labels for work surfaces.
 */
export async function resolveConversationLabels(
    conversationIds: string[]
): Promise<Map<string, string>> {
    const unique = Array.from(new Set(conversationIds.filter(isValidObjectId)));
    const byId = new Map<string, string>();
    if (unique.length === 0) {
        return byId;
    }

    await connectToDatabase();
    const rows = await Conversation.find({
        _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
    })
        .select({ isGroup: 1, groupName: 1, name: 1, participants: 1 })
        .populate("participants", "username")
        .lean<LeanConversation[]>();

    for (const row of rows) {
        byId.set(row._id.toString(), labelFromConversation(row));
    }

    return byId;
}
