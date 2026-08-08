"use client";

import { useEffect } from "react";
import useWorkSuggestionStore from "@/store/work-suggestion-store";

export function useConversationWorkSuggestions(conversationId: string) {
    const loadConversation = useWorkSuggestionStore((s) => s.loadConversation);
    const refreshConversation = useWorkSuggestionStore((s) => s.refreshConversation);
    const suggestionIdByMessageId = useWorkSuggestionStore(
        (s) => s.suggestionIdByMessageId[conversationId] ?? EMPTY_MAP
    );
    const loading = useWorkSuggestionStore((s) => Boolean(s.loadingByConversation[conversationId]));
    const error = useWorkSuggestionStore((s) => s.errorByConversation[conversationId] ?? null);

    useEffect(() => {
        if (!conversationId) return;
        void loadConversation(conversationId);
    }, [conversationId, loadConversation]);

    return {
        suggestionIdByMessageId,
        loading,
        error,
        refresh: () => refreshConversation(conversationId),
        getSuggestionId: (messageId: string) => suggestionIdByMessageId[String(messageId)] ?? null,
    };
}

const EMPTY_MAP: Record<string, string> = {};
