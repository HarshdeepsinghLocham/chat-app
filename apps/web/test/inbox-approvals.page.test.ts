jest.mock("@/components/work-suggestions/inbox-approvals", () => ({
    InboxApprovalsView: () => null,
}));

import InboxApprovalsPage, { dynamic } from "../app/inbox/approvals/page";

describe("InboxApprovalsPage", () => {
    it("forces dynamic rendering", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("renders the approvals view", () => {
        expect(InboxApprovalsPage()).toBeTruthy();
    });
});
