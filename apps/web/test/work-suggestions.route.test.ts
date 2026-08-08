import { NextResponse } from "next/server";

jest.mock("@/lib/Db/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
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
    assertWorkSuggestionAccess: jest.fn(),
}));

jest.mock("@semantask/services/organization.service", () => ({
    assertMembership: jest.fn(),
    assertOrganizationActive: jest.fn(),
}));

jest.mock("@semantask/services/work-suggestion.service", () => ({
    listWorkSuggestions: jest.fn(),
    getWorkSuggestion: jest.fn(),
    WORK_SUGGESTION_STATUSES: ["proposed", "accepted", "dismissed", "converted"],
    isSuggestionStatus: (value: unknown) =>
        typeof value === "string"
        && ["proposed", "accepted", "dismissed", "converted"].includes(value),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { requireConversationAccess } from "@/lib/utils/auth/requireConversationAccess";
import {
    assertWorkSuggestionAccess,
} from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import {
    getWorkSuggestion,
    listWorkSuggestions,
} from "@semantask/services/work-suggestion.service";
import { GET as listGET } from "../app/api/work-suggestions/route";
import { GET as getByIdGET } from "../app/api/work-suggestions/[id]/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    role: "user" as const,
};

const suggestion = {
    _id: "507f1f77bcf86cd799439012",
    messageId: "507f1f77bcf86cd799439013",
    conversationId: "507f1f77bcf86cd799439014",
    organizationId: "507f1f77bcf86cd799439015",
    intentId: null,
    status: "proposed" as const,
    title: "Follow up with the team",
    summary: "",
    confidence: 0.9,
    candidates: {
        assigneeCandidates: [] as string[],
        dueAtCandidate: null,
        priorityCandidate: "" as const,
    },
    dismissReason: null,
    convertedTaskId: null,
    extractorVersion: "v1",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
};

describe("GET /api/work-suggestions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (requireConversationAccess as jest.Mock).mockResolvedValue({ response: null });
        (assertOrganizationActive as jest.Mock).mockResolvedValue(undefined);
        (assertMembership as jest.Mock).mockResolvedValue({ role: "member" });
    });

    it("returns 401 without auth", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
        });

        const response = await listGET(
            new Request("http://localhost/api/work-suggestions?conversationId=507f1f77bcf86cd799439014")
        );
        expect(response.status).toBe(401);
    });

    it("returns 400 when no scope is provided", async () => {
        const response = await listGET(new Request("http://localhost/api/work-suggestions"));
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ success: false });
    });

    it("returns 403 for unauthorized conversation list", async () => {
        (requireConversationAccess as jest.Mock).mockResolvedValue({
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        });

        const response = await listGET(
            new Request("http://localhost/api/work-suggestions?conversationId=507f1f77bcf86cd799439014")
        );
        expect(response.status).toBe(403);
    });

    it("returns 403 for unauthorized org list", async () => {
        (assertMembership as jest.Mock).mockRejectedValue(
            new MockAuthorizationError("FORBIDDEN", "Forbidden")
        );

        const response = await listGET(
            new Request("http://localhost/api/work-suggestions?organizationId=507f1f77bcf86cd799439015")
        );
        expect(response.status).toBe(403);
    });

    it("returns { success, data } list contract", async () => {
        (listWorkSuggestions as jest.Mock).mockResolvedValue({
            items: [suggestion],
            pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
        });

        const response = await listGET(
            new Request(
                "http://localhost/api/work-suggestions?conversationId=507f1f77bcf86cd799439014&status=proposed&page=2&limit=10"
            )
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(listWorkSuggestions).toHaveBeenCalledWith({
            conversationId: "507f1f77bcf86cd799439014",
            organizationId: undefined,
            status: "proposed",
            page: 2,
            limit: 10,
        });
        expect(body).toEqual({
            success: true,
            data: {
                items: [suggestion],
                pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
            },
        });
    });

    it("returns 400 for invalid status and does not list", async () => {
        const response = await listGET(
            new Request(
                "http://localhost/api/work-suggestions?conversationId=507f1f77bcf86cd799439014&status=bogus"
            )
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            error: "Invalid status",
        });
        expect(listWorkSuggestions).not.toHaveBeenCalled();
    });
});

describe("GET /api/work-suggestions/[id]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
        (assertWorkSuggestionAccess as jest.Mock).mockResolvedValue(undefined);
    });

    it("returns 401 without auth", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
        });

        const response = await getByIdGET(
            new Request("http://localhost/api/work-suggestions/507f1f77bcf86cd799439012"),
            { params: Promise.resolve({ id: suggestion._id }) }
        );
        expect(response.status).toBe(401);
    });

    it("returns 404 when missing", async () => {
        (getWorkSuggestion as jest.Mock).mockResolvedValue(null);

        const response = await getByIdGET(
            new Request("http://localhost/api/work-suggestions/507f1f77bcf86cd799439012"),
            { params: Promise.resolve({ id: suggestion._id }) }
        );
        expect(response.status).toBe(404);
    });

    it("returns 404 for unauthorized get (same body as missing)", async () => {
        (getWorkSuggestion as jest.Mock).mockResolvedValue(suggestion);
        (assertWorkSuggestionAccess as jest.Mock).mockRejectedValue(
            new MockAuthorizationError("FORBIDDEN", "Forbidden")
        );

        const response = await getByIdGET(
            new Request("http://localhost/api/work-suggestions/507f1f77bcf86cd799439012"),
            { params: Promise.resolve({ id: suggestion._id }) }
        );
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            success: false,
            error: "Work suggestion not found",
        });
    });

    it("returns { success, data } get contract", async () => {
        (getWorkSuggestion as jest.Mock).mockResolvedValue(suggestion);

        const response = await getByIdGET(
            new Request("http://localhost/api/work-suggestions/507f1f77bcf86cd799439012"),
            { params: Promise.resolve({ id: suggestion._id }) }
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            data: suggestion,
        });
    });
});
