/**
 * Call-time env parsers. Do not cache process.env at module load — tests
 * mutate flags between cases.
 */

export function isEnvFlagEnabled(
    raw: string | null | undefined,
    defaultEnabled: boolean
): boolean {
    const source = raw ?? (defaultEnabled ? "1" : "0");
    const value = source.trim().toLowerCase();
    if (value === "1" || value === "true" || value === "on") {
        return true;
    }
    if (value === "0" || value === "false" || value === "off") {
        return false;
    }
    return defaultEnabled;
}

export function parseCsvSet(raw?: string | null): Set<string> {
    const source = raw ?? "";
    return new Set(
        source
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
    );
}
