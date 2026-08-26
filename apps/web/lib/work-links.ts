/**
 * Thin-page hrefs for conversation ↔ work deep links.
 * Suggestion detail stays on {@link reviewSuggestionHref} in work-suggestions/map.
 */

export function conversationFocusHref(
    conversationId: string,
    query: { msg?: string | null; task?: string | null } = {}
): string {
    const params = new URLSearchParams();
    if (query.msg) params.set("msg", query.msg);
    if (query.task) params.set("task", query.task);
    const qs = params.toString();
    const path = `/c/${encodeURIComponent(conversationId)}`;
    return qs ? `${path}?${qs}` : path;
}

export function conversationMessageHref(
    conversationId: string,
    messageId?: string | null
): string {
    return conversationFocusHref(conversationId, { msg: messageId });
}

export function taskHref(taskId: string): string {
    return `/work/${encodeURIComponent(taskId)}`;
}

export function inboxSuggestionHref(suggestionId: string): string {
    const params = new URLSearchParams({ suggestion: suggestionId });
    return `/inbox?${params.toString()}`;
}

export function boardTaskHref(taskId: string): string {
    const params = new URLSearchParams({ task: taskId });
    return `/inbox/board?${params.toString()}`;
}
