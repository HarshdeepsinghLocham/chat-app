import { createInternalRequestHeaders } from "@semantask/types/utils/internal-bridge-auth";
import { resolveInternalBaseUrl } from "../utils/url.js";

function normalizeUrl(value: string): string {
    return value.trim().replace(/\/$/, "");
}

export function getInternalWebServerUrls(): string[] {
    const configuredWeb = process.env.WEB_SERVER_URL?.trim();
    const configuredOrigin = process.env.ORIGIN
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

    const candidates = [
        configuredWeb,
        ...(configuredOrigin ?? []),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ].filter(Boolean) as string[];

    return Array.from(
        new Set(
            candidates
                .map((candidate) => resolveInternalBaseUrl(candidate) ?? normalizeUrl(candidate))
                .filter(Boolean)
        )
    );
}

type PostInternalOptions = {
    path: string;
    body: unknown;
    timeoutMs?: number;
};

function isStructuredAuthorizationBody(value: unknown): value is Record<string, unknown> {
    return typeof value === "object"
        && value !== null
        && ("allowed" in value || "reason" in value || "userId" in value);
}

/**
 * POST to the web internal bridge. Returns parsed JSON for both success and
 * structured authz denials (e.g. 403 { allowed: false }). Returns null only when
 * no candidate URL produced a usable response (network/timeout/5xx without body).
 */
export async function postToInternalWebApi<TResponse>(
    options: PostInternalOptions
): Promise<TResponse | null> {
    const urls = getInternalWebServerUrls();

    for (const baseUrl of urls) {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            options.timeoutMs ?? 5_000
        );

        try {
            const response = await fetch(`${baseUrl}${options.path}`, {
                method: "POST",
                headers: createInternalRequestHeaders("web"),
                body: JSON.stringify(options.body),
                signal: controller.signal,
            });

            const rawText = await response.text();
            let parsed: unknown = null;
            if (rawText.trim().length > 0) {
                try {
                    parsed = JSON.parse(rawText);
                } catch {
                    parsed = null;
                }
            }

            if (response.ok) {
                return (parsed ?? {}) as TResponse;
            }

            // Authz endpoints return structured { allowed, reason } on 403/401.
            // Treat those as usable responses so callers do not mislabel them as
            // authorization_service_unavailable. Do not short-circuit on 5xx —
            // those should fall through to the next candidate URL.
            if (
                (response.status === 401 || response.status === 403)
                && isStructuredAuthorizationBody(parsed)
            ) {
                return parsed as TResponse;
            }

            // Try next candidate URL for empty/unstructured failures.
        } catch {
            // Try next candidate URL.
        } finally {
            clearTimeout(timeout);
        }
    }

    return null;
}
