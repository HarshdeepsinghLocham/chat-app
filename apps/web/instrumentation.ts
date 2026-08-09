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

    // Warm the shared mongoose pool so the first authenticated API / socket
    // authz call does not pay a cold Atlas TLS handshake under load.
    try {
        const { connectToDatabase } = await import(
            /* webpackIgnore: true */
            "@/lib/Db/db"
        );
        await connectToDatabase();
    } catch (error) {
        console.error(
            JSON.stringify({
                event: "web.mongo.warmup_failed",
                message: error instanceof Error ? error.message : String(error),
            })
        );
    }
}
