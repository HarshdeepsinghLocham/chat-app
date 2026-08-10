"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { WorkSuggestionRecord, WorkSuggestionStatus } from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ApiHttpError,
    acceptWorkSuggestionApi,
    assignWorkSuggestionApi,
    dismissWorkSuggestionApi,
    getOrganizationMembers,
    listWorkSuggestions,
    requestTaskExecutionApi,
    type WorkSuggestionListResult,
} from "@/lib/utils/api";
import useWorkSuggestionStore from "@/store/work-suggestion-store";
import {
    WorkInboxTriage,
    type OrgMemberOption,
} from "@/components/work-suggestions/work-inbox-triage";

const STORAGE_KEY = "semantask.activeOrganizationId";
const PAGE_LIMIT = 20;

const STATUS_OPTIONS: Array<{ value: "" | WorkSuggestionStatus; label: string }> = [
    { value: "proposed", label: "proposed" },
    { value: "accepted", label: "accepted" },
    { value: "dismissed", label: "dismissed" },
    { value: "converted", label: "converted" },
    { value: "", label: "all" },
];

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

function summarize(text: string, max = 140) {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1)}…`;
}

function ownersForSuggestion(
    item: WorkSuggestionRecord,
    ownerById: Record<string, string[]>
): string[] {
    const overlay = ownerById[item._id];
    if (overlay !== undefined) return overlay;
    // Candidates are extraction hints, not the linked task's current owners.
    if (item.status === "proposed") {
        return item.candidates.assigneeCandidates ?? [];
    }
    return [];
}

function restoreInboxRow(
    current: WorkSuggestionRecord[],
    previousRow: WorkSuggestionRecord
): WorkSuggestionRecord[] {
    const index = current.findIndex((row) => row._id === previousRow._id);
    if (index >= 0) {
        const next = current.slice();
        next[index] = previousRow;
        return next;
    }
    return [previousRow, ...current];
}

export function WorkInboxView() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState("");
    const [status, setStatus] = useState<"" | WorkSuggestionStatus>("proposed");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<WorkSuggestionListResult | null>(null);
    const [items, setItems] = useState<WorkSuggestionRecord[]>([]);
    const [members, setMembers] = useState<OrgMemberOption[]>([]);
    const [ownerById, setOwnerById] = useState<Record<string, string[]>>({});
    const [actingId, setActingId] = useState<string | null>(null);
    const [actionErrorById, setActionErrorById] = useState<Record<string, string | null>>({});
    const loadSeqRef = useRef(0);

    const refreshConversation = useWorkSuggestionStore((state) => state.refreshConversation);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setOrganizationId(window.localStorage.getItem(STORAGE_KEY));
    }, []);

    const scopedConversationId = conversationId.trim() || undefined;
    const hasScope = Boolean(organizationId || scopedConversationId);

    const load = useCallback(async (options?: { quiet?: boolean }) => {
        if (!organizationId && !scopedConversationId) {
            loadSeqRef.current += 1;
            setResult(null);
            setItems([]);
            setError(null);
            setLoading(false);
            return;
        }

        const requestId = ++loadSeqRef.current;
        if (!options?.quiet) {
            setLoading(true);
        }
        setError(null);
        try {
            const data = await listWorkSuggestions({
                organizationId: organizationId ?? undefined,
                conversationId: scopedConversationId,
                status: status || undefined,
                page,
                limit: PAGE_LIMIT,
            });
            if (requestId !== loadSeqRef.current) return;
            setResult(data);
            setItems(data.items);
        } catch (loadError) {
            if (requestId !== loadSeqRef.current) return;
            setResult(null);
            setItems([]);
            if (loadError instanceof ApiHttpError) {
                setError(loadError.message);
            } else {
                setError(loadError instanceof Error ? loadError.message : "Failed to load inbox");
            }
        } finally {
            if (requestId === loadSeqRef.current && !options?.quiet) {
                setLoading(false);
            }
        }
    }, [organizationId, scopedConversationId, status, page]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!organizationId) {
            setMembers([]);
            return;
        }

        let cancelled = false;
        void getOrganizationMembers(organizationId)
            .then((list) => {
                if (cancelled) return;
                setMembers(
                    list.map((member) => ({
                        userId: member.userId,
                        role: member.role,
                    }))
                );
            })
            .catch(() => {
                if (!cancelled) {
                    setMembers([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    const pagination = result?.pagination;
    const totalPages = pagination?.totalPages ?? 1;

    const setRowError = (id: string, message: string | null) => {
        setActionErrorById((current) => ({ ...current, [id]: message }));
    };

    const afterMutationRefresh = async (conversationIdForBadge: string) => {
        await load({ quiet: true });
        void refreshConversation(conversationIdForBadge);
    };

    async function handleAccept(item: WorkSuggestionRecord, assignees: string[]) {
        const previousRow = item;
        const previousOwners = ownerById[item._id];
        setActingId(item._id);
        setRowError(item._id, null);

        // Default inbox filter is proposed: drop the row immediately.
        if (status === "proposed") {
            setItems((current) => current.filter((row) => row._id !== item._id));
        } else {
            setItems((current) =>
                current.map((row) =>
                    row._id === item._id ? { ...row, status: "converted" as const } : row
                )
            );
        }
        if (assignees.length > 0) {
            setOwnerById((current) => ({ ...current, [item._id]: assignees }));
        }

        try {
            const response = await acceptWorkSuggestionApi(item._id, {
                assignees: assignees.length > 0 ? assignees : undefined,
            });
            if (response.task.assignees?.length) {
                setOwnerById((current) => ({
                    ...current,
                    [item._id]: response.task.assignees,
                }));
            }
            await afterMutationRefresh(item.conversationId);
        } catch (actionError) {
            setItems((current) => restoreInboxRow(current, previousRow));
            setOwnerById((current) => {
                const next = { ...current };
                if (previousOwners === undefined) {
                    delete next[item._id];
                } else {
                    next[item._id] = previousOwners;
                }
                return next;
            });
            setRowError(
                item._id,
                actionError instanceof ApiHttpError
                    ? actionError.message
                    : actionError instanceof Error
                      ? actionError.message
                      : "Accept failed"
            );
        } finally {
            setActingId(null);
        }
    }

    async function handleDismiss(item: WorkSuggestionRecord, reason: string) {
        const previousRow = item;
        setActingId(item._id);
        setRowError(item._id, null);

        if (status === "proposed") {
            setItems((current) => current.filter((row) => row._id !== item._id));
        } else {
            setItems((current) =>
                current.map((row) =>
                    row._id === item._id
                        ? { ...row, status: "dismissed" as const, dismissReason: reason }
                        : row
                )
            );
        }

        try {
            await dismissWorkSuggestionApi(item._id, reason);
            await afterMutationRefresh(item.conversationId);
        } catch (actionError) {
            setItems((current) => restoreInboxRow(current, previousRow));
            setRowError(
                item._id,
                actionError instanceof ApiHttpError
                    ? actionError.message
                    : actionError instanceof Error
                      ? actionError.message
                      : "Dismiss failed"
            );
        } finally {
            setActingId(null);
        }
    }

    async function handleAllowAiTools(item: WorkSuggestionRecord) {
        if (!item.convertedTaskId) return;
        setActingId(item._id);
        setRowError(item._id, null);
        try {
            await requestTaskExecutionApi(item.convertedTaskId, {
                reason: "Manager requested AI tool execution from work inbox",
            });
        } catch (actionError) {
            setRowError(
                item._id,
                actionError instanceof ApiHttpError
                    ? actionError.message
                    : actionError instanceof Error
                      ? actionError.message
                      : "Allow AI tools failed"
            );
        } finally {
            setActingId(null);
        }
    }

    async function handleAssign(item: WorkSuggestionRecord, assignees: string[]) {
        const previousOwners = ownersForSuggestion(item, ownerById);
        setActingId(item._id);
        setRowError(item._id, null);
        setOwnerById((current) => ({ ...current, [item._id]: assignees }));

        try {
            const response = await assignWorkSuggestionApi(item._id, { assignees });
            setOwnerById((current) => ({
                ...current,
                [item._id]: response.task.assignees ?? assignees,
            }));
            setItems((current) =>
                current.map((row) =>
                    row._id === item._id ? response.suggestion : row
                )
            );
            void refreshConversation(item.conversationId);
        } catch (actionError) {
            setOwnerById((current) => ({ ...current, [item._id]: previousOwners }));
            setRowError(
                item._id,
                actionError instanceof ApiHttpError
                    ? actionError.message
                    : actionError instanceof Error
                      ? actionError.message
                      : "Assign failed"
            );
        } finally {
            setActingId(null);
        }
    }

    return (
        <div className="space-y-6" data-testid="work-inbox">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Work inbox</h1>
                    <p className="text-sm text-muted-foreground">
                        Triage reviewable work suggestions without opening the orchestration panel.
                        Accept creates coordination work only — it never starts autonomous tool
                        execution.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Scope and filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div
                        className="rounded-md border border-border px-3 py-2 text-sm"
                        data-testid="work-inbox-scope"
                    >
                        {organizationId ? (
                            <>
                                <span className="text-muted-foreground">Organization </span>
                                <span className="font-mono text-xs break-all">{organizationId}</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                Personal — select a conversation id to load suggestions
                            </span>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="inbox-status">Status</Label>
                            <select
                                id="inbox-status"
                                data-testid="work-inbox-status"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={status}
                                onChange={(event) => {
                                    setPage(1);
                                    setStatus(event.target.value as "" | WorkSuggestionStatus);
                                }}
                            >
                                {STATUS_OPTIONS.map((option) => (
                                    <option key={option.label} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="inbox-conversation">Conversation id</Label>
                            <Input
                                id="inbox-conversation"
                                data-testid="work-inbox-conversation"
                                value={conversationId}
                                onChange={(event) => {
                                    setPage(1);
                                    setConversationId(event.target.value);
                                }}
                                placeholder={organizationId ? "Optional narrow filter" : "Required for personal"}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!hasScope ? (
                <Card data-testid="work-inbox-onboarding">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Choose a scope to load your inbox</p>
                        <p className="text-muted-foreground">
                            Set an active organization on the Organizations page, or enter a conversation
                            id above for personal workspace suggestions.
                        </p>
                        <Button asChild variant="outline">
                            <Link href="/organizations">Open organizations</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && loading ? (
                <div className="space-y-3" data-testid="work-inbox-loading">
                    {[0, 1, 2].map((index) => (
                        <div
                            key={index}
                            className="h-24 animate-pulse rounded-md border border-border bg-muted/40"
                        />
                    ))}
                </div>
            ) : null}

            {hasScope && !loading && error ? (
                <Card data-testid="work-inbox-error">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Unable to load inbox</p>
                        <p className="text-muted-foreground">{error}</p>
                        <Button
                            data-testid="work-inbox-retry"
                            variant="outline"
                            onClick={() => void load()}
                        >
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && !loading && !error && items.length === 0 ? (
                <Card data-testid="work-inbox-empty">
                    <CardContent className="space-y-2 p-6 text-sm">
                        <p className="font-medium">
                            {status === "proposed" || status === ""
                                ? "No proposed suggestions"
                                : `No ${status} suggestions`}
                        </p>
                        <p className="text-muted-foreground">
                            When chat extracts reviewable work, it will appear here for coordination.
                        </p>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && !loading && !error && items.length > 0 ? (
                <div className="space-y-3" data-testid="work-inbox-list">
                    {items.map((item) => (
                        <Card key={item._id} data-testid="work-inbox-row">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">
                                    <Link
                                        href={`/work-suggestions/${item._id}`}
                                        className="hover:underline"
                                        data-testid="work-inbox-row-link"
                                    >
                                        {item.title}
                                    </Link>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <p className="text-muted-foreground">
                                    {summarize(item.summary || "No summary provided.")}
                                </p>
                                <dl className="grid gap-2 sm:grid-cols-3">
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Status
                                        </dt>
                                        <dd className="font-medium capitalize">{item.status}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Confidence
                                        </dt>
                                        <dd className="font-medium">
                                            {Math.round(item.confidence * 100)}%
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Created
                                        </dt>
                                        <dd className="font-medium">{formatTimestamp(item.createdAt)}</dd>
                                    </div>
                                    <div className="sm:col-span-3">
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Conversation
                                        </dt>
                                        <dd className="font-mono text-xs break-all">{item.conversationId}</dd>
                                    </div>
                                </dl>

                                {(item.status === "proposed" || item.status === "converted") ? (
                                    <WorkInboxTriage
                                        suggestion={item}
                                        organizationId={organizationId}
                                        members={members}
                                        displayedOwners={ownersForSuggestion(item, ownerById)}
                                        actionPending={actingId === item._id}
                                        actionError={actionErrorById[item._id] ?? null}
                                        onAccept={(assignees) => handleAccept(item, assignees)}
                                        onAssign={(assignees) => handleAssign(item, assignees)}
                                        onDismiss={(reason) => handleDismiss(item, reason)}
                                        onAllowAiTools={() => handleAllowAiTools(item)}
                                    />
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : null}

            {hasScope && !loading && !error && pagination && totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3" data-testid="work-inbox-pagination">
                    <Button
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                        Previous
                    </Button>
                    <p className="text-sm text-muted-foreground">
                        Page {pagination.page} of {totalPages} ({pagination.total} total)
                    </p>
                    <Button
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                        Next
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
