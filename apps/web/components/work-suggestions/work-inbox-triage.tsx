"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserRef, WorkSuggestionRecord } from "@semantask/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserChip, userDisplayName } from "@/components/people/user-chip";

export type OrgMemberOption = {
    userId: string;
    role: string;
    user: UserRef;
};

export type WorkInboxTriageProps = {
    suggestion: WorkSuggestionRecord;
    organizationId: string | null;
    members: OrgMemberOption[];
    displayedOwners: string[];
    currentUserId?: string | null;
    actionPending: boolean;
    actionError: string | null;
    onAccept: (assignees: string[]) => void | Promise<void>;
    onAssign: (assignees: string[]) => void | Promise<void>;
    onDismiss: (reason: string) => void | Promise<void>;
    onAllowAiTools?: () => void | Promise<void>;
};

function uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function memberLabel(member: OrgMemberOption): string {
    return `${userDisplayName(member.user)} (${member.role})`;
}

export function WorkInboxTriage({
    suggestion,
    organizationId,
    members,
    displayedOwners,
    currentUserId = null,
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
    const UNASSIGNED = "";

    const memberById = useMemo(() => {
        const map = new Map<string, OrgMemberOption>();
        for (const member of members) {
            map.set(member.userId, member);
        }
        return map;
    }, [members]);

    const selectableIds = useMemo(() => {
        const ids = new Set<string>();
        if (currentUserId) ids.add(currentUserId);
        for (const member of members) ids.add(member.userId);
        return ids;
    }, [currentUserId, members]);

    const candidateDefaults = useMemo(
        () => uniqueIds(suggestion.candidates.assigneeCandidates ?? []),
        [suggestion.candidates.assigneeCandidates]
    );

    function defaultOwner(from: string[]): string[] {
        const seed = uniqueIds(from.length > 0 ? from : candidateDefaults);
        const next = seed.find((id) => selectableIds.has(id));
        return next ? [next] : [];
    }

    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() =>
        defaultOwner(displayedOwners)
    );
    const [dismissReason, setDismissReason] = useState("");

    useEffect(() => {
        setSelectedMemberIds(defaultOwner(displayedOwners));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggestion._id, displayedOwners, selectableIds, candidateDefaults]);

    function resolveAssignees(): string[] {
        return uniqueIds(selectedMemberIds).slice(0, 1);
    }

    const selectedOwnerId = selectedMemberIds[0] ?? UNASSIGNED;
    const currentOwners = displayedOwners
        .filter((id) => selectableIds.has(id) || memberById.has(id))
        .map((id) => memberById.get(id)?.user ?? { id, username: "Unknown user" });

    return (
        <div className="space-y-3 border-t border-border pt-3" data-testid="work-inbox-triage">
            <p className="text-xs text-muted-foreground">
                Accept creates coordination work only — it does not execute tools. Assign updates the
                converted task owner. Execution approval lives under Approvals.
            </p>

            <div className="space-y-2">
                <Label htmlFor={`inbox-owner-${suggestion._id}`}>Owner</Label>
                <select
                    id={`inbox-owner-${suggestion._id}`}
                    data-testid="suggestion-assignees"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedOwnerId}
                    disabled={actionPending || (!canAcceptOrDismiss && !canAssign)}
                    onChange={(event) => {
                        const value = event.target.value;
                        setSelectedMemberIds(value ? [value] : []);
                    }}
                >
                    <option value={UNASSIGNED}>Unassigned</option>
                    {currentUserId ? <option value={currentUserId}>Me</option> : null}
                    {members
                        .filter((member) => member.userId !== currentUserId)
                        .map((member) => (
                            <option key={member.userId} value={member.userId}>
                                {memberLabel(member)}
                            </option>
                        ))}
                </select>
                {!organizationId && !currentUserId ? (
                    <p className="text-xs text-muted-foreground">
                        Personal workspace: Me or Unassigned only.
                    </p>
                ) : null}
                {currentOwners.length > 0 ? (
                    <div
                        className="flex flex-wrap gap-2 text-xs text-muted-foreground"
                        data-testid="work-inbox-owner"
                    >
                        <span>Current:</span>
                        {currentOwners.map((user) => (
                            <UserChip key={user.id} user={user} size={20} />
                        ))}
                    </div>
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
                    Accept & assign
                </Button>
                <Button
                    data-testid="suggestion-assign"
                    size="sm"
                    variant="outline"
                    disabled={actionPending || !canAssign}
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
