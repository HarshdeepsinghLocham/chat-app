"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ApiHttpError,
    decideTaskApproval,
    getTaskApprovals,
    type TaskApprovalRecord,
} from "@/lib/utils/api";

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

const STORAGE_KEY = "semantask.activeOrganizationId";

export function InboxApprovalsView() {
    const [approvals, setApprovals] = useState<TaskApprovalRecord[]>([]);
    const [conversationId, setConversationId] = useState("");
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [commentsById, setCommentsById] = useState<Record<string, string>>({});
    const [paramsById, setParamsById] = useState<Record<string, string>>({});

    useEffect(() => {
        if (typeof window === "undefined") return;
        setOrganizationId(window.localStorage.getItem(STORAGE_KEY));
    }, []);

    const loadApprovals = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const scopedConversation = conversationId.trim() || undefined;
            if (!scopedConversation && !organizationId) {
                setApprovals([]);
                setError(
                    "Select an active organization or enter a conversation id to load execution approvals."
                );
                return;
            }

            const response = await getTaskApprovals({
                conversationId: scopedConversation,
                organizationId: scopedConversation ? undefined : organizationId ?? undefined,
            });
            setApprovals(response.approvals);
            setCommentsById((current) => {
                const next = { ...current };
                for (const approval of response.approvals) {
                    if (next[approval._id] === undefined) {
                        next[approval._id] = "";
                    }
                }
                return next;
            });
            setParamsById((current) => {
                const next = { ...current };
                for (const approval of response.approvals) {
                    if (next[approval._id] === undefined) {
                        next[approval._id] = JSON.stringify(approval.parameters ?? {}, null, 2);
                    }
                }
                return next;
            });
        } catch (loadError) {
            setApprovals([]);
            if (loadError instanceof ApiHttpError) {
                if (loadError.status === 403) {
                    setError(
                        "You do not have permission to review execution approvals for this scope."
                    );
                } else {
                    setError(loadError.message);
                }
            } else {
                setError(loadError instanceof Error ? loadError.message : "Failed to load approvals");
            }
        } finally {
            setLoading(false);
        }
    }, [conversationId, organizationId]);

    useEffect(() => {
        void loadApprovals();
    }, [loadApprovals]);

    async function decide(item: TaskApprovalRecord, decision: "approve" | "reject") {
        setActingId(item._id);
        setError(null);
        try {
            let parsedParameters: Record<string, unknown> | undefined;
            const parameterText = paramsById[item._id] ?? "";

            if (parameterText.trim().length > 0) {
                try {
                    const parsed = JSON.parse(parameterText) as unknown;
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                        setError("Parameters override must be a JSON object.");
                        setActingId(null);
                        return;
                    }
                    parsedParameters = parsed as Record<string, unknown>;
                } catch {
                    setError("Parameters override contains invalid JSON.");
                    setActingId(null);
                    return;
                }
            }

            await decideTaskApproval({
                taskActionId: item._id,
                decision,
                reviewerComment: commentsById[item._id] || undefined,
                parameters: parsedParameters,
            });
            await loadApprovals();
        } catch (decisionError) {
            if (decisionError instanceof ApiHttpError) {
                setError(decisionError.message);
            } else {
                setError(
                    decisionError instanceof Error
                        ? decisionError.message
                        : "Failed to update approval decision"
                );
            }
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
                            onClick={() => void loadApprovals()}
                            disabled={loading}
                        >
                            {loading ? "Loading…" : "Refresh"}
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

            {!loading && error ? (
                <Card data-testid="inbox-approvals-error">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Unable to load approvals</p>
                        <p className="text-muted-foreground">{error}</p>
                        <Button
                            data-testid="inbox-approvals-retry"
                            variant="outline"
                            onClick={() => void loadApprovals()}
                        >
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {!loading && !error && approvals.length === 0 ? (
                <Card data-testid="inbox-approvals-empty">
                    <CardContent className="space-y-2 p-6 text-sm">
                        <p className="font-medium">No pending approvals</p>
                        <p className="text-muted-foreground">
                            When policy requires approval for a tool action, it will appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : null}

            {!loading && !error && approvals.length > 0 ? (
                <div className="space-y-3" data-testid="inbox-approvals-list">
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
                                        onChange={(event) =>
                                            setCommentsById((current) => ({
                                                ...current,
                                                [item._id]: event.target.value,
                                            }))
                                        }
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
                                        onChange={(event) =>
                                            setParamsById((current) => ({
                                                ...current,
                                                [item._id]: event.target.value,
                                            }))
                                        }
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
