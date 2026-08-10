/**
 * Server page gate: WORK_INBOX_UI=0 → notFound.
 */
const notFound = jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});

jest.mock("next/navigation", () => ({
    notFound: () => notFound(),
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isWorkInboxUiEnabled: jest.fn(),
}));

jest.mock("@/components/work-suggestions/inbox-approvals", () => ({
    InboxApprovalsView: () => null,
}));

import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import InboxApprovalsPage, { dynamic } from "../app/inbox/approvals/page";

describe("InboxApprovalsPage flag gate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("forces dynamic rendering so WORK_INBOX_UI is evaluated at request time", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("calls notFound when WORK_INBOX_UI is disabled", () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(false);
        expect(() => InboxApprovalsPage()).toThrow("NEXT_NOT_FOUND");
        expect(notFound).toHaveBeenCalled();
    });

    it("renders when WORK_INBOX_UI is enabled", () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(true);
        const element = InboxApprovalsPage();
        expect(notFound).not.toHaveBeenCalled();
        expect(element).toBeTruthy();
    });
});
