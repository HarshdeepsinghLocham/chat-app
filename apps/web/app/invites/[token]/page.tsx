"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    acceptOrganizationInvitationApi,
    getOrganizationInvitationApi,
} from "@/lib/utils/api";
import { ACTIVE_ORGANIZATION_STORAGE_KEY } from "@/lib/hooks/useActiveOrganizationId";

type InviteView = {
    id: string;
    organizationId: string;
    organizationName: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
};

export default function InviteAcceptPage() {
    const params = useParams<{ token: string }>();
    const router = useRouter();
    const token = typeof params.token === "string" ? params.token : "";
    const [invite, setInvite] = useState<InviteView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const data = await getOrganizationInvitationApi(token);
                if (!cancelled) setInvite(data);
            } catch (loadError) {
                if (!cancelled) {
                    setError(
                        loadError instanceof Error ? loadError.message : "Invitation not found"
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        if (token) void load();
        return () => {
            cancelled = true;
        };
    }, [token]);

    async function handleAccept() {
        setAccepting(true);
        setError(null);
        setStatus(null);
        try {
            const result = await acceptOrganizationInvitationApi(token);
            window.localStorage.setItem(
                ACTIVE_ORGANIZATION_STORAGE_KEY,
                result.organizationId
            );
            setStatus(`Joined ${result.invitation.organizationName}`);
            setInvite(result.invitation);
            router.push("/inbox");
        } catch (acceptError) {
            setError(
                acceptError instanceof Error ? acceptError.message : "Failed to accept invitation"
            );
        } finally {
            setAccepting(false);
        }
    }

    const canAccept = invite?.status === "pending";

    return (
        <div className="mx-auto max-w-lg space-y-6 p-6" data-testid="invite-accept-page">
            <Card>
                <CardHeader>
                    <CardTitle>Organization invitation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                    {loading ? <p>Loading invitation…</p> : null}
                    {error ? <p className="text-destructive">{error}</p> : null}
                    {status ? <p className="text-green-700">{status}</p> : null}
                    {invite ? (
                        <div className="space-y-2">
                            <p>
                                You have been invited to join{" "}
                                <span className="font-medium">{invite.organizationName}</span> as{" "}
                                <span className="font-medium">{invite.role}</span>.
                            </p>
                            <p className="text-muted-foreground">
                                Invited email: {invite.email}
                            </p>
                            <p className="text-muted-foreground">
                                Status: {invite.status}
                                {invite.status === "pending"
                                    ? ` · expires ${new Date(invite.expiresAt).toLocaleString()}`
                                    : ""}
                            </p>
                        </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            data-testid="invite-accept"
                            disabled={!canAccept || accepting || loading}
                            onClick={() => void handleAccept()}
                        >
                            {accepting ? "Joining…" : "Accept and join"}
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/login">Sign in first</Link>
                        </Button>
                        <Button asChild variant="ghost">
                            <Link href="/organizations">Organizations</Link>
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Sign in with the invited email address, then accept to join the team.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
