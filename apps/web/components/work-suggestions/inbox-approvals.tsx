"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type TaskApprovalRecord } from "@/lib/utils/api";
import { useActiveOrganizationId } from "@/lib/hooks/useActiveOrganizationId";
import {
    taskApprovalsErrorMessage,
    useDecideTaskApproval,
    useTaskApprovalsList,
} from "@/lib/queries/use-task-approvals";

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

function getPolicySummary(item: TaskApprovalRecord) {
    const after = item.patch?.after as Record<string, unknown> | null;
    const policyDecision =
        after && typeof after.policyDecision === "object"
            ? (after.policyDecision as Record<string, unknown>)
            : null;

    if (!policyDecision) return "No policy details available.";

    const reasons = Array.isArray(policyDecision.reasons)
        ? policyDecision.reasons.filter((entry): entry is string => typeof entry === "string")
        : [];

    if (reasons.length === 0) return "Approval required by policy.";
    return reasons.join(" ");
}

export function InboxApprovalsView() {
    const organizationId = useActiveOrganizationId();
    const [conversationId, setConversationId] = useState("");
    const [actingId, setActingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [commentsById, setCommentsById] = useState<Record<string, string>>({});
    const [paramsById, setParamsById] = useState<Record<string, string>>({});
    const editedCommentIdsRef = useRef<Record<string, true>>({});
    const editedParamIdsRef = useRef<Record<string, true>>({});

    const scopedConversation = conversationId.trim() || undefined;
    const hasScope = Boolean(scopedConversation || organizationId);

    const listQuery = useTaskApprovalsList({
        organizationId,
        conversationId: scopedConversation,
    });

    const decideMutation = useDecideTaskApproval();

    const approvals = listQuery.data ?? [];

    useEffect(() => {
        if (!listQuery.data) return;
        const approvalsData = listQuery.data;
        const liveIds = new Set(approvalsData.map((approval) => approval._id));

        setCommentsById((current) => {
            const next: Record<string, string> = {};
            for (const approval of approvalsData) {
                next[approval._id] =
                    editedCommentIdsRef.current[approval._id] && current[approval._id] !== undefined
                        ? current[approval._id]
                        : "";
            }
            return next;
        });
        setParamsById((current) => {
            const next: Record<string, string> = {};
            for (const approval of approvalsData) {
                next[approval._id] =
                    editedParamIdsRef.current[approval._id] && current[approval._id] !== undefined
                        ? current[approval._id]
                        : JSON.stringify(approval.parameters ?? {}, null, 2);
            }
            return next;
        });
        for (const id of Object.keys(editedCommentIdsRef.current)) {
            if (!liveIds.has(id)) delete editedCommentIdsRef.current[id];
        }
        for (const id of Object.keys(editedParamIdsRef.current)) {
            if (!liveIds.has(id)) delete editedParamIdsRef.current[id];
        }
    }, [listQuery.data]);

    const loading = hasScope && (listQuery.isLoading || listQuery.isFetching) && !listQuery.data;
    const scopeError = !hasScope
        ? "Select an active organization or enter a conversation id to load execution approvals."
        : null;
    const loadError = listQuery.error ? taskApprovalsErrorMessage(listQuery.error) : null;
    const listError = scopeError ?? loadError;

    async function decide(item: TaskApprovalRecord, decision: "approve" | "reject") {
        setActingId(item._id);
        setActionError(null);
        try {
            let parsedParameters: Record<string, unknown> | undefined;
            const parameterText = paramsById[item._id] ?? "";

            if (parameterText.trim().length > 0) {
                try {
                    const parsed = JSON.parse(parameterText) as unknown;
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                        setActionError("Parameters override must be a JSON object.");
                        return;
                    }
                    parsedParameters = parsed as Record<string, unknown>;
                } catch {
                    setActionError("Parameters override contains invalid JSON.");
                    return;
                }
            }

            await decideMutation.mutateAsync({
                taskActionId: item._id,
                decision,
                reviewerComment: commentsById[item._id] || undefined,
                parameters: parsedParameters,
            });
        } catch (decisionError) {
            setActionError(taskApprovalsErrorMessage(decisionError));
        } finally {
            setActingId(null);
        }
    }

    return (
        <div className="space-y-6" data-testid="inbox-approvals">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Execution approvals</h1>
                    <p className="text-sm text-muted-foreground">
                        Review tool actions waiting for human approval. This is separate from accepting a
                        work suggestion — approving here can resume tool execution.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="w-full space-y-2">
                            <Label htmlFor="inbox-approvals-conversation">Conversation id</Label>
                            <Input
                                id="inbox-approvals-conversation"
                                data-testid="inbox-approvals-conversation"
                                value={conversationId}
                                onChange={(event) => setConversationId(event.target.value)}
                                placeholder="Optional filter"
                            />
                        </div>
                        <Button
                            data-testid="inbox-approvals-refresh"
                            variant="outline"
                            onClick={() => void listQuery.refetch()}
                            disabled={listQuery.isFetching || !hasScope}
                        >
                            {listQuery.isFetching ? "Loading…" : "Refresh"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="space-y-3" data-testid="inbox-approvals-loading">
                    {[0, 1, 2].map((index) => (
                        <div
                            key={index}
                            className="h-28 animate-pulse rounded-md border border-border bg-muted/40"
                        />
                    ))}
                </div>
            ) : null}

            {!loading && listError ? (
                <Card data-testid="inbox-approvals-error">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Unable to load approvals</p>
                        <p className="text-muted-foreground">{listError}</p>
                        {hasScope ? (
                            <Button
                                data-testid="inbox-approvals-retry"
                                variant="outline"
                                onClick={() => {
                                    setActionError(null);
                                    void listQuery.refetch();
                                }}
                            >
                                Retry
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {!loading && !listError && approvals.length === 0 ? (
                <Card data-testid="inbox-approvals-empty">
                    <CardContent className="space-y-2 p-6 text-sm">
                        <p className="font-medium">No pending approvals</p>
                        <p className="text-muted-foreground">
                            When policy requires approval for a tool action, it will appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : null}

            {!loading && !listError && approvals.length > 0 ? (
                <div className="space-y-3" data-testid="inbox-approvals-list">
                    {actionError ? (
                        <Card data-testid="inbox-approvals-action-error">
                            <CardContent className="p-4 text-sm text-red-600">{actionError}</CardContent>
                        </Card>
                    ) : null}
                    {approvals.map((item) => (
                        <Card key={item._id} data-testid="inbox-approvals-row">
                            <CardHeader className="pb-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base">{item.actionType}</CardTitle>
                                        <p className="text-xs text-muted-foreground">
                                            Tool {item.toolName || "—"} · Task {item.taskId}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Conversation {item.conversationId}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Requested {formatTimestamp(item.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            data-testid="inbox-approvals-approve"
                                            onClick={() => void decide(item, "approve")}
                                            disabled={actingId === item._id}
                                        >
                                            Allow AI tools
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            data-testid="inbox-approvals-reject"
                                            onClick={() => void decide(item, "reject")}
                                            disabled={actingId === item._id}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <p className="text-muted-foreground">{item.summary || "No summary"}</p>
                                <p className="text-xs text-amber-700 dark:text-amber-500">
                                    {getPolicySummary(item)}
                                </p>
                                <div className="space-y-2">
                                    <Label htmlFor={`comment-${item._id}`}>Reviewer comment</Label>
                                    <Input
                                        id={`comment-${item._id}`}
                                        data-testid="inbox-approvals-comment"
                                        value={commentsById[item._id] ?? ""}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            editedCommentIdsRef.current[item._id] = true;
                                            setCommentsById((current) => ({
                                                ...current,
                                                [item._id]: value,
                                            }));
                                        }}
                                        placeholder="Add context for this decision"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`params-${item._id}`}>
                                        Parameters override (JSON object)
                                    </Label>
                                    <textarea
                                        id={`params-${item._id}`}
                                        data-testid="inbox-approvals-params"
                                        className="min-h-[120px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                                        value={paramsById[item._id] ?? "{}"}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            editedParamIdsRef.current[item._id] = true;
                                            setParamsById((current) => ({
                                                ...current,
                                                [item._id]: value,
                                            }));
                                        }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
