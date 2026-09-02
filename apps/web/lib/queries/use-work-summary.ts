"use client";

import { useQuery } from "@tanstack/react-query";
import { getOrganizationWorkSummary } from "@/lib/utils/api";
import { queryKeys } from "@/lib/queries/keys";

export function mutationErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

export function useOrganizationWorkSummary(organizationId?: string | null) {
    const enabled = Boolean(organizationId);

    return useQuery({
        queryKey: queryKeys.workSummary.detail(organizationId ?? null),
        queryFn: () => getOrganizationWorkSummary(organizationId as string),
        enabled,
    });
}
