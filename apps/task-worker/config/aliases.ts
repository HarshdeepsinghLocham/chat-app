import { warnIfAliasOnly, warnOnce } from "./parse.js";

/**
 * Call once at worker boot. Dual-read of `INTERNAL_SECRET` stays during rotation.
 * Other former aliases are not read.
 */
export function warnDeprecatedWorkerAliases(): void {
    warnIfAliasOnly("INTERNAL_SECRET_SOCKET", "INTERNAL_SECRET");

    const redisUrl = process.env.REDIS_URL?.trim();
    const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    if (!redisUrl && upstashRestUrl) {
        warnOnce(
            "UPSTASH_REDIS_REST_URL",
            "[config] UPSTASH_REDIS_REST_URL is not an ioredis URL for task-worker; set REDIS_URL. Web Upstash REST is unchanged.",
        );
    }
}
