"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkSuggestionRecord, WorkSuggestionStatus } from "@semantask/types";
import {
    ApiHttpError,
    acceptWorkSuggestionApi,
    assignWorkSuggestionApi,
    dismissWorkSuggestionApi,
    listWorkSuggestions,
    requestTaskExecutionApi,
    type AcceptWorkSuggestionResponse,
    type AssignWorkSuggestionResponse,
    type WorkSuggestionListResult,
} from "@/lib/utils/api";
import { queryKeys, type WorkSuggestionsListParams } from "@/lib/queries/keys";

export const WORK_INBOX_PAGE_LIMIT = 20;

function patchListItems(
    previous: WorkSuggestionListResult | undefined,
    patch: (items: WorkSuggestionRecord[]) => WorkSuggestionRecord[]
): WorkSuggestionListResult | undefined {
    if (!previous) return previous;
    return {
        ...previous,
        items: patch(previous.items),
    };
}

export function useWorkSuggestionsList(params: {
    organizationId?: string | null;
    conversationId?: string;
    status: "" | WorkSuggestionStatus;
    page: number;
    limit?: number;
}) {
    const limit = params.limit ?? WORK_INBOX_PAGE_LIMIT;
    const listParams: WorkSuggestionsListParams = {
        organizationId: params.organizationId ?? undefined,
        conversationId: params.conversationId,
        status: params.status,
        page: params.page,
        limit,
    };
    const enabled = Boolean(listParams.organizationId || listParams.conversationId);

    return useQuery({
        queryKey: queryKeys.workSuggestions.list(listParams),
        queryFn: () =>
            listWorkSuggestions({
                organizationId: listParams.organizationId,
                conversationId: listParams.conversationId,
                status: listParams.status || undefined,
                page: listParams.page,
                limit: listParams.limit,
            }),
        enabled,
    });
}

type AcceptVariables = {
    item: WorkSuggestionRecord;
    assignees: string[];
    statusFilter: "" | WorkSuggestionStatus;
};

type DismissVariables = {
    item: WorkSuggestionRecord;
    reason: string;
    statusFilter: "" | WorkSuggestionStatus;
};

type AssignVariables = {
    item: WorkSuggestionRecord;
    assignees: string[];
};

type ListCacheContext = {
    previous?: WorkSuggestionListResult;
    listKey: ReturnType<typeof queryKeys.workSuggestions.list>;
};

export function useAcceptWorkSuggestion(listParams: WorkSuggestionsListParams) {
    const queryClient = useQueryClient();
    const listKey = queryKeys.workSuggestions.list(listParams);

    return useMutation({
        mutationFn: ({ item, assignees }: AcceptVariables) =>
            acceptWorkSuggestionApi(item._id, {
                assignees: assignees.length > 0 ? assignees : undefined,
            }),
        onMutate: async ({ item, statusFilter }: AcceptVariables): Promise<ListCacheContext> => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<WorkSuggestionListResult>(listKey);
            queryClient.setQueryData<WorkSuggestionListResult>(listKey, (current) =>
                patchListItems(current, (items) => {
                    if (statusFilter === "proposed") {
                        return items.filter((row) => row._id !== item._id);
                    }
                    return items.map((row) =>
                        row._id === item._id ? { ...row, status: "converted" as const } : row
                    );
                })
            );
            return { previous, listKey };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(context.listKey, context.previous);
            }
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workSuggestions.all });
        },
    });
}

export function useDismissWorkSuggestion(listParams: WorkSuggestionsListParams) {
    const queryClient = useQueryClient();
    const listKey = queryKeys.workSuggestions.list(listParams);

    return useMutation({
        mutationFn: ({ item, reason }: DismissVariables) =>
            dismissWorkSuggestionApi(item._id, reason),
        onMutate: async ({ item, reason, statusFilter }: DismissVariables): Promise<ListCacheContext> => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<WorkSuggestionListResult>(listKey);
            queryClient.setQueryData<WorkSuggestionListResult>(listKey, (current) =>
                patchListItems(current, (items) => {
                    if (statusFilter === "proposed") {
                        return items.filter((row) => row._id !== item._id);
                    }
                    return items.map((row) =>
                        row._id === item._id
                            ? { ...row, status: "dismissed" as const, dismissReason: reason }
                            : row
                    );
                })
            );
            return { previous, listKey };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                queryClient.setQueryData(context.listKey, context.previous);
            }
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workSuggestions.all });
        },
    });
}

export function useAssignWorkSuggestion(listParams: WorkSuggestionsListParams) {
    const queryClient = useQueryClient();
    const listKey = queryKeys.workSuggestions.list(listParams);

    return useMutation({
        mutationFn: ({ item, assignees }: AssignVariables) =>
            assignWorkSuggestionApi(item._id, { assignees }),
        onSuccess: (response: AssignWorkSuggestionResponse) => {
            queryClient.setQueryData<WorkSuggestionListResult>(listKey, (current) =>
                patchListItems(current, (items) =>
                    items.map((row) =>
                        row._id === response.suggestion._id ? response.suggestion : row
                    )
                )
            );
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workSuggestions.all });
        },
    });
}

export function useRequestTaskExecution() {
    return useMutation({
        mutationFn: (input: { taskId: string; reason: string }) =>
            requestTaskExecutionApi(input.taskId, { reason: input.reason }),
    });
}

export function mutationErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiHttpError) return error.message;
    if (error instanceof Error) return error.message;
    return fallback;
}

export type { AcceptWorkSuggestionResponse, ListCacheContext };
