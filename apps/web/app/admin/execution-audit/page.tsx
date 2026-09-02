"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserChip } from "@/components/people/user-chip";
import { getAdminExecutionAudit } from "@/lib/utils/api";
import { taskHref as workHref } from "@/lib/work-links";

export default function ExecutionAuditPage() {
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Awaited<ReturnType<typeof getAdminExecutionAudit>> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getAdminExecutionAudit({ page, limit: 20 })
            .then((result) => {
                if (!cancelled) {
                    setError(null);
                    setData(result);
                }
            })
            .catch((loadError) => {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : "Failed to load audit");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [page]);

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-6" data-testid="execution-audit-page">
            <Card>
                <CardHeader>
                    <CardTitle>Execution audit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    {(data?.events ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No execution events.</p>
                    ) : (
                    <ul className="space-y-2 text-sm">
                        {(data?.events ?? []).map((event) => (
                            <li key={event.id} className="rounded-md border border-border px-3 py-2">
                                <p className="font-medium">
                                    {event.taskTitle || "Work"} · {event.toolName.replace(/_/g, " ")} · {event.action}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    {event.actorRef ? <UserChip user={event.actorRef} size={18} /> : <span>System</span>}
                                    <Link href={workHref(event.taskId)} className="underline underline-offset-2">
                                        Open work
                                    </Link>
                                </div>
                                <details className="mt-2 text-xs text-muted-foreground">
                                    <summary>Technical details</summary>
                                    <p>runId: {event.runId || "—"}</p>
                                    <p>actorId: {event.actorId || "—"}</p>
                                    <p>paramsHash: {event.paramsHash}</p>
                                </details>
                            </li>
                        ))}
                    </ul>
                    )}
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={(data?.pagination.page ?? 1) >= (data?.pagination.totalPages ?? 1)}
                            onClick={() => setPage((current) => current + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
