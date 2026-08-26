import { NextResponse } from "next/server";

jest.mock("@semantask/services/organization-policy.service", () => ({
    isCoordinationBoardEnabled: jest.fn(),
}));

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
}));

jest.mock("@/lib/utils/auth/requireConversationAccess", () => ({
    requireConversationAccess: jest.fn(),
}));

class MockAuthorizationError extends Error {
    code: "FORBIDDEN" | "NOT_FOUND";

    constructor(code: "FORBIDDEN" | "NOT_FOUND", message: string) {
        super(message);
        this.code = code;
        this.name = "AuthorizationError";
    }
}

jest.mock("@semantask/services/authorization.service", () => ({
    AuthorizationError: MockAuthorizationError,
}));

jest.mock("@semantask/services/organization.service", () => ({
    assertMembership: jest.fn(),
    assertOrganizationActive: jest.fn(),
}));

jest.mock("@semantask/services/organization-errors", () => {
    class ValidationError extends Error {
        code = "VALIDATION_ERROR" as const;
        constructor(message: string) {
            super(message);
            this.name = "ValidationError";
        }
    }
    return {
        ValidationError,
        organizationApiErrorStatus: () => 500,
    };
});

jest.mock("@semantask/services/work-board.service", () => ({
    listWorkBoard: jest.fn(),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { requireConversationAccess } from "@/lib/utils/auth/requireConversationAccess";
import { isCoordinationBoardEnabled } from "@semantask/services/organization-policy.service";
import { assertMembership, assertOrganizationActive } from "@semantask/services/organization.service";
import { listWorkBoard } from "@semantask/services/work-board.service";
import { GET } from "../app/api/work-board/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    role: "user" as const,
};

const task = {
    _id: "507f1f77bcf86cd799439012",
    title: "Coordinate launch",
    boardStatus: "todo" as const,
    status: "pending" as const,
};

describe("GET /api/work-board", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(true);
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (requireConversationAccess as jest.Mock).mockResolvedValue({ response: null });
        (assertOrganizationActive as jest.Mock).mockResolvedValue(undefined);
        (assertMembership as jest.Mock).mockResolvedValue({ role: "member" });
    });

    it("returns 404 when COORDINATION_BOARD is off", async () => {
        (isCoordinationBoardEnabled as jest.Mock).mockReturnValue(false);
        const response = await GET(
            new Request("http://localhost/api/work-board?organizationId=507f1f77bcf86cd799439015")
        );
        expect(response.status).toBe(404);
        expect(listWorkBoard).not.toHaveBeenCalled();
    });

    it("returns 400 when no scope is provided", async () => {
        const response = await GET(new Request("http://localhost/api/work-board"));
        expect(response.status).toBe(400);
    });

    it("returns 400 for invalid boardStatus", async () => {
        const response = await GET(
            new Request("http://localhost/api/work-board?organizationId=507f1f77bcf86cd799439015&boardStatus=pending")
        );
        expect(response.status).toBe(400);
        expect(listWorkBoard).not.toHaveBeenCalled();
    });

    it("returns the list contract", async () => {
        (listWorkBoard as jest.Mock).mockResolvedValue({
            items: [task],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await GET(
            new Request("http://localhost/api/work-board?organizationId=507f1f77bcf86cd799439015&boardStatus=todo")
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            data: {
                items: [task],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            },
        });
    });
});
