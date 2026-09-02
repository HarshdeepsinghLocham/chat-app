"use client";

import { useMemo } from "react";
import { useActiveOrganizationId } from "@/hooks/useActiveOrganizationId";
import { useOrganizationsList } from "@/lib/queries/use-organizations";

/** Active org id + resolved name for product scope labels. */
export function useActiveOrganization() {
    const organizationId = useActiveOrganizationId();
    const orgsQuery = useOrganizationsList();

    const organization = useMemo(() => {
        if (!organizationId) return null;
        const match = (orgsQuery.data ?? []).find((org) => org.id === organizationId);
        return {
            id: organizationId,
            name: match?.name ?? "Organization",
            role: match?.role,
        };
    }, [organizationId, orgsQuery.data]);

    return {
        organizationId,
        organization,
        isLoading: orgsQuery.isLoading,
    };
}
