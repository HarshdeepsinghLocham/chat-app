/**
 * Execution FSM migration flags. Env names are unchanged; `getFsmRollout()`
 * is a derived stage for the eventual cutover. Mixed flag combinations still
 * honor each individual parser so this PR does not change runtime behavior.
 */

export type FsmRollout = "legacy" | "shadow" | "align" | "authoritative";
export type TaskStateProjectionMode = "off" | "shadow" | "enforce";

export type FsmMigrationConfig = {
    rollout: FsmRollout;
    shadowEnabled: boolean;
    projectionMode: TaskStateProjectionMode;
    divergenceCheck: boolean;
    policyShadowEmit: boolean;
    retryShadowEmit: boolean;
};

/** Dual-write `executionState` / `stateHistory`. Default on; `"0"` disables. */
export function isFsmShadowEnabled(): boolean {
    return process.env.TASK_EXECUTION_FSM_SHADOW_MODE !== "0";
}

export function getTaskStateProjectionMode(): TaskStateProjectionMode {
    const raw = (process.env.TASK_STATE_PROJECTION_MODE || "off").trim().toLowerCase();
    if (raw === "shadow" || raw === "enforce") {
        return raw;
    }
    return "off";
}

export function isStateDivergenceCheckEnabled(): boolean {
    return process.env.TASK_STATE_DIVERGENCE_CHECK === "1";
}

export function isPolicyShadowEmitEnabled(): boolean {
    return process.env.TASK_POLICY_SHADOW_EMIT === "1" && isFsmShadowEnabled();
}

export function isRetryShadowEmitEnabled(): boolean {
    return process.env.TASK_RETRY_SHADOW_EMIT === "1" && isFsmShadowEnabled();
}

/**
 * Named rollout stage derived from the existing flags.
 *
 * - `legacy` — shadow dual-write off
 * - `authoritative` — projection `enforce` (FSM drives legacy fields)
 * - `align` — shadow on, projection `shadow`, both emit flags on, divergence on
 * - `shadow` — everything else with dual-write on (today's default-ish)
 *
 * Call sites that must preserve mixed-env behavior use the individual helpers
 * above, not this enum.
 */
export function getFsmRollout(): FsmRollout {
    if (getTaskStateProjectionMode() === "enforce") {
        return "authoritative";
    }
    if (!isFsmShadowEnabled()) {
        return "legacy";
    }
    if (
        getTaskStateProjectionMode() === "shadow"
        && isPolicyShadowEmitEnabled()
        && isRetryShadowEmitEnabled()
        && isStateDivergenceCheckEnabled()
    ) {
        return "align";
    }
    return "shadow";
}

export function getFsmMigrationConfig(): FsmMigrationConfig {
    return {
        rollout: getFsmRollout(),
        shadowEnabled: isFsmShadowEnabled(),
        projectionMode: getTaskStateProjectionMode(),
        divergenceCheck: isStateDivergenceCheckEnabled(),
        policyShadowEmit: isPolicyShadowEmitEnabled(),
        retryShadowEmit: isRetryShadowEmitEnabled(),
    };
}
