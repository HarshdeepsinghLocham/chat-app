import { Types } from "mongoose";
import type { UserRef } from "@semantask/types";
import { connectToDatabase } from "@semantask/db";
import { User } from "@semantask/db/models/User";

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

/**
 * Batch-resolve UserRef records for product UI. Missing users are omitted.
 */
export async function resolveUserRefs(userIds: string[]): Promise<Map<string, UserRef>> {
    const unique = Array.from(new Set(userIds.filter(isValidObjectId)));
    const byId = new Map<string, UserRef>();
    if (unique.length === 0) {
        return byId;
    }

    await connectToDatabase();
    const users = await User.find({
        _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
    })
        .select({ username: 1, email: 1, profilePicture: 1 })
        .lean<Array<{ _id: Types.ObjectId; username: string; email: string; profilePicture?: string }>>();

    for (const user of users) {
        byId.set(user._id.toString(), {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture ?? null,
        });
    }

    return byId;
}

export function userRefOrFallback(userId: string, byId: Map<string, UserRef>): UserRef {
    return (
        byId.get(userId) ?? {
            id: userId,
            username: "Unknown user",
        }
    );
}
