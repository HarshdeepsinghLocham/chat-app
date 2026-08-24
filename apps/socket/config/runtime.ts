import { firstNonEmpty, parseCommaSeparatedValues, parsePort } from "./parse.js";

export function isProduction(): boolean {
    return process.env.NODE_ENV === "production";
}

export function getSocketPort(): number {
    return parsePort(process.env.PORT, 3001);
}

export function getOriginRaw(): string | undefined {
    return process.env.ORIGIN;
}

export function getAllowedOrigins(): string[] {
    return parseCommaSeparatedValues(process.env.ORIGIN);
}

export function getRedisUrl(): string | undefined {
    return process.env.REDIS_URL;
}

export function getWebServerUrl(): string | undefined {
    return firstNonEmpty(process.env.WEB_SERVER_URL);
}

export function getAccessTokenSecret(): string | undefined {
    return firstNonEmpty(process.env.ACCESS_TOKEN_SECRET);
}

export type SocketRuntimeConfig = {
    isProduction: boolean;
    port: number;
    originRaw: string | undefined;
    allowedOrigins: string[];
    redisUrl: string | undefined;
    webServerUrl: string | undefined;
};

export function getSocketRuntimeConfig(): SocketRuntimeConfig {
    return {
        isProduction: isProduction(),
        port: getSocketPort(),
        originRaw: getOriginRaw(),
        allowedOrigins: getAllowedOrigins(),
        redisUrl: getRedisUrl(),
        webServerUrl: getWebServerUrl(),
    };
}
