/**
 * @jest-environment jsdom
 */
import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";

jest.mock("@semantask/types", () => ({
    normalizeSemanticTypeForClient: (value: string | null | undefined) => {
        if (!value) return "chat";
        const normalized = String(value).trim().toLowerCase();
        const allowed = new Set([
            "chat",
            "task",
            "incident",
            "scheduling",
            "escalation",
            "approval",
            "automation",
            "unknown",
        ]);
        return allowed.has(normalized) ? normalized : "unknown";
    },
}));

import { IntentBadge } from "@/components/chat/intent-badge";

describe("IntentBadge", () => {
    it("renders badge for non-chat semantic types", () => {
        render(<IntentBadge semanticType="task" confidence={0.91} />);
        expect(screen.getByTestId("intent-badge")).toHaveTextContent("Task");
        expect(screen.getByTestId("intent-badge")).toHaveTextContent("91%");
        expect(screen.queryByTestId("review-suggestion-cta")).toBeNull();
    });

    it("hides badge for chat semantic type", () => {
        const { container } = render(<IntentBadge semanticType="chat" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows Review suggestion CTA when reviewHref is set", () => {
        render(
            <IntentBadge
                semanticType="incident"
                confidence={0.8}
                reviewHref="/work-suggestions/sug-1"
            />
        );
        const cta = screen.getByTestId("review-suggestion-cta");
        expect(cta).toHaveTextContent("Review suggestion");
        expect(cta).toHaveAttribute("href", "/work-suggestions/sug-1");
    });

    it("omits CTA when no suggestion exists (no reviewHref)", () => {
        render(<IntentBadge semanticType="scheduling" reviewHref={null} />);
        expect(screen.getByTestId("intent-badge")).toBeInTheDocument();
        expect(screen.queryByTestId("review-suggestion-cta")).toBeNull();
    });
});
