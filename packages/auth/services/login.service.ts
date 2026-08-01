import { comparePassword } from "../password/compare";
import { generateAccessToken } from "../tokens/generate";
import { createUserSession } from "../session/create-session";
import { User } from "@/models/User";

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export const loginUser = async ({
    email,
    password,
    deviceId,
    userAgent,
    ipAddress,
}: {
    email: string;
    password: string;
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
}) => {
    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) throw new Error("User not found");

    if (!user.password) {
        throw new Error("Password login is not enabled for this account");
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) throw new Error("Invalid password");

    if (user.status && user.status !== "active") {
        throw new Error("Account is not active");
    }

    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role,
        tokenVersion: user.tokenVersion || 0,
        type: "access",
    });

    // Flagged accounts get a short-lived access token only (for change-password).
    // No refresh session — ordinary auth requires completing the password change.
    if (user.mustChangePassword) {
        return {
            user,
            accessToken,
            refreshToken: undefined,
        };
    }

    const { refreshToken } = await createUserSession({
        userId: user._id.toString(),
        deviceId,
        userAgent,
        ipAddress,
        tokenVersion: user.tokenVersion || 0,
    });

    return {
        user,
        accessToken,
        refreshToken,
    };
};