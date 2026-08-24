import type { ExecutionMode } from "@semantask/types";
import { parseCsvSet } from "./parse";

const EXECUTION_MODES: readonly ExecutionMode[] = [
    "suggest_only",
    "require_approval",
    "auto_execute",
];

export function isExecutionModeValue(value: unknown): value is ExecutionMode {
    return typeof value === "string"
        && (EXECUTION_MODES as readonly string[]).includes(value);
}

/** Parse DEFAULT_EXECUTION_MODE (default suggest_only). */
export function parseDefaultExecutionMode(raw?: string | null): ExecutionMode {
    const value = (raw ?? process.env.DEFAULT_EXECUTION_MODE ?? "suggest_only").trim().toLowerCase();
    return isExecutionModeValue(value) ? value : "suggest_only";
}

/** Execution mode is always enforced. Env `EXECUTION_MODE_ENFORCE` is not read. */
export function isExecutionModeEnforce(): boolean {
    return true;
}

export function parseGrandfatherAutoTenants(raw?: string | null): Set<string> {
    return parseCsvSet(raw ?? process.env.GRANDFATHER_AUTO_TENANTS ?? "");
}

/**
 * Overlay order for workspace execution mode (call-time; do not cache):
 *
 *   1. Code default — `suggest_only`
 *   2. `DEFAULT_EXECUTION_MODE` env
 *   3. `OrganizationPolicy.executionMode` when set
 *   4. `GRANDFATHER_AUTO_TENANTS` — listed org IDs force `auto_execute`
 *
 * Personal workspaces (`organizationId` null) use 1–2 only.
 * Execution mode is always enforced (not an overlay layer).
 */
export function getEffectiveExecutionMode(args: {
    organizationId?: string | null;
    executionMode?: ExecutionMode | null;
}): ExecutionMode {
    const organizationId = args.organizationId ?? null;
    if (organizationId && parseGrandfatherAutoTenants().has(organizationId)) {
        return "auto_execute";
    }
    if (args.executionMode && isExecutionModeValue(args.executionMode)) {
        return args.executionMode;
    }
    return parseDefaultExecutionMode();
}
