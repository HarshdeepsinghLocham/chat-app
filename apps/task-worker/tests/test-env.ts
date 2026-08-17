/**
 * Test-only defaults for internal service auth.
 * Production startup still requires INTERNAL_SECRET to be configured explicitly.
 */
if (!process.env.INTERNAL_SECRET?.trim()) {
    process.env.INTERNAL_SECRET = "test-internal-secret";
}

/**
 * AgentRunner unit tests exercise tool execution. Production now defaults
 * EXECUTION_MODE_ENFORCE=1 with DEFAULT_EXECUTION_MODE=suggest_only, which
 * denies tools in ToolExecutor. Keep shadow mode unless a test sets this.
 */
if (!process.env.EXECUTION_MODE_ENFORCE?.trim()) {
    process.env.EXECUTION_MODE_ENFORCE = "0";
}
