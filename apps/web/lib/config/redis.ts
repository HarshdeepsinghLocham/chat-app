import { firstNonEmpty } from "./parse";

export type UpstashRestConfig = {
    url: string;
    token: string;
};

export function getRedisUrl(): string | undefined {
    return firstNonEmpty(process.env.REDIS_URL);
}

export function getUpstashRestConfig(): UpstashRestConfig | undefined {
    const url = firstNonEmpty(process.env.UPSTASH_REDIS_REST_URL);
    const token = firstNonEmpty(process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!url || !token) {
        return undefined;
    }
    return { url, token };
}
