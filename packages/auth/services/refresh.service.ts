import { verifySession } from "../session/verify-session";
import { generateAccessToken, generateRefreshToken } from "../tokens/generate";
import { hashToken } from "../session/token-hash";
import {
    revokeSession,
    rotateSessionTokenHash,
} from "../repositories/session.repo";
import { User } from "@/models/User";

/**
 * Rotate refresh + issue access token.
 * MVP contract: never creates or requires step-up challenges.
 * Fingerprint drift does not gate normal session maintenance.
 */
export const refreshService = async ({
    refreshToken,
}: {
    refreshToken: string;
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
}) => {
    const { payload } = await verifySession(refreshToken);

    const user = await User.findById(payload.sub)
        .select("_id role status tokenVersion isDeleted mustChangePassword")
        .lean<{
            _id: { toString(): string };
            role?: "user" | "moderator" | "admin";
            status?: string;
            tokenVersion?: number;
            isDeleted?: boolean;
            mustChangePassword?: boolean;
        } | null>();

    if (!user) {
        throw new Error("User not found");
    }

    if (user.isDeleted) {
        throw new Error("ACCOUNT_DELETED");
    }

    if (user.status && user.status !== "active") {
        throw new Error("Account is not active");
    }

    if (user.mustChangePassword) {
        throw new Error("Password change required");
    }

    const currentTokenVersion = user.tokenVersion || 0;
    if (payload.tokenVersion !== currentTokenVersion) {
        await revokeSession(payload.sessionId);
        throw new Error("Token version revoked");
    }

    const nextRefreshToken = generateRefreshToken({
        sub: payload.sub,
        sessionId: payload.sessionId,
        tokenVersion: currentTokenVersion,
        type: "refresh",
    });

    const rotated = await rotateSessionTokenHash(
        payload.sessionId,
        hashToken(nextRefreshToken)
    );

    if (!rotated) {
        throw new Error("Unable to rotate refresh session");
    }

    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role || "user",
        tokenVersion: currentTokenVersion,
        type: "access",
    });

    return {
        accessToken,
        refreshToken: nextRefreshToken,
        userId: user._id.toString(),
        sessionId: payload.sessionId,
    };
};
