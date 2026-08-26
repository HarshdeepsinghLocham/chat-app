"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type {
    WorkSummary,
    WorkSummaryApprovalRow,
    WorkSummaryOpenTaskRow,
    WorkSummarySuggestionRow,
} from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserChip } from "@/components/people/user-chip";
import { useActiveOrganization } from "@/lib/hooks/useActiveOrganization";
import {
    mutationErrorMessage,
    useOrganizationWorkSummary,
} from "@/lib/queries/use-work-summary";
import { boardTaskHref, taskHref } from "@/lib/work-links";
import { reviewSuggestionHref } from "@/lib/work-suggestions/map";

function formatTimestamp(iso: string) {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "-";
    return value.toLocaleString();
}

function formatDue(iso: string | null) {
    if (!iso) return "No due date";
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "No due date";
    return value.toLocaleDateString();
}

function AttentionList({
    title,
    empty,
    testId,
    hasItems,
    children,
}: {
    title: string;
    empty: string;
    testId: string;
    hasItems: boolean;
    children: ReactNode;
}) {
    return (
        <Card data-testid={testId}>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {hasItems ? children : <p className="text-muted-foreground">{empty}</p>}
            </CardContent>
        </Card>
    );
}

function TaskAttentionRows({
    rows,
    boardEnabled,
}: {
    rows: WorkSummaryOpenTaskRow[];
    boardEnabled: boolean;
}) {
    if (rows.length === 0) return null;
    return (
        <ul className="space-y-2">
            {rows.map((task) => (
                <li
                    key={task._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                    <div className="min-w-0">
                        <Link href={taskHref(task._id)} className="font-medium hover:underline">
                            {task.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            {task.boardStatus} · due {formatDue(task.dueAt)}
                            {task.conversationLabel ? ` · ${task.conversationLabel}` : ""}
                        </p>
                        {(task.assigneeRefs ?? []).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-2">
                                {(task.assigneeRefs ?? []).map((user) => (
                                    <UserChip key={user.id} user={user} size={18} />
                                ))}
                            </div>
                        ) : null}
                    </div>
                    {boardEnabled ? (
                        <Link
                            href={boardTaskHref(task._id)}
                            className="text-xs underline underline-offset-2"
                        >
                            Board
                        </Link>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

function SuggestionRows({ rows }: { rows: WorkSummarySuggestionRow[] }) {
    if (rows.length === 0) return null;
    return (
        <ul className="space-y-2">
            {rows.map((item) => (
                <li
                    key={item._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                    <div className="min-w-0">
                        <Link
                            href={reviewSuggestionHref(item._id) ?? `/inbox?suggestion=${item._id}`}
                            className="font-medium hover:underline"
                        >
                            {item.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            {item.conversationLabel || "Conversation"} ·{" "}
                            {formatTimestamp(item.createdAt)}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
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
                                    >
                                        Open task
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted-foreground">Nothing waiting right now.</p>
                )}
                <Button asChild variant="outline" size="sm">
                    <Link href={approvalsHref}>Open approvals</Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export function WorkDashboardView({ boardEnabled = false }: { boardEnabled?: boolean }) {
    const { organizationId, organization } = useActiveOrganization();
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
                        See what needs attention across your team — overdue, blocked, unassigned, and
                        awaiting confirmation.
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
    const attention = summary.attention;
    const openCounts = summary.openWork.counts;
    const awaitingApproval = summary.agingApprovals;

    return (
        <div className="space-y-6" data-testid="work-dashboard">
            <div>
                <h1 className="text-2xl font-bold">What needs attention</h1>
                <p className="text-sm text-muted-foreground">
                    {organization?.name ?? "Organization"} · updated{" "}
                    {formatTimestamp(summary.generatedAt)}
                </p>
            </div>

            <Card data-testid="work-dashboard-open-counts">
                <CardHeader>
                    <CardTitle className="text-base">Board</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid gap-3 sm:grid-cols-3 text-sm">
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Todo</dt>
                            <dd className="text-lg font-semibold">{openCounts.todo}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Doing</dt>
                            <dd className="text-lg font-semibold">{openCounts.doing}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Done</dt>
                            <dd className="text-lg font-semibold">{openCounts.done}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            {attention ? (
                <Card data-testid="work-dashboard-attention-counts">
                    <CardHeader>
                        <CardTitle className="text-base">At a glance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
                            {(
                                [
                                    ["Open", attention.counts.open],
                                    ["Overdue", attention.counts.overdue],
                                    ["Blocked", attention.counts.blocked],
                                    ["Unassigned", attention.counts.unassigned],
                                    ["Awaiting approval", awaitingApproval.pending],
                                    ["Members", attention.counts.members],
                                ] as const
                            ).map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="text-lg font-semibold">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>
            ) : null}

            {attention ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <AttentionList
                        title="Overdue"
                        empty="No overdue work."
                        testId="work-dashboard-overdue"
                        hasItems={attention.overdue.length > 0}
                    >
                        <TaskAttentionRows rows={attention.overdue} boardEnabled={boardEnabled} />
                    </AttentionList>
                    <ApprovalWidget
                        title="Awaiting approval"
                        description="Execution waiting for a manager decision."
                        bucket={awaitingApproval}
                        testId="work-dashboard-awaiting-approval"
                        approvalsHref="/inbox/approvals"
                    />
                    <AttentionList
                        title="Blocked"
                        empty="Nothing blocked."
                        testId="work-dashboard-blocked"
                        hasItems={attention.blocked.length > 0}
                    >
                        <TaskAttentionRows rows={attention.blocked} boardEnabled={boardEnabled} />
                    </AttentionList>
                    <AttentionList
                        title="Unassigned"
                        empty="All open work has an owner."
                        testId="work-dashboard-unassigned"
                        hasItems={attention.unassigned.length > 0}
                    >
                        <TaskAttentionRows rows={attention.unassigned} boardEnabled={boardEnabled} />
                    </AttentionList>
                    <AttentionList
                        title="My work & team"
                        empty="No assigned open work yet."
                        testId="work-dashboard-by-owner"
                        hasItems={attention.byOwner.length > 0}
                    >
                        <ul className="space-y-2">
                            {attention.byOwner.map((bucket) => (
                                <li
                                    key={bucket.user.id}
                                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                                >
                                    <UserChip user={bucket.user} size={22} />
                                    <span className="text-sm font-semibold">
                                        {bucket.openCount} open
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </AttentionList>
                    <AttentionList
                        title="Recently created"
                        empty="No recent open work."
                        testId="work-dashboard-recent"
                        hasItems={attention.recentlyCreated.length > 0}
                    >
                        <TaskAttentionRows
                            rows={attention.recentlyCreated}
                            boardEnabled={boardEnabled}
                        />
                    </AttentionList>
                    <AttentionList
                        title="Awaiting confirmation"
                        empty="No proposed suggestions waiting."
                        testId="work-dashboard-awaiting"
                        hasItems={attention.awaitingConfirmation.length > 0}
                    >
                        <SuggestionRows rows={attention.awaitingConfirmation} />
                        <Button asChild variant="outline" size="sm" className="mt-2">
                            <Link href="/inbox">Open suggestions inbox</Link>
                        </Button>
                    </AttentionList>
                </div>
            ) : null}

            <ApprovalWidget
                title="Aging approvals"
                description="Execution approvals waiting longer than a day."
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
