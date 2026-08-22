import assert from "node:assert/strict";
import test from "node:test";
import {
    getAllowedOrigins,
    getSocketPort,
    getWebServerUrl,
} from "../config/runtime.js";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
    try {
        fn();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test("socket port defaults to 3001", () => {
    withEnv({ PORT: undefined }, () => {
        assert.equal(getSocketPort(), 3001);
    });
});

test("ORIGIN is split into allowed origins", () => {
    withEnv({ ORIGIN: "https://a.example, https://b.example" }, () => {
        assert.deepEqual(getAllowedOrigins(), ["https://a.example", "https://b.example"]);
    });
});

test("WEB_SERVER_URL is trimmed", () => {
    withEnv({ WEB_SERVER_URL: "  http://web.internal  " }, () => {
        assert.equal(getWebServerUrl(), "http://web.internal");
    });
});
