/**
 * Call-time parsers. Do not cache process.env at module load — tests mutate flags.
 */

export function parsePositiveNumber(raw: string | undefined, fallback: number): number {
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePositiveInt(raw: string | undefined, fallback: number, min = 1): number {
    const parsed = Number(raw || fallback);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }
    return Math.floor(parsed);
}

export function parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }
    return value === "true" || value === "1";
}

export function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return undefined;
}

export function parseCsvLowercase(raw: string | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
}

const warnedKeys = new Set<string>();

export function resetAliasWarnings(): void {
    warnedKeys.clear();
}

export function warnOnce(key: string, message: string): void {
    if (warnedKeys.has(key)) {
        return;
    }
    warnedKeys.add(key);
    console.warn(message);
}

/** Boot-time: warn when only the deprecated alias is set. Canonical still dual-reads. */
export function warnIfAliasOnly(canonical: string, alias: string): void {
    const canonicalSet = Boolean(process.env[canonical]?.trim());
    const aliasSet = Boolean(process.env[alias]?.trim());
    if (canonicalSet || !aliasSet) {
        return;
    }
    warnOnce(
        `${canonical}:${alias}`,
        `[config] ${alias} is deprecated; set ${canonical}. Alias still accepted.`,
    );
}
