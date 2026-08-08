import type { WorkSuggestionRecord } from "@semantask/types";

/**
 * Map messageId → suggestionId for proposed (or provided) suggestions.
 * First occurrence wins when multiple rows share a messageId.
 */
export function buildSuggestionIdByMessageId(
    items: ReadonlyArray<Pick<WorkSuggestionRecord, "_id" | "messageId">>
): Record<string, string> {
    const map: Record<string, string> = {};
    for (const item of items) {
        const messageId = String(item.messageId);
        if (!messageId || map[messageId]) continue;
        map[messageId] = String(item._id);
    }
    return map;
}

export function reviewSuggestionHref(suggestionId: string | null | undefined): string | null {
    if (!suggestionId) return null;
    return `/work-suggestions/${suggestionId}`;
}
