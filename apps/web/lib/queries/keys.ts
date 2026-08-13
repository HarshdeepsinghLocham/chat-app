import type { WorkSuggestionStatus } from "@semantask/types";

export type WorkSuggestionsListParams = {
    organizationId?: string;
    conversationId?: string;
    status?: WorkSuggestionStatus | "";
    page: number;
    limit: number;
};

export type TaskApprovalsListParams = {
    organizationId?: string;
    conversationId?: string;
};

export const queryKeys = {
    workSuggestions: {
        all: ["workSuggestions"] as const,
        list: (params: WorkSuggestionsListParams) =>
            [
                "workSuggestions",
                "list",
                params.organizationId ?? null,
                params.conversationId ?? null,
                params.status || null,
                params.page,
                params.limit,
            ] as const,
    },
    taskApprovals: {
        all: ["taskApprovals"] as const,
        list: (params: TaskApprovalsListParams) =>
            [
                "taskApprovals",
                "list",
                params.organizationId ?? null,
                params.conversationId ?? null,
            ] as const,
    },
    organizations: {
        all: ["organizations"] as const,
        list: () => ["organizations", "list"] as const,
        members: (organizationId: string) =>
            ["organizations", "members", organizationId] as const,
    },
};
