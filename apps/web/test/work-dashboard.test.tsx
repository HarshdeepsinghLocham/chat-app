/**
 * @jest-environment jsdom
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import type { WorkSummary } from "@semantask/types";

const getOrganizationWorkSummary = jest.fn();

jest.mock("@/lib/utils/api", () => ({
    getOrganizationWorkSummary: (...args: unknown[]) => getOrganizationWorkSummary(...args),
}));

import { WorkDashboardView } from "@/components/work-summary/work-dashboard";

function renderWithQuery(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function buildSummary(overrides: Partial<WorkSummary> = {}): WorkSummary {
    return {
        openWork: {
            counts: { todo: 1, doing: 0, done: 0 },
            overdue: 0,
            openAgeMs: { p50: 3600000, p95: 7200000 },
            oldest: [
                {
                    _id: "task-1",
                    title: "Coordinate launch",
                    boardStatus: "todo",
                    dueAt: null,
                    conversationId: "conv-1",
                    createdAt: "2026-08-22T10:00:00.000Z",
                },
            ],
        },
        agingApprovals: {
            pending: 1,
            aging: 0,
            oldest: [
                {
                    _id: "action-1",
                    taskId: "task-1",
                    toolName: "send_email",
                    createdAt: "2026-08-22T10:00:00.000Z",
                    conversationId: "conv-1",
                },
            ],
        },
        highRiskPending: {
            pending: 1,
            aging: 0,
            oldest: [],
        },
        generatedAt: "2026-08-25T10:00:00.000Z",
        ...overrides,
    };
}

describe("WorkDashboardView", () => {
    beforeEach(() => {
        getOrganizationWorkSummary.mockReset();
        window.localStorage.clear();
    });

    it("shows onboarding when no active organization is set", async () => {
        renderWithQuery(<WorkDashboardView />);
        expect(await screen.findByTestId("work-dashboard-onboarding")).toBeInTheDocument();
        expect(getOrganizationWorkSummary).not.toHaveBeenCalled();
    });

    it("renders widgets and task links for org-scoped summaries", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "507f1f77bcf86cd799439015");
        getOrganizationWorkSummary.mockResolvedValue(buildSummary());

        renderWithQuery(<WorkDashboardView boardEnabled />);

        await waitFor(() => {
            expect(getOrganizationWorkSummary).toHaveBeenCalledWith("507f1f77bcf86cd799439015");
        });

        expect(await screen.findByTestId("work-dashboard")).toBeInTheDocument();
        expect(screen.getByTestId("work-dashboard-open-task-link")).toHaveAttribute(
            "href",
            "/tasks/task-1"
        );
        expect(screen.getByTestId("work-dashboard-board-link")).toHaveAttribute(
            "href",
            "/inbox/board?task=task-1"
        );
        expect(screen.queryByTestId("suggestion-accept")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-dismiss")).not.toBeInTheDocument();
        expect(screen.getAllByTestId("work-dashboard-approvals-link")[0]).toHaveAttribute(
            "href",
            "/inbox/approvals"
        );
    });
});
