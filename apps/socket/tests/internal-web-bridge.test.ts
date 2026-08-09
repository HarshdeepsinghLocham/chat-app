import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { postToInternalWebApi } from "../server/socket/services/internal-web-bridge.js";

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
