/**
 * @jest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import type { ClientConversation } from "@semantask/types";

const getConversation = jest.fn();
const upsertConversation = jest.fn();
const setSelectedConversation = jest.fn();

class ApiHttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ApiHttpError";
    }
}

jest.mock("next/navigation", () => ({
    useParams: () => ({ id: "conv-1" }),
}));

jest.mock("@/lib/utils/api", () => ({
    ApiHttpError,
    getConversation: (...args: unknown[]) => getConversation(...args),
}));

jest.mock("@/store/chat-store", () => {
    const store = (
        selector: (state: {
            upsertConversation: typeof upsertConversation;
            setSelectedConversation: typeof setSelectedConversation;
        }) => unknown
    ) => selector({ upsertConversation, setSelectedConversation });
    return { __esModule: true, default: store };
});

jest.mock("@/components/home/chat-workspace", () => ({
    __esModule: true,
    default: () => React.createElement("div", { "data-testid": "chat-workspace" }),
}));

import ConversationDeepLinkPage from "../app/c/[id]/page";

function buildConversation(): ClientConversation {
    return {
        _id: "conv-1",
        type: "direct",
        isGroup: false,
        participants: [],
    };
}

describe("ConversationDeepLinkPage", () => {
    beforeEach(() => {
        getConversation.mockReset();
        upsertConversation.mockReset();
        setSelectedConversation.mockReset();
    });

    it("shows forbidden copy when the user cannot access the conversation", async () => {
        getConversation.mockRejectedValue(new ApiHttpError(403, "Forbidden"));
        render(React.createElement(ConversationDeepLinkPage));
        expect(await screen.findByTestId("conversation-deep-link-forbidden")).toHaveTextContent(
            "Forbidden"
        );
        expect(screen.queryByTestId("chat-workspace")).not.toBeInTheDocument();
    });

    it("hydrates chat and renders the workspace on success", async () => {
        const conversation = buildConversation();
        getConversation.mockResolvedValue(conversation);
        render(React.createElement(ConversationDeepLinkPage));

        expect(await screen.findByTestId("chat-workspace")).toBeInTheDocument();
        expect(upsertConversation).toHaveBeenCalledWith(conversation);
        expect(setSelectedConversation).toHaveBeenCalledWith(conversation);
    });
});
