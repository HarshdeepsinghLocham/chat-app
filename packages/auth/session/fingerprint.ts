import { createHash } from "node:crypto";

function normalizeDeviceId(deviceId?: string): string {
    return String(deviceId || "").trim().toLowerCase();
}

function normalizeUserAgent(userAgent?: string): string {
    return String(userAgent || "").trim().toLowerCase();
}

function normalizeIpBucket(ipAddress?: string): string {
    const ip = String(ipAddress || "").trim().toLowerCase();
    if (!ip || ip === "unknown") {
        return "";
    }

    if (ip.includes(".")) {
        const parts = ip.split(".");
        if (parts.length === 4) {
            return parts.slice(0, 3).join(".");
        }
    }

    if (ip.includes(":")) {
        return ip.split(":").slice(0, 4).join(":");
    }

    return ip;
}

/** Stable device identifier stored on new sessions (metadata only; not used to gate refresh). */
export function generateDeviceFingerprint({
    deviceId,
    userAgent,
    ipAddress,
}: {
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
}): string {
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    if (normalizedDeviceId) {
        return createHash("sha256")
            .update(`device:${normalizedDeviceId}`)
            .digest("hex");
    }

    const normalizedUa = normalizeUserAgent(userAgent) || "unknown_ua";
    const normalizedIpBucket = normalizeIpBucket(ipAddress) || "unknown_ip";

    return createHash("sha256")
        .update(`ua:${normalizedUa}|ip:${normalizedIpBucket}`)
        .digest("hex");
}
