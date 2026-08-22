import { NextRequest } from "next/server";
import { getAppUrl } from "@/lib/config/app";

function stripTrailingSlash(value: string): string {
    return value.replace(/\/$/, "");
}

/**
 * Public origin for Google OAuth redirect URIs on server routes.
 * Uses proxy headers first so VPS/Docker deploys do not depend on NEXT_PUBLIC_*
 * values baked at build time.
 */
export function getGoogleOAuthBaseUrl(req: NextRequest): string {
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.headers.get("host")?.trim();

    if (host) {
        const proto = forwardedProto || req.nextUrl.protocol.replace(":", "") || "https";
        return stripTrailingSlash(`${proto}://${host}`);
    }

    const appUrl = getAppUrl();
    if (appUrl) {
        return stripTrailingSlash(appUrl);
    }

    return stripTrailingSlash(req.nextUrl.origin);
}

/** Build a redirect URL using the public app origin (not internal req.url behind nginx). */
export function buildAppRedirectUrl(req: NextRequest, pathname: string): URL {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return new URL(path, `${getGoogleOAuthBaseUrl(req)}/`);
}
