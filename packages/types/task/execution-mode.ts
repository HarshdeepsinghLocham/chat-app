export const EXECUTION_MODES = ["suggest_only", "require_approval", "auto_execute"] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export function isExecutionMode(value: unknown): value is ExecutionMode {
    return typeof value === "string"
        && (EXECUTION_MODES as readonly string[]).includes(value);
}
