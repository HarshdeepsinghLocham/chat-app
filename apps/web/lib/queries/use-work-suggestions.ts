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

    const query = useQuery({
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

    return { ...query, listParams };
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
    previousItem?: WorkSuggestionRecord;
    listKey: ReturnType<typeof queryKeys.workSuggestions.list>;
};

function restoreRecord(
    current: WorkSuggestionListResult | undefined,
    previousItem: WorkSuggestionRecord | undefined
): WorkSuggestionListResult | undefined {
    if (!current || !previousItem) return current;
    const index = current.items.findIndex((row) => row._id === previousItem._id);
    if (index >= 0) {
        const items = current.items.slice();
        items[index] = previousItem;
        return { ...current, items };
    }
    return { ...current, items: [previousItem, ...current.items] };
}

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
            const previousItem =
                queryClient.getQueryData<WorkSuggestionListResult>(listKey)?.items.find(
                    (row) => row._id === item._id
                ) ?? item;
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
            return { previousItem, listKey };
        },
        onError: (_error, _variables, context) => {
            if (!context) return;
            queryClient.setQueryData<WorkSuggestionListResult>(context.listKey, (current) =>
                restoreRecord(current, context.previousItem)
            );
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
            const previousItem =
                queryClient.getQueryData<WorkSuggestionListResult>(listKey)?.items.find(
                    (row) => row._id === item._id
                ) ?? item;
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
            return { previousItem, listKey };
        },
        onError: (_error, _variables, context) => {
            if (!context) return;
            queryClient.setQueryData<WorkSuggestionListResult>(context.listKey, (current) =>
                restoreRecord(current, context.previousItem)
            );
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
