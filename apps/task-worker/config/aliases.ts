import { warnIfAliasOnly, warnOnce } from "./parse.js";

/**
 * Call once at worker boot. Dual-read aliases stay; this only warns.
 * LLM vendor keys (`OPENAI_API_KEY`, …) were already hard-cut — not listed here.
 */
export function warnDeprecatedWorkerAliases(): void {
    warnIfAliasOnly("TASK_AGENT_MODEL", "LLM_MODEL");
    warnIfAliasOnly("TASK_AGENT_MODEL", "HUGGINGFACE_MODEL");
    warnIfAliasOnly("TASK_WORKER_ALLOWED_EMAIL_DOMAINS", "ALLOWED_EMAIL_DOMAINS");
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
