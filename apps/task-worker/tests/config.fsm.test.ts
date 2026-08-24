import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
    getFsmMigrationConfig,
    getFsmRollout,
    getTaskStateProjectionMode,
    isFsmShadowEnabled,
    isPolicyShadowEmitEnabled,
    isRetryShadowEmitEnabled,
    isStateDivergenceCheckEnabled,
} from "../config/migration.js";

test("FSM helpers are baked to authoritative", () => {
    assert.equal(isFsmShadowEnabled(), true);
    assert.equal(getTaskStateProjectionMode(), "enforce");
    assert.equal(isStateDivergenceCheckEnabled(), true);
    assert.equal(isPolicyShadowEmitEnabled(), true);
    assert.equal(isRetryShadowEmitEnabled(), true);
    assert.equal(getFsmRollout(), "authoritative");
    assert.deepEqual(getFsmMigrationConfig(), {
        rollout: "authoritative",
        shadowEnabled: true,
        projectionMode: "enforce",
        divergenceCheck: true,
        policyShadowEmit: true,
        retryShadowEmit: true,
    });
});

test("FSM helpers ignore former migration env vars", () => {
    const keys = [
        "TASK_EXECUTION_FSM_SHADOW_MODE",
        "TASK_STATE_PROJECTION_MODE",
        "TASK_STATE_DIVERGENCE_CHECK",
        "TASK_POLICY_SHADOW_EMIT",
        "TASK_RETRY_SHADOW_EMIT",
    ] as const;
    const previous: Record<string, string | undefined> = {};
    for (const key of keys) {
        previous[key] = process.env[key];
        process.env[key] = "0";
    }
    process.env.TASK_STATE_PROJECTION_MODE = "off";
    try {
        assert.equal(isFsmShadowEnabled(), true);
        assert.equal(getTaskStateProjectionMode(), "enforce");
        assert.equal(isStateDivergenceCheckEnabled(), true);
        assert.equal(isPolicyShadowEmitEnabled(), true);
        assert.equal(isRetryShadowEmitEnabled(), true);
        assert.equal(getFsmRollout(), "authoritative");
    } finally {
        for (const key of keys) {
            const value = previous[key];
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
});
