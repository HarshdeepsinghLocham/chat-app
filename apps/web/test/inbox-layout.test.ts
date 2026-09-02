/**
 * Inbox layout always renders the manager surface.
 */
jest.mock("next/navigation", () => ({
    usePathname: () => "/inbox",
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isCoordinationBoardEnabled: jest.fn(() => false),
    isOrgDashboardEnabled: jest.fn(() => false),
}));

jest.mock("@/components/inbox/inbox-subnav", () => ({
    InboxSubnav: () => null,
}));

import InboxLayout from "../app/inbox/layout";

describe("InboxLayout", () => {
    it("renders children", () => {
        const element = InboxLayout({ children: "child" });
        expect(element).toBeTruthy();
    });
});
