/**
 * @jest-environment jsdom
 */
// Smoke: admin approval UI remains functional and still uses task-approvals helpers.
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";

const getTaskApprovals = jest.fn();
const decideTaskApproval = jest.fn();

jest.mock("@/lib/utils/api", () => ({
    getTaskApprovals: (...args: unknown[]) => getTaskApprovals(...args),
    decideTaskApproval: (...args: unknown[]) => decideTaskApproval(...args),
}));

import AdminTaskApprovalsPage from "../app/admin/task-approvals/page";

describe("AdminTaskApprovalsPage", () => {
    beforeEach(() => {
        getTaskApprovals.mockReset();
        decideTaskApproval.mockReset();
        getTaskApprovals.mockResolvedValue({ approvals: [] });
    });

    it("loads the admin approval queue via getTaskApprovals", async () => {
        render(<AdminTaskApprovalsPage />);

        await waitFor(() => {
            expect(getTaskApprovals).toHaveBeenCalled();
        });
        expect(screen.getByText("Approval queue")).toBeInTheDocument();
        expect(screen.getByText(/No pending approvals/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Back to admin dashboard/i })).toHaveAttribute(
            "href",
            "/admin"
        );
    });
});
