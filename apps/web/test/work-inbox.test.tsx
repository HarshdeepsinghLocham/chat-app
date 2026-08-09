/**
 * @jest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import type { WorkSuggestionRecord } from "@semantask/types";

const listWorkSuggestions = jest.fn();

jest.mock("@/lib/utils/api", () => ({
    ApiHttpError: class ApiHttpError extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    },
    listWorkSuggestions: (...args: unknown[]) => listWorkSuggestions(...args),
}));

import { WorkInboxView } from "@/components/work-suggestions/work-inbox";

function buildSuggestion(overrides: Partial<WorkSuggestionRecord> = {}): WorkSuggestionRecord {
    return {
        _id: "sug-1",
        messageId: "msg-1",
        conversationId: "507f1f77bcf86cd799439014",
        organizationId: "507f1f77bcf86cd799439015",
        intentId: null,
        status: "proposed",
        title: "Send welcome email",
        summary: "Follow up with the new hire",
        confidence: 0.88,
        candidates: {
            assigneeCandidates: [],
            dueAtCandidate: null,
            priorityCandidate: "",
        },
        dismissReason: null,
        convertedTaskId: null,
        extractorVersion: "intelligent-v7",
        createdAt: "2026-08-08T10:00:00.000Z",
        updatedAt: "2026-08-08T10:00:00.000Z",
        ...overrides,
    };
}

describe("WorkInboxView", () => {
    beforeEach(() => {
        listWorkSuggestions.mockReset();
        window.localStorage.clear();
    });

    it("shows onboarding when no org or conversation scope is set", async () => {
        render(<WorkInboxView />);
        expect(await screen.findByTestId("work-inbox-onboarding")).toBeInTheDocument();
        expect(listWorkSuggestions).not.toHaveBeenCalled();
        expect(screen.queryByTestId("suggestion-accept")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-dismiss")).not.toBeInTheDocument();
    });

    it("loads org-scoped suggestions and links to detail", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "507f1f77bcf86cd799439015");
        listWorkSuggestions.mockResolvedValue({
            items: [buildSuggestion()],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        render(<WorkInboxView />);

        await waitFor(() => {
            expect(listWorkSuggestions).toHaveBeenCalledWith({
                organizationId: "507f1f77bcf86cd799439015",
                conversationId: undefined,
                status: "proposed",
                page: 1,
                limit: 20,
            });
        });

        expect(await screen.findByTestId("work-inbox-list")).toBeInTheDocument();
        const link = screen.getByTestId("work-inbox-row-link");
        expect(link).toHaveAttribute("href", "/work-suggestions/sug-1");
        expect(screen.getByText("Send welcome email")).toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-accept")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-dismiss")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-assign")).not.toBeInTheDocument();
    });

    it("shows empty state when API returns no items", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "507f1f77bcf86cd799439015");
        listWorkSuggestions.mockResolvedValue({
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        });

        render(<WorkInboxView />);
        expect(await screen.findByTestId("work-inbox-empty")).toHaveTextContent(
            "No proposed suggestions"
        );
    });

    it("shows error state with retry", async () => {
        window.localStorage.setItem("semantask.activeOrganizationId", "507f1f77bcf86cd799439015");
        listWorkSuggestions.mockRejectedValue(new Error("Forbidden"));

        render(<WorkInboxView />);
        expect(await screen.findByTestId("work-inbox-error")).toHaveTextContent("Forbidden");
        expect(screen.getByTestId("work-inbox-retry")).toBeInTheDocument();
    });
});
