"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkSuggestionRecord } from "@semantask/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type OrgMemberOption = {
    userId: string;
    role: string;
};

export type WorkInboxTriageProps = {
    suggestion: WorkSuggestionRecord;
    organizationId: string | null;
    members: OrgMemberOption[];
    displayedOwners: string[];
    actionPending: boolean;
    actionError: string | null;
    onAccept: (assignees: string[]) => void | Promise<void>;
    onAssign: (assignees: string[]) => void | Promise<void>;
    onDismiss: (reason: string) => void | Promise<void>;
    onAllowAiTools?: () => void | Promise<void>;
};

function parseAssigneeInput(value: string): string[] {
    return value
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

export function WorkInboxTriage({
    suggestion,
    organizationId,
    members,
    displayedOwners,
    actionPending,
    actionError,
    onAccept,
    onAssign,
    onDismiss,
    onAllowAiTools,
}: WorkInboxTriageProps) {
    const isProposed = suggestion.status === "proposed";
    const isConverted = suggestion.status === "converted";
    const canAssign = isConverted;
    const canAcceptOrDismiss = isProposed;

    const candidateDefaults = useMemo(
        () => uniqueIds(suggestion.candidates.assigneeCandidates ?? []),
        [suggestion.candidates.assigneeCandidates]
    );

    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() =>
        uniqueIds(displayedOwners.length > 0 ? displayedOwners : candidateDefaults)
    );
    const [assigneesInput, setAssigneesInput] = useState(() =>
        (displayedOwners.length > 0 ? displayedOwners : candidateDefaults).join(", ")
    );
    const [dismissReason, setDismissReason] = useState("");

    useEffect(() => {
        const next = uniqueIds(displayedOwners.length > 0 ? displayedOwners : candidateDefaults);
        setSelectedMemberIds(next);
        setAssigneesInput(next.join(", "));
    }, [suggestion._id, displayedOwners, candidateDefaults]);

    const useMemberSelect = Boolean(organizationId) && members.length > 0;

    function resolveAssignees(): string[] {
        if (useMemberSelect) {
            return uniqueIds(selectedMemberIds);
        }
        return uniqueIds(parseAssigneeInput(assigneesInput));
    }

    return (
        <div className="space-y-3 border-t border-border pt-3" data-testid="work-inbox-triage">
            <p className="text-xs text-muted-foreground">
                Accept creates coordination work only — it does not execute tools. Assign updates the
                converted task owner. Execution approval lives under Approvals.
            </p>

            <div className="space-y-2">
                <Label htmlFor={`inbox-owner-${suggestion._id}`}>Owner</Label>
                {useMemberSelect ? (
                    <select
                        id={`inbox-owner-${suggestion._id}`}
                        data-testid="suggestion-assignees"
                        className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        multiple
                        value={selectedMemberIds}
                        disabled={actionPending || (!canAcceptOrDismiss && !canAssign)}
                        onChange={(event) => {
                            const values = Array.from(event.target.selectedOptions).map(
                                (option) => option.value
                            );
                            setSelectedMemberIds(uniqueIds(values));
                        }}
                    >
                        {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                                {member.userId} ({member.role})
                            </option>
                        ))}
                    </select>
                ) : (
                    <Input
                        id={`inbox-owner-${suggestion._id}`}
                        data-testid="suggestion-assignees"
                        value={assigneesInput}
                        onChange={(event) => setAssigneesInput(event.target.value)}
                        placeholder="Comma-separated user ids"
                        disabled={actionPending || (!canAcceptOrDismiss && !canAssign)}
                    />
                )}
                {displayedOwners.length > 0 ? (
                    <p className="font-mono text-xs text-muted-foreground" data-testid="work-inbox-owner">
                        Current: {displayedOwners.join(", ")}
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground" data-testid="work-inbox-owner">
                        No owner selected
                    </p>
                )}
            </div>

            {canAcceptOrDismiss ? (
                <div className="space-y-2">
                    <Label htmlFor={`inbox-dismiss-${suggestion._id}`}>Dismiss reason</Label>
                    <Input
                        id={`inbox-dismiss-${suggestion._id}`}
                        data-testid="suggestion-dismiss-reason"
                        value={dismissReason}
                        onChange={(event) => setDismissReason(event.target.value)}
                        placeholder="Required to dismiss"
                        disabled={actionPending}
                    />
                </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
                <Button
                    data-testid="suggestion-accept"
                    size="sm"
                    disabled={actionPending || !canAcceptOrDismiss}
                    onClick={() => void onAccept(resolveAssignees())}
                >
                    Accept
                </Button>
                <Button
                    data-testid="suggestion-assign"
                    size="sm"
                    variant="outline"
                    disabled={actionPending || !canAssign || resolveAssignees().length === 0}
                    title={canAssign ? "Update converted task owner" : "Accept first"}
                    onClick={() => void onAssign(resolveAssignees())}
                >
                    Assign
                </Button>
                <Button
                    data-testid="suggestion-dismiss"
                    size="sm"
                    variant="outline"
                    disabled={actionPending || !canAcceptOrDismiss || !dismissReason.trim()}
                    onClick={() => void onDismiss(dismissReason.trim())}
                >
                    Dismiss
                </Button>
                {isConverted && suggestion.convertedTaskId ? (
                    <Button
                        data-testid="suggestion-allow-ai-tools"
                        size="sm"
                        variant="outline"
                        disabled={actionPending || !onAllowAiTools}
                        onClick={() => void onAllowAiTools?.()}
                    >
                        Allow AI tools
                    </Button>
                ) : null}
            </div>

            {!canAssign && isProposed ? (
                <p className="text-xs text-muted-foreground">Assign is available after Accept converts the suggestion.</p>
            ) : null}
            {isConverted ? (
                <p className="text-xs text-muted-foreground">
                    Allow AI tools requests execution approval — separate from accepting a suggestion.
                </p>
            ) : null}

            {actionError ? (
                <p className="text-sm text-destructive" data-testid="suggestion-action-error">
                    {actionError}
                </p>
            ) : null}
        </div>
    );
}
