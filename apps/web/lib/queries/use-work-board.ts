"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardStatus, TaskRecord } from "@semantask/types";
import {
    listWorkBoard,
    patchTaskApi,
    type WorkBoardListResult,
} from "@/lib/utils/api";
import { queryKeys, type WorkBoardListParams } from "@/lib/queries/keys";

export const WORK_BOARD_PAGE_LIMIT = 50;

export function mutationErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

export function useWorkBoardList(params: {
    organizationId?: string | null;
    conversationId?: string;
    boardStatus?: BoardStatus | "";
    priority?: string;
    due?: "all" | "overdue" | "none";
    page: number;
    limit?: number;
    enabled?: boolean;
}) {
    const limit = params.limit ?? WORK_BOARD_PAGE_LIMIT;
    const listParams: WorkBoardListParams = {
        organizationId: params.organizationId ?? undefined,
        conversationId: params.conversationId,
        boardStatus: params.boardStatus ?? "",
        priority: params.priority || undefined,
        due: params.due && params.due !== "all" ? params.due : undefined,
        page: params.page,
        limit,
    };
    const enabled = (params.enabled ?? true)
        && Boolean(listParams.organizationId || listParams.conversationId);

    const query = useQuery({
        queryKey: queryKeys.workBoard.list(listParams),
        queryFn: () =>
            listWorkBoard({
                organizationId: listParams.organizationId,
                conversationId: listParams.conversationId,
                boardStatus: listParams.boardStatus || undefined,
                priority: listParams.priority,
                due: listParams.due === "overdue" || listParams.due === "none"
                    ? listParams.due
                    : undefined,
                page: listParams.page,
                limit: listParams.limit,
            }),
        enabled,
    });

    return { ...query, listParams };
}

export function useMoveWorkBoardCard(listParams: WorkBoardListParams) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: { task: TaskRecord; boardStatus: BoardStatus }) =>
            patchTaskApi(input.task._id, { boardStatus: input.boardStatus }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.workBoard.list(listParams) });
            const previous = queryClient.getQueryData<WorkBoardListResult>(
                queryKeys.workBoard.list(listParams)
            );
            if (previous) {
                queryClient.setQueryData<WorkBoardListResult>(
                    queryKeys.workBoard.list(listParams),
                    {
                        ...previous,
                        items: previous.items.map((item) =>
                            item._id === input.task._id
                                ? { ...item, boardStatus: input.boardStatus }
                                : item
                        ),
                    }
                );
            }
            return { previous };
        },
        onError: (_error, _input, context) => {
            if (context?.previous) {
                queryClient.setQueryData(
                    queryKeys.workBoard.list(listParams),
                    context.previous
                );
            }
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.workBoard.all });
        },
    });
}
