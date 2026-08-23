import { firstNonEmpty } from "./parse";

export function getAccessTokenSecret(): string | undefined {
    return firstNonEmpty(process.env.ACCESS_TOKEN_SECRET);
}

/** Web middleware talks to internal worker-audience routes. */
export function getInternalWorkerSecret(): string | undefined {
    return firstNonEmpty(
        process.env.INTERNAL_SECRET_WORKER,
        process.env.INTERNAL_SECRET,
    );
}
