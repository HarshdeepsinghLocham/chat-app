/**
 * @jest-environment jsdom
 */
import React from "react";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import type { WorkSuggestionRecord } from "@semantask/types";
import { WorkSuggestionDetailView } from "@/components/work-suggestions/work-suggestion-detail";

function buildSuggestion(overrides: Partial<WorkSuggestionRecord> = {}): WorkSuggestionRecord {
    return {
        _id: "sug-1",
        messageId: "msg-1",
        conversationId: "conv-1",
        organizationId: null,
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
        extractorVersion: "intelligent-v6-message-intent",
        createdAt: "2026-08-08T10:00:00.000Z",
        updatedAt: "2026-08-08T10:00:00.000Z",
        ...overrides,
    };
}

describe("WorkSuggestionDetailView", () => {
    it("shows loading state", () => {
        render(
            <WorkSuggestionDetailView
                loading
                errorStatus={null}
                errorMessage={null}
                suggestion={null}
            />
        );
        expect(screen.getByTestId("work-suggestion-loading")).toBeInTheDocument();
    });

    it("shows forbidden state for 403", () => {
        render(
            <WorkSuggestionDetailView
                loading={false}
                errorStatus={403}
                errorMessage="Forbidden"
                suggestion={null}
            />
        );
        expect(screen.getByTestId("work-suggestion-forbidden")).toHaveTextContent("Forbidden");
        expect(screen.getByRole("link", { name: /back to chat/i })).toHaveAttribute("href", "/");
    });

    it("shows not found state for 404", () => {
        render(
            <WorkSuggestionDetailView
                loading={false}
                errorStatus={404}
                errorMessage="Not found"
                suggestion={null}
            />
        );
        expect(screen.getByTestId("work-suggestion-not-found")).toBeInTheDocument();
    });

    it("renders suggestion detail on success", () => {
        render(
            <WorkSuggestionDetailView
                loading={false}
                errorStatus={null}
                errorMessage={null}
                suggestion={buildSuggestion()}
            />
        );
        const detail = screen.getByTestId("work-suggestion-detail");
        expect(detail).toHaveTextContent("Send welcome email");
        expect(detail).toHaveTextContent("Follow up with the new hire");
        expect(detail).toHaveTextContent("88%");
        expect(detail).toHaveTextContent("msg-1");
    });
});
