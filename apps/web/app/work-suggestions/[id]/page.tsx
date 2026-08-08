"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { WorkSuggestionRecord } from "@semantask/types";
import { ApiHttpError, getWorkSuggestion } from "@/lib/utils/api";
import { WorkSuggestionDetailView } from "@/components/work-suggestions/work-suggestion-detail";

export default function WorkSuggestionDetailPage() {
    const params = useParams<{ id: string }>();
    const id = typeof params?.id === "string" ? params.id : "";

    const [loading, setLoading] = useState(true);
    const [suggestion, setSuggestion] = useState<WorkSuggestionRecord | null>(null);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setErrorStatus(404);
            setErrorMessage("Missing suggestion id");
            return;
        }

        let cancelled = false;
        setLoading(true);
        setErrorStatus(null);
        setErrorMessage(null);

        void (async () => {
            try {
                const record = await getWorkSuggestion(id);
                if (cancelled) return;
                setSuggestion(record);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiHttpError) {
                    setErrorStatus(error.status);
                    setErrorMessage(error.message);
                } else {
                    setErrorStatus(500);
                    setErrorMessage(error instanceof Error ? error.message : "Failed to load suggestion");
                }
                setSuggestion(null);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id]);

    return (
        <WorkSuggestionDetailView
            loading={loading}
            errorStatus={errorStatus}
            errorMessage={errorMessage}
            suggestion={suggestion}
        />
    );
}
