import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const visitedEnvPaths = new Set<string>();

/**
 * Walk parent directories for `.env` (same as the historical socket entrypoint).
 * Does not load `.env.local`.
 */
export function loadSocketEnv(): void {
    const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    let scanDir = currentDir;

    for (let depth = 0; depth < 8; depth += 1) {
        const envPath = path.join(scanDir, ".env");

        if (!visitedEnvPaths.has(envPath) && existsSync(envPath)) {
            loadEnv({ path: envPath });
            visitedEnvPaths.add(envPath);
        }

        const parent = path.dirname(scanDir);
        if (parent === scanDir) {
            break;
        }
        scanDir = parent;
    }
}

loadSocketEnv();
