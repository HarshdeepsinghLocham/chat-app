/**
 * Server page gate: COORDINATION_BOARD=0 → notFound.
 */
const notFound = jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});

jest.mock("next/navigation", () => ({
    notFound: () => notFound(),
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isCoordinationBoardEnabled: jest.fn(),
}));

jest.mock("@/components/work-board/work-board", () => ({
    WorkBoardView: () => null,
}));

import { isCoordinationBoardEnabled } from "@semantask/services/organization-policy.service";
import WorkBoardPage, { dynamic } from "../app/inbox/board/page";

describe("WorkBoardPage flag gate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("forces dynamic rendering so COORDINATION_BOARD is evaluated at request time", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("calls notFound when COORDINATION_BOARD is disabled", () => {
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(false);
        expect(() => WorkBoardPage()).toThrow("NEXT_NOT_FOUND");
        expect(notFound).toHaveBeenCalled();
    });

    it("renders when COORDINATION_BOARD is enabled", () => {
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(true);
        const element = WorkBoardPage();
        expect(notFound).not.toHaveBeenCalled();
        expect(element).toBeTruthy();
    });
});
