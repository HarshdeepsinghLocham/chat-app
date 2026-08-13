"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    useAddOrganizationMember,
    useCreateOrganization,
    useOrganizationMembers,
    useOrganizationsList,
    useUpdateOrganizationPolicy,
    useUpdateOrganizationQuota,
} from "@/lib/queries/use-organizations";

const STORAGE_KEY = "semantask.activeOrganizationId";

export default function OrganizationsPage() {
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [memberUserId, setMemberUserId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const orgsQuery = useOrganizationsList();
    const membersQuery = useOrganizationMembers(activeOrgId);
    const createMutation = useCreateOrganization();
    const addMemberMutation = useAddOrganizationMember(activeOrgId);

    const orgs = orgsQuery.data ?? [];
    const members = membersQuery.data ?? [];
    const loading = orgsQuery.isLoading;

    useEffect(() => {
        if (!orgsQuery.data) return;
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && orgsQuery.data.some((org) => org.id === stored)) {
            setActiveOrgId(stored);
            return;
        }
        if (stored) {
            setActiveOrgId(null);
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, [orgsQuery.data]);

    useEffect(() => {
        if (orgsQuery.error) {
            setError(
                orgsQuery.error instanceof Error
                    ? orgsQuery.error.message
                    : "Failed to load organizations"
            );
        }
    }, [orgsQuery.error]);

    useEffect(() => {
        if (membersQuery.error) {
            setError(
                membersQuery.error instanceof Error
                    ? membersQuery.error.message
                    : "Failed to load members"
            );
        }
    }, [membersQuery.error]);

    function selectOrg(id: string | null) {
        setActiveOrgId(id);
        if (typeof window !== "undefined") {
            if (id) {
                localStorage.setItem(STORAGE_KEY, id);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        setStatus(
            id
                ? `Active organization set. API calls can send X-Organization-Id: ${id}`
                : "Personal workspace selected."
        );
    }

    async function handleCreate() {
        setError(null);
        setStatus(null);
        try {
            const org = await createMutation.mutateAsync({
                name: name.trim(),
                slug: slug.trim() || undefined,
            });
            setName("");
            setSlug("");
            setStatus(`Created ${org.name}`);
            selectOrg(org.id);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Failed to create organization");
        }
    }

    async function handleAddMember() {
        if (!activeOrgId) return;
        setError(null);
        try {
            await addMemberMutation.mutateAsync({ userId: memberUserId.trim() });
            setMemberUserId("");
            setStatus("Member added.");
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : "Failed to add member");
        }
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="organizations-page">
            <Card>
                <CardHeader>
                    <CardTitle>Organizations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Personal workspace is the default (no header). Select an organization to scope
                        conversations via <code>X-Organization-Id</code>.
                    </p>
                    {error ? <p className="text-sm text-red-600">{error}</p> : null}
                    {status ? <p className="text-sm text-green-700">{status}</p> : null}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={activeOrgId === null ? "default" : "outline"}
                            onClick={() => selectOrg(null)}
                        >
                            Personal
                        </Button>
                        {orgs.map((org) => (
                            <Button
                                key={org.id}
                                variant={activeOrgId === org.id ? "default" : "outline"}
                                onClick={() => selectOrg(org.id)}
                                data-testid="organization-option"
                            >
                                {org.name} ({org.role})
                            </Button>
                        ))}
                    </div>

                    {loading ? <p className="text-sm">Loading…</p> : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Create organization</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Input
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="organization-name"
                    />
                    <Input
                        placeholder="Slug (optional)"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        data-testid="organization-slug"
                    />
                    <Button
                        onClick={() => void handleCreate()}
                        disabled={!name.trim() || createMutation.isPending}
                        data-testid="organization-create"
                    >
                        Create
                    </Button>
                </CardContent>
            </Card>

            {activeOrgId ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Members</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ul className="space-y-1 text-sm" data-testid="organization-members">
                            {members.map((member) => (
                                <li key={member.id}>
                                    {member.userId} — {member.role}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <Input
                                placeholder="User ID"
                                value={memberUserId}
                                onChange={(e) => setMemberUserId(e.target.value)}
                                data-testid="organization-member-user-id"
                            />
                            <Button
                                onClick={() => void handleAddMember()}
                                disabled={!memberUserId.trim() || addMemberMutation.isPending}
                                data-testid="organization-add-member"
                            >
                                Add member
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {activeOrgId ? <OrgPolicyQuotaPanel organizationId={activeOrgId} /> : null}
        </div>
    );
}

function OrgPolicyQuotaPanel({ organizationId }: { organizationId: string }) {
    const [requireApproval, setRequireApproval] = useState("send_email");
    const [maxTokens, setMaxTokens] = useState("");
    const [maxMembers, setMaxMembers] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const policyMutation = useUpdateOrganizationPolicy(organizationId);
    const quotaMutation = useUpdateOrganizationQuota(organizationId);

    async function savePolicy() {
        setMessage(null);
        try {
            const tools = requireApproval
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
            await policyMutation.mutateAsync({
                requireApprovalFor: tools,
            });
            setMessage("Policy saved.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to save policy");
        }
    }

    async function saveQuota() {
        setMessage(null);
        try {
            let maxTokensPerMonth: number | null = null;
            let maxMembersValue: number | null = null;

            if (maxTokens.trim()) {
                const parsed = Number(maxTokens);
                if (!Number.isFinite(parsed)) {
                    setMessage("Max tokens must be a finite number.");
                    return;
                }
                maxTokensPerMonth = parsed;
            }

            if (maxMembers.trim()) {
                const parsed = Number(maxMembers);
                if (!Number.isFinite(parsed)) {
                    setMessage("Max members must be a finite number.");
                    return;
                }
                maxMembersValue = parsed;
            }

            await quotaMutation.mutateAsync({
                maxTokensPerMonth,
                maxMembers: maxMembersValue,
            });
            setMessage("Quota saved.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to save quota");
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Policy &amp; quotas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {message ? <p className="text-sm">{message}</p> : null}
                <div className="space-y-2">
                    <p className="text-sm font-medium">Require approval for tools (comma-separated)</p>
                    <div className="flex gap-2">
                        <Input value={requireApproval} onChange={(e) => setRequireApproval(e.target.value)} />
                        <Button onClick={() => void savePolicy()} disabled={policyMutation.isPending}>
                            Save policy
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-medium">Quotas</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            placeholder="Max tokens / month"
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(e.target.value)}
                        />
                        <Input
                            placeholder="Max members"
                            value={maxMembers}
                            onChange={(e) => setMaxMembers(e.target.value)}
                        />
                        <Button onClick={() => void saveQuota()} disabled={quotaMutation.isPending}>
                            Save quota
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
