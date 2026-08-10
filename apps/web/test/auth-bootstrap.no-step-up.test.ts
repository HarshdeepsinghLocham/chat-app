function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("authBootstrap (no step-up)", () => {
    beforeEach(() => {
        jest.resetModules();
        jest.useRealTimers();

        (global as any).window = {
            location: {
                pathname: "/",
                search: "",
                href: "/",
            },
        };
        (global as any).BroadcastChannel = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("initializes via /api/me without calling step-up-status or redirecting to challenge", async () => {
        const fetchedUrls: string[] = [];

        jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: unknown[]) => {
            const url = String(args[0] as RequestInfo | URL);
            fetchedUrls.push(url);
            if (url === "/api/me") {
                return jsonResponse({ _id: "u1", email: "a@b.com" });
            }
            return jsonResponse({ error: "Unexpected URL" }, 500);
        });

        const authBootstrap = await import("@/lib/auth/authBootstrap");
        authBootstrap.resetAuthBootstrap();
        await authBootstrap.ensureAuthReady();

        expect(authBootstrap.isAuthenticated).toBe(true);
        expect(fetchedUrls).toEqual(["/api/me"]);
        expect(fetchedUrls.some((url) => url.includes("step-up-status"))).toBe(false);
        expect((global as any).window.location.href).not.toContain("/auth/challenge");
    });

    it("recovers expired access via refresh only — never creates a challenge redirect", async () => {
        let meCalls = 0;
        const fetchedUrls: string[] = [];

        jest.spyOn(global, "fetch" as any).mockImplementation(async (...args: unknown[]) => {
            const url = String(args[0] as RequestInfo | URL);
            fetchedUrls.push(url);
            if (url === "/api/me") {
                meCalls += 1;
                if (meCalls === 1) {
                    return jsonResponse({ error: "Unauthorized" }, 401);
                }
                return jsonResponse({ _id: "u1" });
            }
            if (url === "/api/auth/refresh") {
                return jsonResponse({ success: true });
            }
            return jsonResponse({ error: "Unexpected URL" }, 500);
        });

        const authBootstrap = await import("@/lib/auth/authBootstrap");
        authBootstrap.resetAuthBootstrap();
        await authBootstrap.ensureAuthReady();

        expect(authBootstrap.isAuthenticated).toBe(true);
        expect(fetchedUrls.filter((url) => url === "/api/auth/refresh")).toHaveLength(1);
        expect(fetchedUrls.some((url) => url.includes("step-up-status"))).toBe(false);
        expect(fetchedUrls.some((url) => url.includes("/api/auth/challenge"))).toBe(false);
        expect((global as any).window.location.href).not.toContain("/auth/challenge");
    });
});
