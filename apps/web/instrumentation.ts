function nodeModuleFileUrl(relativeToCwd: string): string {
    const absolute = `${process.cwd()}/${relativeToCwd}`.replace(/\\/g, "/");
    return absolute.startsWith("/")
        ? `file://${absolute}`
        : `file:///${absolute}`;
}

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") {
        return;
    }

    const { ensureDefaultMetrics, getCorrelationId } = await import(
        /* webpackIgnore: true */
        "@semantask/observability"
    );
    const { startTracing } = await import(
        /* webpackIgnore: true */
        "@semantask/observability/tracing"
    );
    const { setCorrelationIdResolver } = await import(
        /* webpackIgnore: true */
        "@semantask/types/utils/internal-bridge-auth"
    );

    ensureDefaultMetrics("web");
    startTracing("web");
    setCorrelationIdResolver(() => getCorrelationId());

    // Load warmup as a plain Node module via absolute file URL.
    // Do not import node:/mongoose in this file — webpack cannot handle node:
    // URIs here, and bundling mongoose fails with "Can't resolve 'net'".
    // Relative webpackIgnore imports also break once Next emits to .next/server/.
    // Do not import @semantask/db here — it is not in apps/web tsconfig paths and
    // fails `tsc --noEmit` even when webpackIgnore would skip bundling.
    try {
        const dynamicImport = new Function(
            "specifier",
            "return import(specifier)"
        ) as (specifier: string) => Promise<unknown>;
        await dynamicImport(nodeModuleFileUrl("instrumentation.node.mjs"));
    } catch (error) {
        console.error(
            JSON.stringify({
                event: "web.mongo.warmup_failed",
                message: error instanceof Error ? error.message : String(error),
            })
        );
    }
}
