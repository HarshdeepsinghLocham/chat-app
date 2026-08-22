import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
    getEnvAllowedEmailDomains,
    getGitHubIssueConfig,
    getResendConfig,
    getScheduleMeetingWebhookUrl,
} from "../config/tools.js";

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

test("email allowlist prefers TASK_WORKER_ALLOWED_EMAIL_DOMAINS over ALLOWED_EMAIL_DOMAINS", () => {
    withEnv({
        TASK_WORKER_ALLOWED_EMAIL_DOMAINS: "Acme.COM, mail.example.com",
        ALLOWED_EMAIL_DOMAINS: "other.com",
    }, () => {
        assert.deepEqual(getEnvAllowedEmailDomains(), ["acme.com", "mail.example.com"]);
    });
});

test("email allowlist falls back to ALLOWED_EMAIL_DOMAINS", () => {
    withEnv({
        TASK_WORKER_ALLOWED_EMAIL_DOMAINS: undefined,
        ALLOWED_EMAIL_DOMAINS: "fallback.com",
    }, () => {
        assert.deepEqual(getEnvAllowedEmailDomains(), ["fallback.com"]);
    });
});

test("tool credentials are unset when env is empty", () => {
    withEnv({
        RESEND_API_KEY: undefined,
        RESEND_FROM_EMAIL: undefined,
        GITHUB_TOKEN: undefined,
        GITHUB_REPO: undefined,
        SCHEDULE_MEETING_WEBHOOK_URL: undefined,
    }, () => {
        assert.deepEqual(getResendConfig(), { apiKey: undefined, from: undefined });
        assert.deepEqual(getGitHubIssueConfig(), { token: undefined, repo: undefined });
        assert.equal(getScheduleMeetingWebhookUrl(), undefined);
    });
});
