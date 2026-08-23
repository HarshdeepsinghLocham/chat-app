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

export function parsePort(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw || String(fallback), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
