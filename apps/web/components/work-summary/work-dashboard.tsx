"use client";

import Link from "next/link";
import type { WorkSummary, WorkSummaryApprovalRow, WorkSummaryOpenTaskRow } from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveOrganizationId } from "@/lib/hooks/useActiveOrganizationId";
import {
    mutationErrorMessage,
    useOrganizationWorkSummary,
} from "@/lib/queries/use-work-summary";
import { boardTaskHref, taskHref } from "@/lib/work-links";

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

function formatAgeMs(ms: number) {
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours < 48) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
}

function formatDue(iso: string | null) {
    if (!iso) return "No due date";
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "No due date";
    return value.toLocaleDateString();
}

function OpenWorkWidget({
    summary,
    boardEnabled,
}: {
    summary: WorkSummary["openWork"];
    boardEnabled: boolean;
}) {
    return (
        <Card data-testid="work-dashboard-open-work">
            <CardHeader>
                <CardTitle className="text-base">Open coordination work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <dl className="grid gap-3 sm:grid-cols-4">
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Todo</dt>
                        <dd className="text-lg font-semibold">{summary.counts.todo}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Doing</dt>
                        <dd className="text-lg font-semibold">{summary.counts.doing}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Done</dt>
                        <dd className="text-lg font-semibold">{summary.counts.done}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Overdue</dt>
                        <dd className="text-lg font-semibold">{summary.overdue}</dd>
                    </div>
                </dl>
                {summary.openAgeMs ? (
                    <p className="text-muted-foreground">
                        Open age p50 {formatAgeMs(summary.openAgeMs.p50)} · p95{" "}
                        {formatAgeMs(summary.openAgeMs.p95)}
                    </p>
                ) : (
                    <p className="text-muted-foreground">No open coordination tasks yet.</p>
                )}
                {summary.oldest.length > 0 ? (
                    <ul className="space-y-2" data-testid="work-dashboard-open-work-list">
                        {summary.oldest.map((task: WorkSummaryOpenTaskRow) => (
                            <li
                                key={task._id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <Link
                                        href={taskHref(task._id)}
                                        className="font-medium hover:underline"
                                        data-testid="work-dashboard-open-task-link"
                                    >
                                        {task.title}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        {task.boardStatus} · due {formatDue(task.dueAt)}
                                    </p>
                                </div>
                                {boardEnabled ? (
                                    <Link
                                        href={boardTaskHref(task._id)}
                                        className="text-xs underline underline-offset-2"
                                        data-testid="work-dashboard-board-link"
                                    >
                                        Board
                                    </Link>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </CardContent>
        </Card>
    );
}

function ApprovalWidget({
    title,
    description,
    bucket,
    testId,
    approvalsHref,
}: {
    title: string;
    description: string;
    bucket: WorkSummary["agingApprovals"];
    testId: string;
    approvalsHref: string;
}) {
    return (
        <Card data-testid={testId}>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p className="text-muted-foreground">{description}</p>
                <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Pending</dt>
                        <dd className="text-lg font-semibold">{bucket.pending}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Aging (&gt;24h)
                        </dt>
                        <dd className="text-lg font-semibold">{bucket.aging}</dd>
                    </div>
                </dl>
                {bucket.oldest.length > 0 ? (
                    <ul className="space-y-2">
                        {bucket.oldest.map((item: WorkSummaryApprovalRow) => (
                            <li
                                key={item._id}
                                className="rounded-md border border-border px-3 py-2"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium">
                                            {item.toolName || "Approval request"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Requested {formatTimestamp(item.createdAt)}
                                        </p>
                                    </div>
                                    <Link
                                        href={taskHref(item.taskId)}
                                        className="text-xs underline underline-offset-2"
                                        data-testid="work-dashboard-approval-task-link"
                                    >
                                        Task
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted-foreground">Nothing waiting right now.</p>
                )}
                <Button asChild variant="outline" size="sm">
                    <Link href={approvalsHref} data-testid="work-dashboard-approvals-link">
                        Open approvals inbox
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export function WorkDashboardView({ boardEnabled = false }: { boardEnabled?: boolean }) {
    const organizationId = useActiveOrganizationId();
    const summaryQuery = useOrganizationWorkSummary(organizationId);

    const error = summaryQuery.error
        ? mutationErrorMessage(summaryQuery.error, "Failed to load dashboard")
        : null;

    if (!organizationId) {
        return (
            <Card data-testid="work-dashboard-onboarding">
                <CardContent className="space-y-3 p-6 text-sm">
                    <p className="font-medium">Choose an organization to load the dashboard</p>
                    <p className="text-muted-foreground">
                        The coordination dashboard summarizes open work and pending approvals for your
                        active organization.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/organizations">Open organizations</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (summaryQuery.isLoading && !summaryQuery.data) {
        return (
            <div className="space-y-4" data-testid="work-dashboard-loading">
                {[0, 1, 2].map((index) => (
                    <div
                        key={index}
                        className="h-40 animate-pulse rounded-md border border-border bg-muted/40"
                    />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <Card data-testid="work-dashboard-error">
                <CardContent className="space-y-3 p-6 text-sm">
                    <p className="font-medium">Unable to load dashboard</p>
                    <p className="text-muted-foreground">{error}</p>
                    <Button
                        data-testid="work-dashboard-retry"
                        variant="outline"
                        onClick={() => void summaryQuery.refetch()}
                    >
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!summaryQuery.data) {
        return null;
    }

    const summary = summaryQuery.data;

    return (
        <div className="space-y-6" data-testid="work-dashboard">
            <div>
                <h1 className="text-2xl font-bold">Coordination dashboard</h1>
                <p className="text-sm text-muted-foreground">
                    Read-only org glance at open coordination work and pending approvals. Run status
                    stays on the conversation panel.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Updated {formatTimestamp(summary.generatedAt)}
                </p>
            </div>

            <OpenWorkWidget summary={summary.openWork} boardEnabled={boardEnabled} />

            <ApprovalWidget
                title="Aging approvals"
                description="Execution approvals waiting for a manager decision."
                bucket={summary.agingApprovals}
                testId="work-dashboard-aging-approvals"
                approvalsHref="/inbox/approvals"
            />

            <ApprovalWidget
                title="Pending high-risk tools"
                description="Approval requests for high-risk AI tools such as email or scheduling."
                bucket={summary.highRiskPending}
                testId="work-dashboard-high-risk"
                approvalsHref="/inbox/approvals"
            />
        </div>
    );
}
