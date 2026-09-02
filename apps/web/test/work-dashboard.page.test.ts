/**
 * Server page gate: ORG_DASHBOARD=0 → notFound.
 */
const notFound = jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});

jest.mock("next/navigation", () => ({
    notFound: () => notFound(),
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isOrgDashboardEnabled: jest.fn(),
    isCoordinationBoardEnabled: jest.fn(),
}));

jest.mock("@/components/work-summary/work-dashboard", () => ({
    WorkDashboardView: () => null,
}));

import {
    isCoordinationBoardEnabled,
    isOrgDashboardEnabled,
} from "@semantask/services/organization-policy.service";
import WorkDashboardPage, { dynamic } from "../app/inbox/dashboard/page";

describe("WorkDashboardPage flag gate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(false);
    });

    it("forces dynamic rendering so ORG_DASHBOARD is evaluated at request time", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("calls notFound when ORG_DASHBOARD is disabled", () => {
        (isOrgDashboardEnabled as jest.Mock).mockReturnValue(false);
        expect(() => WorkDashboardPage()).toThrow("NEXT_NOT_FOUND");
        expect(notFound).toHaveBeenCalled();
    });

    it("renders when ORG_DASHBOARD is enabled", () => {
        (isOrgDashboardEnabled as jest.Mock).mockReturnValue(true);
        const element = WorkDashboardPage();
        expect(notFound).not.toHaveBeenCalled();
        expect(element).toBeTruthy();
    });
});
