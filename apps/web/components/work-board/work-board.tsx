"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BOARD_STATUSES, type BoardStatus, type TaskRecord } from "@semantask/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveOrganizationId } from "@/lib/hooks/useActiveOrganizationId";
import {
    mutationErrorMessage,
    useMoveWorkBoardCard,
    useWorkBoardList,
    WORK_BOARD_PAGE_LIMIT,
} from "@/lib/queries/use-work-board";

const COLUMN_LABELS: Record<BoardStatus, string> = {
    todo: "Todo",
    doing: "Doing",
    done: "Done",
};

function formatDue(iso: string | null) {
    if (!iso) return "No due date";
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "No due date";
    return value.toLocaleDateString();
}

function groupByBoardStatus(items: TaskRecord[]): Record<BoardStatus, TaskRecord[]> {
    const grouped: Record<BoardStatus, TaskRecord[]> = {
        todo: [],
        doing: [],
        done: [],
    };
    for (const item of items) {
        grouped[item.boardStatus].push(item);
    }
    return grouped;
}

export function WorkBoardView() {
    const organizationId = useActiveOrganizationId();
    const [conversationId, setConversationId] = useState("");
    const [page, setPage] = useState(1);

    const scopedConversationId = conversationId.trim() || undefined;
    const hasScope = Boolean(organizationId || scopedConversationId);

    const listQuery = useWorkBoardList({
        organizationId,
        conversationId: scopedConversationId,
        page,
        limit: WORK_BOARD_PAGE_LIMIT,
    });
    const moveMutation = useMoveWorkBoardCard(listQuery.listParams);

    const items = listQuery.data?.items ?? [];
    const pagination = listQuery.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const columns = useMemo(() => groupByBoardStatus(items), [items]);
    const loading = listQuery.isLoading || listQuery.isFetching;
    const error = listQuery.error
        ? mutationErrorMessage(listQuery.error, "Failed to load board")
        : null;

    async function handleMove(task: TaskRecord, boardStatus: BoardStatus) {
        if (task.boardStatus === boardStatus) return;
        try {
            await moveMutation.mutateAsync({ task, boardStatus });
        } catch {
            // Row-level error is surfaced via mutation; list rolls back on error.
        }
    }

    return (
        <div className="space-y-6" data-testid="work-board">
            <Card>
                <CardHeader>
                    <CardTitle>Work board</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Track extracted work by coordination column. Run status stays on the
                        conversation panel — moving a card here does not start AI tools.
                    </p>
                    <div
                        className="rounded-md border border-dashed border-border px-3 py-2 text-sm"
                        data-testid="work-board-scope"
                    >
                        {organizationId ? (
                            <>
                                <span className="text-muted-foreground">Organization </span>
                                <span className="font-mono text-xs break-all">{organizationId}</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                Personal — enter a conversation id to load the board
                            </span>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="board-conversation">Conversation id</Label>
                        <Input
                            id="board-conversation"
                            data-testid="work-board-conversation"
                            value={conversationId}
                            onChange={(event) => {
                                setPage(1);
                                setConversationId(event.target.value);
                            }}
                            placeholder={organizationId ? "Optional narrow filter" : "Required for personal"}
                        />
                    </div>
                </CardContent>
            </Card>

            {!hasScope ? (
                <Card data-testid="work-board-onboarding">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Choose a scope to load the board</p>
                        <p className="text-muted-foreground">
                            Set an active organization, or enter a conversation id for personal work.
                        </p>
                        <Button asChild variant="outline">
                            <Link href="/organizations">Open organizations</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && loading && !listQuery.data && !error ? (
                <div className="grid gap-4 md:grid-cols-3" data-testid="work-board-loading">
                    {[0, 1, 2].map((index) => (
                        <div
                            key={index}
                            className="h-40 animate-pulse rounded-md border border-border bg-muted/40"
                        />
                    ))}
                </div>
            ) : null}

            {hasScope && error ? (
                <Card data-testid="work-board-error">
                    <CardContent className="space-y-3 p-6 text-sm">
                        <p className="font-medium">Unable to load board</p>
                        <p className="text-muted-foreground">{error}</p>
                        <Button
                            data-testid="work-board-retry"
                            variant="outline"
                            onClick={() => void listQuery.refetch()}
                        >
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && listQuery.isSuccess && items.length === 0 ? (
                <Card data-testid="work-board-empty">
                    <CardContent className="space-y-2 p-6 text-sm">
                        <p className="font-medium">No coordination work yet</p>
                        <p className="text-muted-foreground">
                            Accept a suggestion from the inbox to create a task on this board.
                        </p>
                    </CardContent>
                </Card>
            ) : null}

            {hasScope && listQuery.isSuccess && items.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-3" data-testid="work-board-columns">
                    {BOARD_STATUSES.map((column) => (
                        <section
                            key={column}
                            className="space-y-3"
                            data-testid={`work-board-column-${column}`}
                        >
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                                {COLUMN_LABELS[column]} ({columns[column].length})
                            </h2>
                            {columns[column].map((task) => (
                                <Card key={task._id} data-testid="work-board-card">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">{task.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        <dl className="grid gap-2">
                                            <div>
                                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                                    Priority
                                                </dt>
                                                <dd className="font-medium capitalize">{task.priority}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                                    Due
                                                </dt>
                                                <dd className="font-medium">{formatDue(task.dueAt)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                                    Assignees
                                                </dt>
                                                <dd className="font-medium">
                                                    {task.assignees.length > 0
                                                        ? `${task.assignees.length} assigned`
                                                        : "Unassigned"}
                                                </dd>
                                            </div>
                                        </dl>
                                        <div className="flex flex-wrap gap-2">
                                            {BOARD_STATUSES.filter((status) => status !== task.boardStatus).map(
                                                (status) => (
                                                    <Button
                                                        key={status}
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        data-testid={`work-board-move-${status}`}
                                                        disabled={moveMutation.isPending}
                                                        onClick={() => void handleMove(task, status)}
                                                    >
                                                        Move to {COLUMN_LABELS[status]}
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </section>
                    ))}
                </div>
            ) : null}

            {hasScope && listQuery.isSuccess && pagination && totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3" data-testid="work-board-pagination">
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
