import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { forcePasswordChangeService } from "../../../services/change-password.service.js";
import { SessionModel } from "../../../repositories/sessionModel.js";
import { User } from "../../../../db/models/User.js";
import { useTestDb } from "../../helpers/db.js";
import { objectId } from "../../helpers/ids.js";
import { createUser } from "../../helpers/factories/user.factory.js";
import { createSessionDoc } from "../../helpers/factories/session.factory.js";

useTestDb();

const PASSWORD = "orig-p4ssword";

function countSessions(userId: string): Promise<number> {
    return SessionModel.countDocuments({ userId: new Types.ObjectId(userId) });
}

/** Read the persisted user as a plain object (every field, nothing hidden). */
async function readFullUser(userId: string): Promise<Record<string, unknown> | null> {
    return User.findById(userId).lean<Record<string, unknown> | null>();
}

async function readTokenVersion(userId: string): Promise<number | undefined> {
    const user = await User.findById(userId)
        .select("tokenVersion")
        .lean<{ tokenVersion?: number } | null>();
    return user?.tokenVersion;
}

describe("services/force-password-change.service (db integration)", () => {
    describe("happy path", () => {
        it("succeeds and echoes the userId with success=true (req 1)", async () => {
            const user = await createUser({ plainPassword: PASSWORD });
            const userId = user._id.toString();

            const result = await forcePasswordChangeService(userId);

            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
        });

        it("increments the persisted tokenVersion (req 2)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 4 });
            const userId = user._id.toString();

            await forcePasswordChangeService(userId);

            expect(await readTokenVersion(userId)).toBe(5);
        });

        it("removes existing sessions (req 3)", async () => {
            const user = await createUser({ plainPassword: PASSWORD });
            const userId = user._id.toString();
            await createSessionDoc({ userId });
            await createSessionDoc({ userId });
            expect(await countSessions(userId)).toBe(2);

            await forcePasswordChangeService(userId);

            expect(await countSessions(userId)).toBe(0);
        });

        it("returns a payload that matches persisted state (req 4)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 1 });
            const userId = user._id.toString();

            const result = await forcePasswordChangeService(userId);
            const persistedTokenVersion = await readTokenVersion(userId);

            expect(result).toEqual({
                userId,
                success: true,
                tokenVersionAfter: persistedTokenVersion,
            });
            expect(result.tokenVersionAfter).toBe(2);
        });
    });

    describe("failure paths", () => {
        it("throws 'User not found' for a non-existent user (req 5)", async () => {
            await expect(forcePasswordChangeService(objectId())).rejects.toThrow(
                "User not found"
            );
        });

        it("succeeds for a user with no active sessions (req 6)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 0 });
            const userId = user._id.toString();
            expect(await countSessions(userId)).toBe(0);

            const result = await forcePasswordChangeService(userId);

            // No sessions to delete, but the token-version bump still happens.
            expect(result.success).toBe(true);
            expect(await countSessions(userId)).toBe(0);
            expect(await readTokenVersion(userId)).toBe(1);
        });

        it("removes ALL sessions for a user with multiple active sessions (req 7)", async () => {
            const user = await createUser({ plainPassword: PASSWORD });
            const userId = user._id.toString();
            await createSessionDoc({ userId });
            await createSessionDoc({ userId });
            await createSessionDoc({ userId });
            await createSessionDoc({ userId });
            expect(await countSessions(userId)).toBe(4);

            await forcePasswordChangeService(userId);

            expect(await countSessions(userId)).toBe(0);
        });

        it("only deletes the target user's sessions, not other users'", async () => {
            const target = (await createUser({ plainPassword: PASSWORD }))._id.toString();
            const bystander = (await createUser({ plainPassword: PASSWORD }))._id.toString();
            await createSessionDoc({ userId: target });
            await createSessionDoc({ userId: bystander });

            await forcePasswordChangeService(target);

            expect(await countSessions(target)).toBe(0);
            expect(await countSessions(bystander)).toBe(1);
        });
    });

    describe("versioning", () => {
        it("does NOT expose previousTokenVersion in the payload (req 8 - finding)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 7 });
            const userId = user._id.toString();

            const result = await forcePasswordChangeService(userId);

            // FINDING: the underlying invalidateAllUserTokens computes
            // `previousTokenVersion`, but forcePasswordChangeService drops it.
            // The "previous" value is therefore NOT reported by this service.
            expect(result).not.toHaveProperty("previousTokenVersion");
            expect(Object.keys(result).sort()).toEqual(
                ["success", "tokenVersionAfter", "userId"].sort()
            );

            // The pre-change version (7) is only inferable from the persisted +1.
            expect(await readTokenVersion(userId)).toBe(8);
        });

        it("returns a tokenVersionAfter that matches the persisted value (req 9)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 2 });
            const userId = user._id.toString();

            const result = await forcePasswordChangeService(userId);
            const persisted = await readTokenVersion(userId);

            // Unlike changePasswordService (which returns a stale value), this
            // service reads newTokenVersion from the post-increment document, so
            // the returned value is accurate.
            expect(result.tokenVersionAfter).toBe(3);
            expect(result.tokenVersionAfter).toBe(persisted);
        });

        it("starts versioning correctly from a brand-new (tokenVersion 0) user", async () => {
            const user = await createUser({ plainPassword: PASSWORD });
            const userId = user._id.toString();

            const result = await forcePasswordChangeService(userId);

            expect(result.tokenVersionAfter).toBe(1);
            expect(await readTokenVersion(userId)).toBe(1);
        });
    });

    describe("password-change enforcement", () => {
        it("sets mustChangePassword without altering the password hash (req 10)", async () => {
            const user = await createUser({ plainPassword: PASSWORD });
            const userId = user._id.toString();
            const before = (await readFullUser(userId))!;

            await forcePasswordChangeService(userId);

            const persisted = (await readFullUser(userId))!;
            expect(persisted.mustChangePassword).toBe(true);
            expect(persisted.password).toBe(before.password);
        });

        it("increments tokenVersion and clears sessions while setting the flag (req 11)", async () => {
            const user = await createUser({ plainPassword: PASSWORD, tokenVersion: 3 });
            const userId = user._id.toString();
            await createSessionDoc({ userId });

            const before = (await readFullUser(userId))!;
            await forcePasswordChangeService(userId);
            const after = (await readFullUser(userId))!;

            expect(before.tokenVersion).toBe(3);
            expect(after.tokenVersion).toBe(4);
            expect(after.mustChangePassword).toBe(true);
            expect(await countSessions(userId)).toBe(0);
            expect(after.password).toBe(before.password);
        });

        it("rejects Google-only / passwordless accounts (req 12)", async () => {
            const user = await createUser({
                plainPassword: undefined,
                authProviders: ["google"],
                googleSub: `google-${objectId()}`,
            });

            await expect(forcePasswordChangeService(user._id.toString())).rejects.toThrow(
                "Password authentication not available for this account"
            );

            const persisted = (await readFullUser(user._id.toString()))!;
            expect(persisted.mustChangePassword).toBe(false);
        });
    });
});
