/**
 * @jest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TaskApprovalRecord } from "@/lib/utils/api";

const getTaskApprovals = jest.fn();
const decideTaskApproval = jest.fn();

class ApiHttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = "ApiHttpError";
    }
}

jest.mock("@/lib/utils/api", () => ({
    ApiHttpError,
    getTaskApprovals: (...args: unknown[]) => getTaskApprovals(...args),
    decideTaskApproval: (...args: unknown[]) => decideTaskApproval(...args),
}));

import { InboxApprovalsView } from "@/components/work-suggestions/inbox-approvals";

function buildApproval(overrides: Partial<TaskApprovalRecord> = {}): TaskApprovalRecord {
    return {
        _id: "action-1",
        taskId: "task-1",
        conversationId: "conv-1",
        actorType: "agent",
        actorId: "actor-1",
        actionType: "send_email",
        toolName: "email.send",
        messageId: null,
        parameters: { to: "a@example.com" },
        executionState: "approval_pending",
        summary: "Send welcome email",
        error: null,
        patch: {
            before: null,
            after: { policyDecision: { reasons: ["require_approval"] } },
        },
        reason: "policy",
        idempotencyKey: "idem-1",
        createdAt: "2026-08-08T10:00:00.000Z",
        ...overrides,
    };
}

describe("InboxApprovalsView", () => {
    beforeEach(() => {
        getTaskApprovals.mockReset();
        decideTaskApproval.mockReset();
    });

    it("shows loading then empty state", async () => {
        let resolveLoad: (value: { approvals: TaskApprovalRecord[] }) => void = () => undefined;
        getTaskApprovals.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveLoad = resolve;
                })
        );

        render(<InboxApprovalsView />);
        expect(screen.getByTestId("inbox-approvals-loading")).toBeInTheDocument();

        resolveLoad({ approvals: [] });
        expect(await screen.findByTestId("inbox-approvals-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-accept")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-dismiss")).not.toBeInTheDocument();
        expect(screen.queryByTestId("suggestion-assign")).not.toBeInTheDocument();
    });

    it("lists approvals and calls decideTaskApproval on approve", async () => {
        getTaskApprovals.mockResolvedValue({ approvals: [buildApproval()] });
        decideTaskApproval.mockResolvedValue({ approval: buildApproval({ executionState: "approved" }) });

        render(<InboxApprovalsView />);

        expect(await screen.findByTestId("inbox-approvals-list")).toBeInTheDocument();
        expect(screen.getByText("send_email")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("inbox-approvals-approve"));

        await waitFor(() => {
            expect(decideTaskApproval).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskActionId: "action-1",
                    decision: "approve",
                    parameters: { to: "a@example.com" },
                })
            );
        });
    });

    it("shows error and retry when API fails", async () => {
        getTaskApprovals
            .mockRejectedValueOnce(new ApiHttpError(500, "boom"))
            .mockResolvedValueOnce({ approvals: [] });

        render(<InboxApprovalsView />);

        expect(await screen.findByTestId("inbox-approvals-error")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("inbox-approvals-retry"));

        await waitFor(() => {
            expect(getTaskApprovals).toHaveBeenCalledTimes(2);
        });
        expect(await screen.findByTestId("inbox-approvals-empty")).toBeInTheDocument();
    });

    it("surfaces forbidden access clearly for non-admin callers", async () => {
        getTaskApprovals.mockRejectedValue(new ApiHttpError(403, "Forbidden"));

        render(<InboxApprovalsView />);

        const error = await screen.findByTestId("inbox-approvals-error");
        expect(error).toHaveTextContent(/platform admin/i);
    });
});
