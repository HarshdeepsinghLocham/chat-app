/**
 * Inbox layout gate: WORK_INBOX_UI=0 → notFound.
 */
const notFound = jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});

jest.mock("next/navigation", () => ({
    notFound: () => notFound(),
    usePathname: () => "/inbox",
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isWorkInboxUiEnabled: jest.fn(),
    isCoordinationBoardEnabled: jest.fn(() => false),
}));

jest.mock("@/components/inbox/inbox-subnav", () => ({
    InboxSubnav: () => null,
}));

import {
    isCoordinationBoardEnabled,
    isWorkInboxUiEnabled,
} from "@semantask/services/organization-policy.service";
import InboxLayout from "../app/inbox/layout";

describe("InboxLayout flag gate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("calls notFound when WORK_INBOX_UI is disabled", () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(false);
        expect(() => InboxLayout({ children: null })).toThrow("NEXT_NOT_FOUND");
        expect(notFound).toHaveBeenCalled();
    });

    it("renders children when WORK_INBOX_UI is enabled", () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(true);
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(false);
        const element = InboxLayout({ children: "child" });
        expect(notFound).not.toHaveBeenCalled();
        expect(element).toBeTruthy();
    });
});
