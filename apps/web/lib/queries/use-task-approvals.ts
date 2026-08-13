"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ApiHttpError,
    decideTaskApproval,
    getTaskApprovals,
    type TaskApprovalRecord,
} from "@/lib/utils/api";
import { queryKeys, type TaskApprovalsListParams } from "@/lib/queries/keys";

export function useTaskApprovalsList(params: {
    organizationId?: string | null;
    conversationId?: string;
}) {
    const scopedConversation = params.conversationId?.trim() || undefined;
    const organizationId = scopedConversation
        ? undefined
        : params.organizationId ?? undefined;
    const listParams: TaskApprovalsListParams = {
        organizationId,
        conversationId: scopedConversation,
    };
    const enabled = Boolean(scopedConversation || params.organizationId);

    const query = useQuery({
        queryKey: queryKeys.taskApprovals.list(listParams),
        queryFn: () => getTaskApprovals(listParams),
        enabled,
        select: (data) => data.approvals,
    });

    return { ...query, listParams };
}

export function useDecideTaskApproval() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: {
            taskActionId: string;
            decision: "approve" | "reject";
            reviewerComment?: string;
            parameters?: Record<string, unknown>;
        }) => decideTaskApproval(input),
        onSettled: async () => {
            await queryClient.invalidateQueries({
                queryKey: queryKeys.taskApprovals.all,
            });
        },
    });
}

export function taskApprovalsErrorMessage(error: unknown): string {
    if (error instanceof ApiHttpError) {
        if (error.status === 403) {
            return "You do not have permission to review execution approvals for this scope.";
        }
        return error.message;
    }
    if (error instanceof Error) return error.message;
    return "Failed to load approvals";
}

export type { TaskApprovalRecord };
