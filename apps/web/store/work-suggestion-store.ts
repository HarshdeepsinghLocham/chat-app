"use client";

import { create } from "zustand";
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

async function fetchConversationSuggestions(
    set: (partial: Partial<WorkSuggestionStore> | ((state: WorkSuggestionStore) => Partial<WorkSuggestionStore>)) => void,
    conversationId: string
): Promise<void> {
    const existing = inFlight.get(conversationId);
    if (existing) {
        await existing;
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
            const result = await listWorkSuggestions({
                conversationId,
                status: "proposed",
                limit: 100,
            });
            const map = buildSuggestionIdByMessageId(result.items);
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
                    [conversationId]: error instanceof Error ? error.message : "Failed to load suggestions",
                },
            }));
        } finally {
            inFlight.delete(conversationId);
        }
    })();

    inFlight.set(conversationId, run);
    await run;
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
