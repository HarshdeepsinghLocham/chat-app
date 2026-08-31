/**
 * @jest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import type { TaskRecord } from "@semantask/types";

const getTask = jest.fn();
const replace = jest.fn();

class ApiHttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ApiHttpError";
    }
}

jest.mock("next/navigation", () => ({
    useParams: () => ({ id: "task-1" }),
    useRouter: () => ({ replace }),
}));

jest.mock("@/lib/utils/api", () => ({
    ApiHttpError,
    getTask: (...args: unknown[]) => getTask(...args),
}));

import TaskDeepLinkPage from "../app/tasks/[id]/page";

function buildTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
    return {
        _id: "task-1",
        conversationId: "conv-1",
        parentTaskId: null,
        suggestionId: "sug-1",
        title: "Coordinate launch",
        description: "",
        status: "pending",
        boardStatus: "todo",
        priority: "high",
        assignees: [],
        dueAt: null,
        createdBy: "user-1",
        source: "ai",
        sourceMessageIds: ["msg-1"],
        latestContextMessageId: null,
        confidence: 0.9,
        tags: [],
        dedupeKey: "suggestion.accept::sug-1",
        subTasks: [],
        dependencyIds: [],
        retryCount: 0,
        maxRetries: 2,
        progress: 0,
        checkpoints: [],
        executionHistory: { attempts: 0, failures: 0, results: [] },
        result: { success: false, confidence: 0, evidence: null },
        version: 1,
        closedAt: null,
        archivedAt: null,
        updatedBy: null,
        createdAt: "2026-08-22T10:00:00.000Z",
        updatedAt: "2026-08-22T10:00:00.000Z",
        ...overrides,
    };
}

describe("TaskDeepLinkPage", () => {
    beforeEach(() => {
        getTask.mockReset();
        replace.mockReset();
    });

    it("shows forbidden copy when the user cannot access the task", async () => {
        getTask.mockRejectedValue(new ApiHttpError(403, "Forbidden"));
        render(React.createElement(TaskDeepLinkPage));
        expect(await screen.findByTestId("task-deep-link-forbidden")).toHaveTextContent("Forbidden");
        expect(replace).not.toHaveBeenCalled();
    });

    it("redirects to chat with task and source message params", async () => {
        getTask.mockResolvedValue(buildTask());
        render(React.createElement(TaskDeepLinkPage));

        await waitFor(() => {
            expect(replace).toHaveBeenCalledWith("/c/conv-1?msg=msg-1&task=task-1");
        });
        expect(screen.queryByTestId("task-deep-link-forbidden")).not.toBeInTheDocument();
    });
});
