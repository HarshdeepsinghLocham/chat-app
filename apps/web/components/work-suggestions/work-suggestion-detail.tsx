"use client";

import Link from "next/link";
import type { WorkSuggestionRecord } from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type WorkSuggestionDetailViewProps = {
    loading: boolean;
    errorStatus: number | null;
    errorMessage: string | null;
    suggestion: WorkSuggestionRecord | null;
};

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

export function WorkSuggestionDetailView({
    loading,
    errorStatus,
    errorMessage,
    suggestion,
}: WorkSuggestionDetailViewProps) {
    if (loading) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="work-suggestion-loading">
                <p className="text-sm text-muted-foreground">Loading suggestion…</p>
            </div>
        );
    }

    if (errorStatus === 401 || errorStatus === 403) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="work-suggestion-forbidden">
                <h1 className="text-2xl font-bold">Unable to view suggestion</h1>
                <p className="text-sm text-muted-foreground">
                    {errorMessage || "You do not have access to this work suggestion."}
                </p>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>
        );
    }

    if (errorStatus === 404) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="work-suggestion-not-found">
                <h1 className="text-2xl font-bold">Suggestion not found</h1>
                <p className="text-sm text-muted-foreground">
                    {errorMessage || "This work suggestion does not exist or is no longer available."}
                </p>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>
        );
    }

    if (errorStatus != null) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="work-suggestion-error">
                <h1 className="text-2xl font-bold">Unable to load suggestion</h1>
                <p className="text-sm text-muted-foreground">
                    {errorMessage || "Something went wrong while loading this work suggestion."}
                </p>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>
        );
    }

    if (!suggestion) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="work-suggestion-empty">
                <p className="text-sm text-muted-foreground">No suggestion to display.</p>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>
        );
    }

    const candidates = suggestion.candidates;
    const assigneeCount = candidates.assigneeCandidates?.length ?? 0;

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-6" data-testid="work-suggestion-detail">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Work suggestion</h1>
                    <p className="text-sm text-muted-foreground">
                        Read-only review stub. Accept and dismiss arrive in a later phase.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/">Back to chat</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{suggestion.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground whitespace-pre-wrap">
                        {suggestion.summary || "No summary provided."}
                    </p>
                    <dl className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
                            <dd className="font-medium capitalize">{suggestion.status}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</dt>
                            <dd className="font-medium">{Math.round(suggestion.confidence * 100)}%</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Created</dt>
                            <dd className="font-medium">{formatTimestamp(suggestion.createdAt)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Source message</dt>
                            <dd className="font-mono text-xs break-all">{suggestion.messageId}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Priority candidate</dt>
                            <dd className="font-medium">{candidates.priorityCandidate || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Due candidate</dt>
                            <dd className="font-medium">
                                {candidates.dueAtCandidate
                                    ? formatTimestamp(candidates.dueAtCandidate)
                                    : "—"}
                            </dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                Assignee candidates
                            </dt>
                            <dd className="font-medium">
                                {assigneeCount > 0
                                    ? candidates.assigneeCandidates.join(", ")
                                    : "—"}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
}
