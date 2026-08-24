/**
 * Test-only defaults for internal service auth.
 * Production startup still requires INTERNAL_SECRET to be configured explicitly.
 */
if (!process.env.INTERNAL_SECRET?.trim()) {
    process.env.INTERNAL_SECRET = "test-internal-secret";
}

/**
 * AgentRunner unit tests exercise tool execution. Production always enforces
 * execution mode. Default product mode is suggest_only, which denies tools in
 * ToolExecutor — use auto_execute here.
 */
if (!process.env.DEFAULT_EXECUTION_MODE?.trim()) {
    process.env.DEFAULT_EXECUTION_MODE = "auto_execute";
}
