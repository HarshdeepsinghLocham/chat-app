/**
 * Execution FSM is baked to the authoritative stage. The five migration env
 * vars are not read. Call sites keep using the individual helpers.
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

/** Dual-write `executionState` / `stateHistory`. Always on. */
export function isFsmShadowEnabled(): boolean {
    return true;
}

export function getTaskStateProjectionMode(): TaskStateProjectionMode {
    return "enforce";
}

export function isStateDivergenceCheckEnabled(): boolean {
    return true;
}

export function isPolicyShadowEmitEnabled(): boolean {
    return true;
}

export function isRetryShadowEmitEnabled(): boolean {
    return true;
}

export function getFsmRollout(): FsmRollout {
    return "authoritative";
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
