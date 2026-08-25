import { NextResponse } from "next/server";

jest.mock("@semantask/services/organization-policy.service", () => ({
    isOrgDashboardEnabled: jest.fn(),
}));

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
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

jest.mock("@semantask/services/work-summary.service", () => ({
    getOrganizationWorkSummary: jest.fn(),
}));

jest.mock("@semantask/services/work-board.service", () => ({
    isValidObjectId: jest.fn((id: string) => /^[a-f0-9]{24}$/i.test(id)),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { isOrgDashboardEnabled } from "@semantask/services/organization-policy.service";
import { assertMembership, assertOrganizationActive } from "@semantask/services/organization.service";
import { getOrganizationWorkSummary } from "@semantask/services/work-summary.service";
import { GET } from "../app/api/organizations/[id]/work-summary/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    role: "user" as const,
};

const organizationId = "507f1f77bcf86cd799439015";

const summary = {
    openWork: {
        counts: { todo: 1, doing: 0, done: 0 },
        overdue: 0,
        openAgeMs: null,
        oldest: [],
    },
    agingApprovals: { pending: 0, aging: 0, oldest: [] },
    highRiskPending: { pending: 0, aging: 0, oldest: [] },
    generatedAt: "2026-08-25T10:00:00.000Z",
};

describe("GET /api/organizations/[id]/work-summary", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isOrgDashboardEnabled as jest.Mock).mockReturnValue(true);
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (assertOrganizationActive as jest.Mock).mockResolvedValue(undefined);
        (assertMembership as jest.Mock).mockResolvedValue({ role: "member" });
        (getOrganizationWorkSummary as jest.Mock).mockResolvedValue(summary);
    });

    it("returns 404 when ORG_DASHBOARD is disabled", async () => {
        (isOrgDashboardEnabled as jest.Mock).mockReturnValue(false);

        const response = await GET(new Request("http://localhost/api/organizations/x/work-summary"), {
            params: Promise.resolve({ id: organizationId }),
        });

        expect(response.status).toBe(404);
        expect(requireAuthUser).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const response = await GET(new Request("http://localhost/api/organizations/x/work-summary"), {
            params: Promise.resolve({ id: organizationId }),
        });

        expect(response.status).toBe(401);
    });

    it("returns 403 when the caller is not an org member", async () => {
        (assertMembership as jest.Mock).mockRejectedValue(
            new MockAuthorizationError("FORBIDDEN", "Forbidden")
        );

        const response = await GET(new Request("http://localhost/api/organizations/x/work-summary"), {
            params: Promise.resolve({ id: organizationId }),
        });

        expect(response.status).toBe(403);
        expect(getOrganizationWorkSummary).not.toHaveBeenCalled();
    });

    it("returns the summary for any org member", async () => {
        const response = await GET(new Request("http://localhost/api/organizations/x/work-summary"), {
            params: Promise.resolve({ id: organizationId }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(assertMembership).toHaveBeenCalledWith(organizationId, user.id);
        expect(getOrganizationWorkSummary).toHaveBeenCalledWith(organizationId);
        expect(body.data.openWork.counts.todo).toBe(1);
    });
});
