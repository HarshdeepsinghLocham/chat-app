import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const visitedEnvPaths = new Set<string>();

/**
 * Walk parent directories for `.env.local` then `.env` (same order as the
 * historical task-worker entrypoint). Safe to call more than once.
 */
export function loadWorkerEnv(): void {
    // Start at the worker package root (parent of config/), matching the
    // historical walk from index.ts rather than this file's directory.
    const currentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    let scanDir = currentDir;

    for (let depth = 0; depth < 8; depth += 1) {
        const envCandidates = [
            path.join(scanDir, ".env.local"),
            path.join(scanDir, ".env"),
        ];

        for (const envPath of envCandidates) {
            if (!visitedEnvPaths.has(envPath) && existsSync(envPath)) {
                loadEnv({ path: envPath });
                visitedEnvPaths.add(envPath);
            }
        }

        const parent = path.dirname(scanDir);
        if (parent === scanDir) {
            break;
        }
        scanDir = parent;
    }
}

loadWorkerEnv();
