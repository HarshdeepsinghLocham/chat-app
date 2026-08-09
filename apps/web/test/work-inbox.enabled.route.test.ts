import { NextResponse } from "next/server";

jest.mock("@/lib/utils/auth/requireAuthUser", () => ({
    requireAuthUser: jest.fn(),
}));

jest.mock("@semantask/services/organization-policy.service", () => ({
    isWorkInboxUiEnabled: jest.fn(),
}));

import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { isWorkInboxUiEnabled } from "@semantask/services/organization-policy.service";
import { GET } from "../app/api/work-inbox/enabled/route";

const user = {
    id: "507f1f77bcf86cd799439011",
    role: "user" as const,
};

describe("GET /api/work-inbox/enabled", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuthUser as jest.Mock).mockResolvedValue({ user, response: null });
    });

    it("returns 401 without auth", async () => {
        (requireAuthUser as jest.Mock).mockResolvedValue({
            user: null,
            response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
        });

        const response = await GET();
        expect(response.status).toBe(401);
    });

    it("returns enabled=false when flag is off", async () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(false);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            data: { enabled: false },
        });
    });

    it("returns enabled=true when flag is on", async () => {
        (isWorkInboxUiEnabled as jest.Mock).mockReturnValue(true);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            success: true,
            data: { enabled: true },
        });
    });
});
