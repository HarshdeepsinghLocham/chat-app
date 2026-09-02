"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { TaskPriority, WorkSuggestionRecord } from "@semantask/types";
import {
    ApiHttpError,
    acceptWorkSuggestionApi,
    assignWorkSuggestionApi,
    dismissWorkSuggestionApi,
    getWorkSuggestion,
    requestTaskExecutionApi,
} from "@/lib/utils/api";
import { WorkSuggestionDetailView } from "@/components/work-suggestions/work-suggestion-detail";
import { useUser } from "@/context/UserContext";
import { useActiveOrganization } from "@/lib/hooks/useActiveOrganization";
import { useOrganizationMembers } from "@/lib/queries/use-organizations";
import type { OrgMemberOption } from "@/components/work-suggestions/work-inbox-triage";

export default function WorkSuggestionDetailPage() {
    const params = useParams<{ id: string }>();
    const id = typeof params?.id === "string" ? params.id : "";
    const { user } = useUser();
    const { organizationId: activeOrgId } = useActiveOrganization();

    const [loading, setLoading] = useState(true);
    const [suggestion, setSuggestion] = useState<WorkSuggestionRecord | null>(null);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [actionPending, setActionPending] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const organizationId = suggestion?.organizationId ?? activeOrgId;
    const membersQuery = useOrganizationMembers(organizationId);
    const members: OrgMemberOption[] = useMemo(
        () =>
            (membersQuery.data ?? []).map((member) => ({
                userId: member.userId,
                role: member.role,
                user: member.user ?? { id: member.userId, username: "Unknown user" },
            })),
        [membersQuery.data]
    );

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

    const runAction = async (action: () => Promise<void>) => {
        setActionPending(true);
        setActionError(null);
        try {
            await action();
        } catch (error) {
            if (error instanceof ApiHttpError) {
                setActionError(error.message);
            } else {
                setActionError(error instanceof Error ? error.message : "Action failed");
            }
        } finally {
            setActionPending(false);
        }
    };

    return (
        <WorkSuggestionDetailView
            loading={loading}
            errorStatus={errorStatus}
            errorMessage={errorMessage}
            suggestion={suggestion}
            organizationId={organizationId}
            members={members}
            currentUserId={user?._id ?? null}
            actionPending={actionPending}
            actionError={actionError}
            onAccept={async (input) => {
                if (!id) return;
                await runAction(async () => {
                    const result = await acceptWorkSuggestionApi(id, input);
                    setSuggestion(result.suggestion);
                });
            }}
            onDismiss={async (reason) => {
                if (!id) return;
                await runAction(async () => {
                    const result = await dismissWorkSuggestionApi(id, reason);
                    setSuggestion(result);
                });
            }}
            onAssign={async (input: {
                assignees?: string[];
                dueAt?: string | null;
                priority?: TaskPriority;
            }) => {
                if (!id) return;
                await runAction(async () => {
                    const result = await assignWorkSuggestionApi(id, input);
                    setSuggestion(result.suggestion);
                });
            }}
            onAllowAiTools={async () => {
                if (!suggestion?.convertedTaskId) return;
                await runAction(async () => {
                    await requestTaskExecutionApi(suggestion.convertedTaskId as string, {
                        reason: "Manager requested AI tool execution from suggestion detail",
                    });
                });
            }}
        />
    );
}
