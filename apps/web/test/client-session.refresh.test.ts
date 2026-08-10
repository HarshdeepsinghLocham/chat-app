function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("refreshSession (no step-up)", () => {
    beforeEach(() => {
        jest.resetModules();
        jest.useRealTimers();

        (global as any).window = {
            location: {
                pathname: "/",
                search: "",
                href: "/",
            },
            __authRefreshInFlight__: null,
        };
        (global as any).BroadcastChannel = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("treats successful refresh as ok without redirecting to /auth/challenge", async () => {
        jest.spyOn(global, "fetch" as any).mockImplementation(async () =>
            jsonResponse({ success: true }, 200)
        );

        const { refreshSession } = await import("@/lib/utils/auth/client-session");
        const result = await refreshSession();

        expect(result).toEqual({ ok: true });
        expect((global as any).window.location.href).not.toContain("/auth/challenge");
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/auth/refresh",
            expect.objectContaining({ method: "POST", credentials: "include" })
        );
    });

    it("maps 401 refresh failure to unauthorized without challenge redirect", async () => {
        jest.spyOn(global, "fetch" as any).mockImplementation(async () =>
            jsonResponse({ success: false, error: "Unauthorized" }, 401)
        );

        const { refreshSession } = await import("@/lib/utils/auth/client-session");
        const result = await refreshSession();

        expect(result).toEqual({ ok: false, reason: "unauthorized" });
        expect((global as any).window.location.href).not.toContain("/auth/challenge");
    });

    it("does not treat legacy STEP_UP_REQUIRED as a special redirect reason", async () => {
        jest.spyOn(global, "fetch" as any).mockImplementation(async () =>
            jsonResponse(
                {
                    success: false,
                    error: "STEP_UP_REQUIRED",
                    challengeId: "dead-challenge",
                },
                403
            )
        );

        const { refreshSession } = await import("@/lib/utils/auth/client-session");
        const result = await refreshSession();

        // Without step-up handling, a 403 is a transient auth failure — not a challenge redirect.
        expect(result).toEqual({ ok: false, reason: "transient" });
        expect((global as any).window.location.href).not.toContain("/auth/challenge");
        expect((global as any).window.location.href).not.toContain("dead-challenge");
    });
});
