export const DEEP_LINK_HIGHLIGHT_CLASS = "deep-link-highlight";
export const DEEP_LINK_HIGHLIGHT_MS = 2200;

export function inboxSuggestionElementId(suggestionId: string): string {
    return `inbox-suggestion-${suggestionId}`;
}

export function boardTaskElementId(taskId: string): string {
    return `board-task-${taskId}`;
}

export function taskPanelElementId(taskId: string): string {
    return `task-panel-card-${taskId}`;
}

/** Scroll a deep-linked node into view. Returns false when it is not in the DOM. */
export function scrollDeepLinkTarget(elementId: string): boolean {
    const element = document.getElementById(elementId);
    if (!element) return false;
    if (typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ block: "center" });
    }
    return true;
}
