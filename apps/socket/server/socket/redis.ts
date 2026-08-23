import { Redis } from "ioredis";
import { getRedisUrl, isProduction } from "../../config/runtime.js";

type InMemoryValue = {
    value: string;
    expiresAt?: number;
};

type InMemoryState = {
    strings: Map<string, InMemoryValue>;
    sets: Map<string, Set<string>>;
};

class InMemoryRedisBatch {
    private commands: Array<() => Promise<unknown>> = [];

    constructor(private readonly client: InMemoryRedisClient) { }

    set(key: string, value: string, ex?: string, ttl?: number) {
        this.commands.push(() => this.client.set(key, value, ex, ttl));
        return this;
    }

    del(...keys: string[]) {
        this.commands.push(() => this.client.del(...keys));
        return this;
    }

    sadd(key: string, ...members: string[]) {
        this.commands.push(() => this.client.sadd(key, ...members));
        return this;
    }

    srem(key: string, ...members: string[]) {
        this.commands.push(() => this.client.srem(key, ...members));
        return this;
    }

    exists(key: string) {
        this.commands.push(() => this.client.exists(key));
        return this;
    }

    scard(key: string) {
        this.commands.push(() => this.client.scard(key));
        return this;
    }

    async exec(): Promise<Array<[null, unknown]>> {
        const results: Array<[null, unknown]> = [];
        for (const command of this.commands) {
            results.push([null, await command()]);
        }
        return results;
    }
}

class InMemoryRedisClient {
    constructor(private readonly state: InMemoryState) { }

    on() {
        return this;
    }

    async connect() {
        return "OK";
    }

    disconnect() {
        return;
    }

    private cleanExpired(key: string) {
        const entry = this.state.strings.get(key);
        if (!entry?.expiresAt) return;
        if (Date.now() >= entry.expiresAt) {
            this.state.strings.delete(key);
        }
    }

    async set(key: string, value: string, ex?: string, ttl?: number) {
        const upper = typeof ex === "string" ? ex.toUpperCase() : undefined;
        const expiresAt = upper === "EX" && typeof ttl === "number"
            ? Date.now() + ttl * 1000
            : undefined;

        this.state.strings.set(key, { value: String(value), expiresAt });
        return "OK";
    }

    async get(key: string) {
        this.cleanExpired(key);
        return this.state.strings.get(key)?.value ?? null;
    }

    async del(...keys: string[]) {
        let deleted = 0;
        for (const key of keys) {
            if (this.state.strings.delete(key)) deleted += 1;
            if (this.state.sets.delete(key)) deleted += 1;
        }
        return deleted;
    }

    async sadd(key: string, ...members: string[]) {
        const set = this.state.sets.get(key) ?? new Set<string>();
        let added = 0;
        for (const member of members) {
            if (!set.has(member)) {
                set.add(member);
                added += 1;
            }
        }
        this.state.sets.set(key, set);
        return added;
    }

    async srem(key: string, ...members: string[]) {
        const set = this.state.sets.get(key);
        if (!set) return 0;

        let removed = 0;
        for (const member of members) {
            if (set.delete(member)) {
                removed += 1;
            }
        }
        if (set.size === 0) {
            this.state.sets.delete(key);
        }
        return removed;
    }

    async smembers(key: string) {
        return Array.from(this.state.sets.get(key) ?? []);
    }

    async scard(key: string) {
        return (this.state.sets.get(key) ?? new Set<string>()).size;
    }

    async srandmember(key: string) {
        const members = Array.from(this.state.sets.get(key) ?? []);
        if (members.length === 0) return null;
        return members[Math.floor(Math.random() * members.length)];
    }

    async exists(key: string) {
        this.cleanExpired(key);
        return this.state.strings.has(key) || this.state.sets.has(key) ? 1 : 0;
    }

    pipeline() {
        return new InMemoryRedisBatch(this);
    }

    multi() {
        return new InMemoryRedisBatch(this);
    }
}

export interface RedisAdapterClients {
    pubClient: Redis;
    subClient: Redis;
    appClient: Redis;
    isMock?: boolean;
}

export async function initRedis(): Promise<RedisAdapterClients> {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
        if (isProduction()) {
            throw new Error("REDIS_URL is required to initialize socket Redis clients");
        }

        console.warn("⚠️ REDIS_URL missing. Falling back to in-memory Redis for development.");
        const state: InMemoryState = { strings: new Map(), sets: new Map() };
        const mockFactory = () => new InMemoryRedisClient(state) as unknown as Redis;

        return {
            pubClient: mockFactory(),
            subClient: mockFactory(),
            appClient: mockFactory(),
            isMock: true,
        };
    }

    const pubClient = new Redis(redisUrl, { lazyConnect: true });
    const subClient = new Redis(redisUrl, { lazyConnect: true });
    const appClient = new Redis(redisUrl, { lazyConnect: true });

    pubClient.on("error", (err: unknown) => console.error("❌ Redis Pub Error:", err));
    subClient.on("error", (err: unknown) => console.error("❌ Redis Sub Error:", err));
    appClient.on("error", (err: unknown) => console.error("❌ Redis App Error:", err));

    try {
        await pubClient.connect();
        await subClient.connect();
        await appClient.connect();
    } catch (error) {
        if (isProduction()) {
            throw error;
        }

        pubClient.disconnect();
        subClient.disconnect();
        appClient.disconnect();

        console.warn("⚠️ Redis unreachable. Falling back to in-memory Redis for development.");
        const state: InMemoryState = { strings: new Map(), sets: new Map() };
        const mockFactory = () => new InMemoryRedisClient(state) as unknown as Redis;

        return {
            pubClient: mockFactory(),
            subClient: mockFactory(),
            appClient: mockFactory(),
            isMock: true,
        };
    }

    console.log("✅ Redis clients connected");

    return { pubClient, subClient, appClient, isMock: false };
}