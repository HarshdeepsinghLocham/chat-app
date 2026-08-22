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

/** EXECUTION_MODE_ENFORCE=0|1 (default 1 / enforce). */
export function isExecutionModeEnforce(raw?: string | null): boolean {
    const value = (raw ?? process.env.EXECUTION_MODE_ENFORCE ?? "1").trim().toLowerCase();
    return value === "1" || value === "true" || value === "enforce";
}

export function parseGrandfatherAutoTenants(raw?: string | null): Set<string> {
    return parseCsvSet(raw ?? process.env.GRANDFATHER_AUTO_TENANTS ?? "");
}

/**
 * Resolve effective workspace execution mode.
 * Grandfather list → org field → DEFAULT_EXECUTION_MODE / suggest_only.
 * Missing org field is treated as suggest_only via the default env path.
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
