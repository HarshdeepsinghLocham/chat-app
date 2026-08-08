"use client";

import { create } from "zustand";
import type { WorkSuggestionRecord } from "@semantask/types";
import { listWorkSuggestions } from "@/lib/utils/api";
import { buildSuggestionIdByMessageId } from "@/lib/work-suggestions/map";

type WorkSuggestionStore = {
    suggestionIdByMessageId: Record<string, Record<string, string>>;
    loadingByConversation: Record<string, boolean>;
    errorByConversation: Record<string, string | null>;
    loadConversation: (conversationId: string) => Promise<void>;
    refreshConversation: (conversationId: string) => Promise<void>;
    getSuggestionId: (conversationId: string, messageId: string) => string | null;
};

const inFlight = new Map<string, Promise<void>>();
/** Set when a caller joins an in-flight refresh; drained by a trailing fetch. */
const pendingTrailingRefresh = new Set<string>();

const PAGE_LIMIT = 100;

async function fetchAllProposedSuggestions(conversationId: string): Promise<WorkSuggestionRecord[]> {
    const items: WorkSuggestionRecord[] = [];
    let page = 1;
    let totalPages = 1;

    do {
        const result = await listWorkSuggestions({
            conversationId,
            status: "proposed",
            page,
            limit: PAGE_LIMIT,
        });
        items.push(...result.items);
        totalPages = Math.max(1, result.pagination.totalPages || 1);
        page += 1;
    } while (page <= totalPages);

    return items;
}

async function fetchConversationSuggestions(
    set: (partial: Partial<WorkSuggestionStore> | ((state: WorkSuggestionStore) => Partial<WorkSuggestionStore>)) => void,
    conversationId: string
): Promise<void> {
    pendingTrailingRefresh.add(conversationId);

    for (;;) {
        const existing = inFlight.get(conversationId);
        if (existing) {
            await existing;
            if (!pendingTrailingRefresh.has(conversationId) && !inFlight.has(conversationId)) {
                return;
            }
            continue;
        }

        if (!pendingTrailingRefresh.delete(conversationId)) {
            return;
        }

        const run = (async () => {
            set((state) => ({
                loadingByConversation: {
                    ...state.loadingByConversation,
                    [conversationId]: true,
                },
                errorByConversation: {
                    ...state.errorByConversation,
                    [conversationId]: null,
                },
            }));

            try {
                const items = await fetchAllProposedSuggestions(conversationId);
                const map = buildSuggestionIdByMessageId(items);
                set((state) => ({
                    suggestionIdByMessageId: {
                        ...state.suggestionIdByMessageId,
                        [conversationId]: map,
                    },
                    loadingByConversation: {
                        ...state.loadingByConversation,
                        [conversationId]: false,
                    },
                }));
            } catch (error) {
                set((state) => ({
                    loadingByConversation: {
                        ...state.loadingByConversation,
                        [conversationId]: false,
                    },
                    errorByConversation: {
                        ...state.errorByConversation,
                        [conversationId]: error instanceof Error
                            ? error.message
                            : "Failed to load suggestions",
                    },
                }));
            }
        })();

        inFlight.set(conversationId, run);
        try {
            await run;
        } finally {
            inFlight.delete(conversationId);
        }
    }
}

const useWorkSuggestionStore = create<WorkSuggestionStore>((set, get) => ({
    suggestionIdByMessageId: {},
    loadingByConversation: {},
    errorByConversation: {},

    loadConversation: async (conversationId: string) => {
        if (!conversationId) return;
        await fetchConversationSuggestions(set, conversationId);
    },

    refreshConversation: async (conversationId: string) => {
        if (!conversationId) return;
        await fetchConversationSuggestions(set, conversationId);
    },

    getSuggestionId: (conversationId: string, messageId: string) => {
        const map = get().suggestionIdByMessageId[conversationId];
        if (!map) return null;
        return map[String(messageId)] ?? null;
    },
}));

export default useWorkSuggestionStore;

/** Test-only helpers for in-flight / trailing-refresh behavior. */
export const __workSuggestionStoreTestUtils = {
    resetInFlight() {
        inFlight.clear();
        pendingTrailingRefresh.clear();
    },
};
