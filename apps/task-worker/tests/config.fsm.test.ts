import "./test-env.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
    getFsmRollout,
    getTaskStateProjectionMode,
    isFsmShadowEnabled,
    isPolicyShadowEmitEnabled,
    isRetryShadowEmitEnabled,
    isStateDivergenceCheckEnabled,
} from "../config/migration.js";

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

const unsetFsm = {
    TASK_EXECUTION_FSM_SHADOW_MODE: undefined,
    TASK_STATE_PROJECTION_MODE: undefined,
    TASK_STATE_DIVERGENCE_CHECK: undefined,
    TASK_POLICY_SHADOW_EMIT: undefined,
    TASK_RETRY_SHADOW_EMIT: undefined,
};

test("FSM defaults are shadow dual-write with projection and emit off", () => {
    withEnv(unsetFsm, () => {
        assert.equal(isFsmShadowEnabled(), true);
        assert.equal(getTaskStateProjectionMode(), "off");
        assert.equal(isStateDivergenceCheckEnabled(), false);
        assert.equal(isPolicyShadowEmitEnabled(), false);
        assert.equal(isRetryShadowEmitEnabled(), false);
        assert.equal(getFsmRollout(), "shadow");
    });
});

test("TASK_EXECUTION_FSM_SHADOW_MODE=0 derives legacy", () => {
    withEnv({ ...unsetFsm, TASK_EXECUTION_FSM_SHADOW_MODE: "0" }, () => {
        assert.equal(isFsmShadowEnabled(), false);
        assert.equal(isPolicyShadowEmitEnabled(), false);
        assert.equal(isRetryShadowEmitEnabled(), false);
        assert.equal(getFsmRollout(), "legacy");
    });
});

test("projection enforce derives authoritative even when shadow is off", () => {
    withEnv({
        ...unsetFsm,
        TASK_EXECUTION_FSM_SHADOW_MODE: "0",
        TASK_STATE_PROJECTION_MODE: "enforce",
    }, () => {
        assert.equal(isFsmShadowEnabled(), false);
        assert.equal(getTaskStateProjectionMode(), "enforce");
        assert.equal(getFsmRollout(), "authoritative");
    });
});

test("align requires shadow projection, both emits, and divergence", () => {
    withEnv({
        ...unsetFsm,
        TASK_STATE_PROJECTION_MODE: "shadow",
        TASK_POLICY_SHADOW_EMIT: "1",
        TASK_RETRY_SHADOW_EMIT: "1",
        TASK_STATE_DIVERGENCE_CHECK: "1",
    }, () => {
        assert.equal(getFsmRollout(), "align");
        assert.equal(isPolicyShadowEmitEnabled(), true);
        assert.equal(isRetryShadowEmitEnabled(), true);
        assert.equal(isStateDivergenceCheckEnabled(), true);
    });
});

test("mixed flags keep individual parsers; rollout stays shadow", () => {
    withEnv({
        ...unsetFsm,
        TASK_STATE_DIVERGENCE_CHECK: "1",
        TASK_POLICY_SHADOW_EMIT: "1",
    }, () => {
        assert.equal(isStateDivergenceCheckEnabled(), true);
        assert.equal(isPolicyShadowEmitEnabled(), true);
        assert.equal(isRetryShadowEmitEnabled(), false);
        assert.equal(getTaskStateProjectionMode(), "off");
        assert.equal(getFsmRollout(), "shadow");
    });
});
