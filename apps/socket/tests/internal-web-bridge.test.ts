import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { postToInternalWebApi } from "../server/socket/services/internal-web-bridge.js";

test("socket authorization bridge never targets step-up challenge endpoints", async () => {
    const previousWeb = process.env.WEB_SERVER_URL;
    const previousOrigin = process.env.ORIGIN;
    const previousSecret = process.env.INTERNAL_SECRET;
    process.env.WEB_SERVER_URL = "http://bridge-test.local";
    process.env.ORIGIN = "http://bridge-test.local";
    process.env.INTERNAL_SECRET = "test-internal-secret";

    const requestedPaths: string[] = [];
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        requestedPaths.push(String(input));
        return new Response(JSON.stringify({ allowed: true, role: "user" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });

    try {
        await postToInternalWebApi({
            path: "/api/internal/socket/authorize-identity",
            body: { userId: "u1", tokenVersion: 0 },
            timeoutMs: 1_000,
        });
        await postToInternalWebApi({
            path: "/api/internal/socket/authorize-conversation-access",
            body: { userId: "u1", conversationId: "c1" },
            timeoutMs: 1_000,
        });

        assert.equal(fetchMock.mock.callCount(), 2);
        for (const url of requestedPaths) {
            assert.equal(url.includes("step-up"), false);
            assert.equal(url.includes("/auth/challenge"), false);
            assert.equal(url.includes("/api/auth/challenge"), false);
        }
    } finally {
        fetchMock.mock.restore();
        if (previousWeb === undefined) delete process.env.WEB_SERVER_URL;
        else process.env.WEB_SERVER_URL = previousWeb;
        if (previousOrigin === undefined) delete process.env.ORIGIN;
        else process.env.ORIGIN = previousOrigin;
        if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
        else process.env.INTERNAL_SECRET = previousSecret;
    }
});

test("postToInternalWebApi returns structured 403 authz body instead of null", async () => {
    const previousWeb = process.env.WEB_SERVER_URL;
    const previousOrigin = process.env.ORIGIN;
    const previousSecret = process.env.INTERNAL_SECRET;
    process.env.WEB_SERVER_URL = "http://bridge-test.local";
    process.env.ORIGIN = "http://bridge-test.local";
    process.env.INTERNAL_SECRET = "test-internal-secret";

    const fetchMock = mock.method(globalThis, "fetch", async () =>
        new Response(JSON.stringify({ allowed: false, reason: "forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
        })
    );

    try {
        const result = await postToInternalWebApi<{ allowed: boolean; reason?: string }>({
            path: "/api/internal/socket/authorize-conversation-access",
            body: { userId: "u1", conversationId: "c1" },
            timeoutMs: 1_000,
        });

        assert.deepEqual(result, { allowed: false, reason: "forbidden" });
        assert.equal(fetchMock.mock.callCount(), 1);
    } finally {
        fetchMock.mock.restore();
        if (previousWeb === undefined) delete process.env.WEB_SERVER_URL;
        else process.env.WEB_SERVER_URL = previousWeb;
        if (previousOrigin === undefined) delete process.env.ORIGIN;
        else process.env.ORIGIN = previousOrigin;
        if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
        else process.env.INTERNAL_SECRET = previousSecret;
    }
});

test("postToInternalWebApi returns null when response is unstructured failure", async () => {
    const previousWeb = process.env.WEB_SERVER_URL;
    const previousOrigin = process.env.ORIGIN;
    const previousSecret = process.env.INTERNAL_SECRET;
    process.env.WEB_SERVER_URL = "http://bridge-test.local";
    process.env.ORIGIN = "http://bridge-test.local";
    process.env.INTERNAL_SECRET = "test-internal-secret";

    const fetchMock = mock.method(globalThis, "fetch", async () =>
        new Response("upstream unavailable", { status: 503 })
    );

    try {
        const result = await postToInternalWebApi({
            path: "/api/internal/socket/authorize-conversation-access",
            body: { userId: "u1", conversationId: "c1" },
            timeoutMs: 1_000,
        });
        assert.equal(result, null);
    } finally {
        fetchMock.mock.restore();
        if (previousWeb === undefined) delete process.env.WEB_SERVER_URL;
        else process.env.WEB_SERVER_URL = previousWeb;
        if (previousOrigin === undefined) delete process.env.ORIGIN;
        else process.env.ORIGIN = previousOrigin;
        if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
        else process.env.INTERNAL_SECRET = previousSecret;
    }
});

test("postToInternalWebApi skips malformed 2xx and tries the next candidate", async () => {
    const previousWeb = process.env.WEB_SERVER_URL;
    const previousOrigin = process.env.ORIGIN;
    const previousSecret = process.env.INTERNAL_SECRET;
    process.env.WEB_SERVER_URL = "http://bridge-primary.local";
    process.env.ORIGIN = "http://bridge-fallback.local";
    process.env.INTERNAL_SECRET = "test-internal-secret";

    let calls = 0;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        calls += 1;
        const url = String(input);
        if (url.includes("bridge-primary.local")) {
            return new Response("not-json", {
                status: 200,
                headers: { "content-type": "text/plain" },
            });
        }
        return new Response(JSON.stringify({ allowed: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });

    try {
        const result = await postToInternalWebApi<{ allowed: boolean }>({
            path: "/api/internal/socket/authorize-conversation-access",
            body: { userId: "u1", conversationId: "c1" },
            timeoutMs: 1_000,
        });

        assert.deepEqual(result, { allowed: true });
        assert.equal(calls >= 2, true);
    } finally {
        fetchMock.mock.restore();
        if (previousWeb === undefined) delete process.env.WEB_SERVER_URL;
        else process.env.WEB_SERVER_URL = previousWeb;
        if (previousOrigin === undefined) delete process.env.ORIGIN;
        else process.env.ORIGIN = previousOrigin;
        if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
        else process.env.INTERNAL_SECRET = previousSecret;
    }
});

test("postToInternalWebApi does not treat structured 500 as final authz denial", async () => {
    const previousWeb = process.env.WEB_SERVER_URL;
    const previousOrigin = process.env.ORIGIN;
    const previousSecret = process.env.INTERNAL_SECRET;
    process.env.WEB_SERVER_URL = "http://bridge-primary.local";
    process.env.ORIGIN = "http://bridge-fallback.local";
    process.env.INTERNAL_SECRET = "test-internal-secret";

    let calls = 0;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
        calls += 1;
        const url = String(input);
        if (url.includes("bridge-primary.local")) {
            return new Response(
                JSON.stringify({ allowed: false, reason: "authorization_service_error" }),
                { status: 500, headers: { "content-type": "application/json" } }
            );
        }
        return new Response(JSON.stringify({ allowed: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });

    try {
        const result = await postToInternalWebApi<{ allowed: boolean; reason?: string }>({
            path: "/api/internal/socket/authorize-conversation-access",
            body: { userId: "u1", conversationId: "c1" },
            timeoutMs: 1_000,
        });

        assert.deepEqual(result, { allowed: true });
        assert.equal(calls >= 2, true);
    } finally {
        fetchMock.mock.restore();
        if (previousWeb === undefined) delete process.env.WEB_SERVER_URL;
        else process.env.WEB_SERVER_URL = previousWeb;
        if (previousOrigin === undefined) delete process.env.ORIGIN;
        else process.env.ORIGIN = previousOrigin;
        if (previousSecret === undefined) delete process.env.INTERNAL_SECRET;
        else process.env.INTERNAL_SECRET = previousSecret;
    }
});
