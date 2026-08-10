/* Centralized auth bootstrap and single-flight refresh coordination
   - Exposes ensureAuthReady(), authReady, authLoading, isAuthenticated
   - Uses existing refreshSession() for single-flight refresh across tabs
   - Provides instrumentation for duplicate refresh detection
*/
import { redirectToLogin, refreshSession } from "@/lib/utils/auth/client-session";
import type { ClientUser } from "@semantask/types";

let bootstrapPromise: Promise<void> | null = null;
export let authReady = false;
export let authLoading = true;
export let isAuthenticated = false;
/** Populated when bootstrap /api/me succeeds; consumed once by UserContext. */
let bootstrappedMe: ClientUser | null = null;

async function cacheMeFromResponse(resp: Response): Promise<void> {
    try {
        const body = (await resp.clone().json()) as ClientUser;
        if (body && typeof body === "object" && "_id" in body) {
            bootstrappedMe = body;
        }
    } catch {
        // Leave cache empty; callers can refetch /api/me.
    }
}

/** One-shot handoff of the bootstrap /api/me body to avoid a duplicate fetch. */
export function consumeBootstrappedMe(): ClientUser | null {
    const user = bootstrappedMe;
    bootstrappedMe = null;
    return user;
}

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMe() {
    return fetch("/api/me", { cache: "no-store", credentials: "include" });
}

/**
 * When the access token is missing/expired but a refresh cookie may exist, refresh once (with the same
 * transient retry as authenticatedFetch) then re-check /api/me so downstream requests avoid a 401 storm.
 */
async function recoverSessionAndMe(): Promise<boolean> {
    let refreshed = await refreshSession();
    if (refreshed.ok) {
        const me = await fetchMe();
        if (me.ok) {
            await cacheMeFromResponse(me);
        }
        return me.ok;
    }

    if (refreshed.ok === false && refreshed.reason === "step_up") {
        return false;
    }

    if (refreshed.ok === false && refreshed.reason === "rate_limited") {
        return false;
    }

    if (refreshed.ok === false && refreshed.reason === "transient") {
        await wait(250);
        refreshed = await refreshSession();
        if (refreshed.ok) {
            const me = await fetchMe();
            if (me.ok) {
                await cacheMeFromResponse(me);
            }
            return me.ok;
        }
        if (refreshed.ok === false && refreshed.reason === "unauthorized") {
            redirectToLogin();
            return false;
        }
    }

    if (refreshed.ok === false && refreshed.reason === "unauthorized") {
        redirectToLogin();
        return false;
    }

    return false;
}

export function resetAuthBootstrap() {
    authReady = false;
    isAuthenticated = false;
    authLoading = true;
    bootstrapPromise = null;
    bootstrappedMe = null;
}

/** Ensure auth initialization runs once and completes before protected requests */
export function ensureAuthReady(): Promise<void> {
    if (authReady) return Promise.resolve();
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
        authLoading = true;
        const startedAt = now();

        try {
            try {
                const resp = await fetchMe();
                if (resp.ok) {
                    await cacheMeFromResponse(resp);
                    authReady = true;
                    isAuthenticated = true;
                    return;
                }

                if (resp.status === 401) {
                    const recovered = await recoverSessionAndMe();
                    if (recovered) {
                        authReady = true;
                        isAuthenticated = true;
                        return;
                    }
                }
            } catch {
                // network error - can't determine auth status, will be handled by API layer
            }

            authReady = true;
            isAuthenticated = false;
        } finally {
            authLoading = false;
            const duration = Math.round((now() - startedAt));
            console.debug("authBootstrap: completed", { authReady, isAuthenticated, duration });
            bootstrapPromise = null;
        }
    })();

    return bootstrapPromise;
}

// Lightweight helper for code paths that want a boolean
export async function waitForAuthReady(): Promise<{ authReady: boolean; isAuthenticated: boolean }> {
    await ensureAuthReady();
    return { authReady, isAuthenticated };
}
