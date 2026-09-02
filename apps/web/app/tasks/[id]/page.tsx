"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DeepLinkAccessView } from "@/components/deep-links/deep-link-access";
import { ApiHttpError, getTask } from "@/lib/utils/api";

export default function TaskDeepLinkPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = typeof params?.id === "string" ? params.id : "";

    const [loading, setLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setErrorStatus(404);
            setErrorMessage("Missing task id");
            return;
        }

        let cancelled = false;
        setLoading(true);
        setErrorStatus(null);
        setErrorMessage(null);

        void (async () => {
            try {
                const task = await getTask(id);
                if (cancelled) return;
                router.replace(`/work/${encodeURIComponent(task._id)}`);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiHttpError) {
                    setErrorStatus(error.status);
                    setErrorMessage(error.message);
                } else {
                    setErrorStatus(500);
                    setErrorMessage(error instanceof Error ? error.message : "Failed to load task");
                }
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [id, router]);

    if (errorStatus != null) {
        return (
            <DeepLinkAccessView
                resource="task"
                errorStatus={errorStatus}
                errorMessage={errorMessage}
            />
        );
    }

    return <DeepLinkAccessView resource="task" loading={loading} />;
}
