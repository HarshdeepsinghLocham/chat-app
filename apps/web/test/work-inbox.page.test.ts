jest.mock("@/components/work-suggestions/work-inbox", () => ({
    WorkInboxView: () => null,
}));

import WorkInboxPage, { dynamic } from "../app/inbox/page";

describe("WorkInboxPage", () => {
    it("forces dynamic rendering", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("renders the inbox view", () => {
        expect(WorkInboxPage()).toBeTruthy();
    });
});
