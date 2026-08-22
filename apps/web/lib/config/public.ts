/**
 * Client-safe helpers. Only `NEXT_PUBLIC_*` keys — importable from browser code.
 */

export function getPublicSocketUrl(): string | undefined {
    return process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
}

export function getPublicImageKitKey(): string | undefined {
    return process.env.NEXT_PUBLIC_PUBLIC_KEY?.trim() || undefined;
}

export function getPublicImageKitEndpoint(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_URI_ENDPOINT?.replace(/\/$/, "");
    return raw?.trim() || undefined;
}
