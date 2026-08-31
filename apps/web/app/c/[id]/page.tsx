"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import ChatWorkspace from "@/components/home/chat-workspace";
import { DeepLinkAccessView } from "@/components/deep-links/deep-link-access";
import { ApiHttpError, getConversation } from "@/lib/utils/api";
import useChatStore from "@/store/chat-store";

export default function ConversationDeepLinkPage() {
    const params = useParams<{ id: string }>();
    const id = typeof params?.id === "string" ? params.id : "";

    const upsertConversation = useChatStore((s) => s.upsertConversation);
    const setSelectedConversation = useChatStore((s) => s.setSelectedConversation);

    const [loading, setLoading] = useState(true);
    const [ready, setReady] = useState(false);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setReady(false);
            setErrorStatus(404);
            setErrorMessage("Missing conversation id");
            return;
        }

        let cancelled = false;
        setLoading(true);
        setReady(false);
        setErrorStatus(null);
        setErrorMessage(null);

        void (async () => {
            try {
                const conversation = await getConversation(id);
                if (cancelled) return;
                upsertConversation(conversation);
                setSelectedConversation(conversation);
                setReady(true);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiHttpError) {
                    setErrorStatus(error.status);
                    setErrorMessage(error.message);
                } else {
                    setErrorStatus(500);
                    setErrorMessage(
                        error instanceof Error ? error.message : "Failed to load conversation"
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id, upsertConversation, setSelectedConversation]);

    if (loading) {
        return <DeepLinkAccessView resource="conversation" loading />;
    }

    if (errorStatus != null || !ready) {
        return (
            <DeepLinkAccessView
                resource="conversation"
                errorStatus={errorStatus ?? 500}
                errorMessage={errorMessage}
            />
        );
    }

    return (
        <Suspense fallback={null}>
            <ChatWorkspace />
        </Suspense>
    );
}
