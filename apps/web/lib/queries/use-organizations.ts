"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    addOrganizationMember,
    createOrganization,
    getOrganizationMembers,
    listOrganizations,
    updateOrganizationPolicy,
    updateOrganizationQuota,
    type ClientOrganization,
} from "@/lib/utils/api";
import { queryKeys } from "@/lib/queries/keys";

export function useOrganizationsList() {
    return useQuery({
        queryKey: queryKeys.organizations.list(),
        queryFn: listOrganizations,
    });
}

export function useOrganizationMembers(organizationId: string | null) {
    return useQuery({
        queryKey: queryKeys.organizations.members(organizationId ?? ""),
        queryFn: () => getOrganizationMembers(organizationId!),
        enabled: Boolean(organizationId),
    });
}

export function useCreateOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: { name: string; slug?: string }) => createOrganization(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
        },
    });
}

export function useAddOrganizationMember(organizationId: string | null) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: { userId: string; role?: string }) => {
            if (!organizationId) {
                throw new Error("No active organization");
            }
            return addOrganizationMember(organizationId, input);
        },
        onSuccess: async () => {
            if (!organizationId) return;
            await queryClient.invalidateQueries({
                queryKey: queryKeys.organizations.members(organizationId),
            });
        },
    });
}

export function useUpdateOrganizationPolicy(organizationId: string) {
    return useMutation({
        mutationFn: (patch: Record<string, unknown>) =>
            updateOrganizationPolicy(organizationId, patch),
    });
}

export function useUpdateOrganizationQuota(organizationId: string) {
    return useMutation({
        mutationFn: (patch: Record<string, unknown>) =>
            updateOrganizationQuota(organizationId, patch),
    });
}

export type { ClientOrganization };
