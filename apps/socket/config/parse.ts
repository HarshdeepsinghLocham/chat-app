/**
 * Call-time parsers. Do not cache process.env at module load — tests mutate flags.
 */

export function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return undefined;
}

export function parseCommaSeparatedValues(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

export function parsePort(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw || String(fallback), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
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
