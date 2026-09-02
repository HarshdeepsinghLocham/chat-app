/**
 * @jest-environment jsdom
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import type { WorkSummary } from "@semantask/types";

const getOrganizationWorkSummary = jest.fn();
const listOrganizations = jest.fn();

jest.mock("@/lib/utils/api", () => ({
    getOrganizationWorkSummary: (...args: unknown[]) => getOrganizationWorkSummary(...args),
    listOrganizations: (...args: unknown[]) => listOrganizations(...args),
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
            overdue: 1,
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
        attention: {
            counts: {
                members: 3,
                open: 1,
                overdue: 1,
                blocked: 0,
                unassigned: 0,
                awaitingConfirmation: 0,
            },
            overdue: [
                {
                    _id: "task-1",
                    title: "Coordinate launch",
                    boardStatus: "todo",
                    dueAt: "2026-08-20T10:00:00.000Z",
                    conversationId: "conv-1",
                    createdAt: "2026-08-22T10:00:00.000Z",
                },
            ],
            blocked: [],
            unassigned: [],
            awaitingConfirmation: [],
            recentlyCreated: [],
            byOwner: [],
        },
        generatedAt: "2026-08-25T10:00:00.000Z",
        ...overrides,
    };
}

describe("WorkDashboardView", () => {
    beforeEach(() => {
        getOrganizationWorkSummary.mockReset();
        listOrganizations.mockReset();
        window.localStorage.clear();
        listOrganizations.mockResolvedValue([
            {
                id: "507f1f77bcf86cd799439015",
                name: "Acme",
                slug: "acme",
                status: "active",
                createdBy: "u1",
                createdAt: "2026-08-08T10:00:00.000Z",
                updatedAt: "2026-08-08T10:00:00.000Z",
                role: "owner",
            },
        ]);
    });

    it("shows onboarding when no active organization is set", async () => {
        renderWithQuery(<WorkDashboardView />);
        expect(await screen.findByTestId("work-dashboard-onboarding")).toBeInTheDocument();
        expect(getOrganizationWorkSummary).not.toHaveBeenCalled();
    });

    it("renders attention queues and task links for org-scoped summaries", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "507f1f77bcf86cd799439015");
        getOrganizationWorkSummary.mockResolvedValue(buildSummary());

        renderWithQuery(<WorkDashboardView boardEnabled />);

        await waitFor(() => {
            expect(getOrganizationWorkSummary).toHaveBeenCalledWith("507f1f77bcf86cd799439015");
        });

        expect(await screen.findByTestId("work-dashboard")).toBeInTheDocument();
        expect(screen.getByTestId("work-dashboard-attention-counts")).toBeInTheDocument();
        expect(screen.getByTestId("work-dashboard-overdue")).toHaveTextContent("Coordinate launch");
        expect(screen.getByRole("link", { name: "Coordinate launch" })).toHaveAttribute(
            "href",
            "/work/task-1"
        );
        expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute(
            "href",
            "/inbox/board?task=task-1"
        );
        expect(screen.queryByTestId("suggestion-accept")).not.toBeInTheDocument();
        expect(screen.getByTestId("work-dashboard-aging-approvals")).toHaveTextContent(
            "Open approvals"
        );
    });
});
