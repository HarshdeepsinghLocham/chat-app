import { generateDeviceFingerprint } from "../../../session/fingerprint.js";

/**
 * Request-context builders for refresh integration tests.
 *
 * A "request context" is the device/network metadata a client may send with a
 * refresh call (`deviceId`, `userAgent`, `ipAddress`). Sessions store a derived
 * fingerprint at creation time for audit/metadata; refresh does not gate on it.
 */
export interface RequestContext {
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
}

const DEFAULTS: Required<RequestContext> = {
    deviceId: "device-fingerprint-aaaa-1111",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) TestAgent/1.0",
    ipAddress: "203.0.113.10",
};

/** Build a request context with sane defaults. */
export function buildRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
    return {
        deviceId: overrides.deviceId ?? DEFAULTS.deviceId,
        userAgent: overrides.userAgent ?? DEFAULTS.userAgent,
        ipAddress: overrides.ipAddress ?? DEFAULTS.ipAddress,
    };
}

/**
 * The `deviceId` value a real session would persist for this context.
 *
 * Mirrors production `createUserSession`, which stores
 * `generateDeviceFingerprint({ deviceId, userAgent, ipAddress })` rather than
 * the raw deviceId.
 */
export function storedDeviceFingerprint(ctx: RequestContext): string {
    return generateDeviceFingerprint({
        deviceId: ctx.deviceId,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
    });
}

/** Produce a context whose device fingerprint differs from `ctx` (device drift). */
export function driftedContext(
    ctx: RequestContext,
    overrides: Partial<RequestContext> = {}
): RequestContext {
    return buildRequestContext({
        ...ctx,
        deviceId: "device-fingerprint-zzzz-9999",
        ...overrides,
    });
}
