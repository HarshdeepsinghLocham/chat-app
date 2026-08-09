"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaskPriority, WorkSuggestionRecord } from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WorkSuggestionDetailViewProps = {
    loading: boolean;
    errorStatus: number | null;
    errorMessage: string | null;
    suggestion: WorkSuggestionRecord | null;
    actionError?: string | null;
    actionPending?: boolean;
    onAccept?: (input: {
        assignees?: string[];
        dueAt?: string | null;
        priority?: TaskPriority;
    }) => void | Promise<void>;
    onDismiss?: (reason: string) => void | Promise<void>;
    onAssign?: (input: {
        assignees?: string[];
        dueAt?: string | null;
        priority?: TaskPriority;
    }) => void | Promise<void>;
};

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

function parseAssigneeInput(value: string): string[] {
    return value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

export function WorkSuggestionDetailView({
    loading,
    errorStatus,
    errorMessage,
    suggestion,
    actionError = null,
    actionPending = false,
    onAccept,
    onDismiss,
    onAssign,
}: WorkSuggestionDetailViewProps) {
    const [dismissReason, setDismissReason] = useState("");
    const [assigneesInput, setAssigneesInput] = useState("");
    const [dueAtInput, setDueAtInput] = useState("");
    const [priorityInput, setPriorityInput] = useState<TaskPriority | "">("");

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
    const isProposed = suggestion.status === "proposed";
    const isConverted = suggestion.status === "converted";

    const buildMutationInput = () => {
        const assignees = parseAssigneeInput(assigneesInput);
        const dueAt = dueAtInput.trim()
            ? new Date(dueAtInput).toISOString()
            : undefined;
        const priority = priorityInput || undefined;
        return {
            ...(assignees.length > 0 ? { assignees } : {}),
            ...(dueAt !== undefined ? { dueAt } : {}),
            ...(priority ? { priority } : {}),
        };
    };

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-6" data-testid="work-suggestion-detail">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Work suggestion</h1>
                    <p className="text-sm text-muted-foreground">
                        Accept creates a coordination task. Execution stays separate.
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
                        {suggestion.convertedTaskId ? (
                            <div className="sm:col-span-2">
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Converted task
                                </dt>
                                <dd className="font-mono text-xs break-all" data-testid="converted-task-id">
                                    {suggestion.convertedTaskId}
                                </dd>
                            </div>
                        ) : null}
                        {suggestion.dismissReason ? (
                            <div className="sm:col-span-2">
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Dismiss reason
                                </dt>
                                <dd className="font-medium">{suggestion.dismissReason}</dd>
                            </div>
                        ) : null}
                    </dl>
                </CardContent>
            </Card>

            {(isProposed || isConverted) && (
                <Card data-testid="work-suggestion-actions">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {isProposed ? "Review actions" : "Assign coordination task"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="suggestion-assignees">Assignees (user ids)</Label>
                                <Input
                                    id="suggestion-assignees"
                                    data-testid="suggestion-assignees"
                                    value={assigneesInput}
                                    onChange={(event) => setAssigneesInput(event.target.value)}
                                    placeholder="Optional comma-separated user ids"
                                    disabled={actionPending}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="suggestion-due-at">Due at</Label>
                                <Input
                                    id="suggestion-due-at"
                                    data-testid="suggestion-due-at"
                                    type="datetime-local"
                                    value={dueAtInput}
                                    onChange={(event) => setDueAtInput(event.target.value)}
                                    disabled={actionPending}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="suggestion-priority">Priority</Label>
                                <select
                                    id="suggestion-priority"
                                    data-testid="suggestion-priority"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={priorityInput}
                                    onChange={(event) =>
                                        setPriorityInput(event.target.value as TaskPriority | "")
                                    }
                                    disabled={actionPending}
                                >
                                    <option value="">Use candidate / default</option>
                                    <option value="low">low</option>
                                    <option value="medium">medium</option>
                                    <option value="high">high</option>
                                    <option value="urgent">urgent</option>
                                </select>
                            </div>
                        </div>

                        {isProposed ? (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="suggestion-dismiss-reason">Dismiss reason</Label>
                                    <Input
                                        id="suggestion-dismiss-reason"
                                        data-testid="suggestion-dismiss-reason"
                                        value={dismissReason}
                                        onChange={(event) => setDismissReason(event.target.value)}
                                        placeholder="Required to dismiss"
                                        disabled={actionPending}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        data-testid="suggestion-accept"
                                        disabled={actionPending || !onAccept}
                                        onClick={() => void onAccept?.(buildMutationInput())}
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        data-testid="suggestion-dismiss"
                                        variant="outline"
                                        disabled={actionPending || !onDismiss || !dismissReason.trim()}
                                        onClick={() => void onDismiss?.(dismissReason.trim())}
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <Button
                                data-testid="suggestion-assign"
                                disabled={actionPending || !onAssign}
                                onClick={() => void onAssign?.(buildMutationInput())}
                            >
                                Save assignment
                            </Button>
                        )}

                        {actionError ? (
                            <p className="text-sm text-destructive" data-testid="suggestion-action-error">
                                {actionError}
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
