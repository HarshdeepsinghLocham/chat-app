import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn(async () => undefined),
}));

const inviteCreate = jest.fn<any>();
const inviteFindOne = jest.fn<any>();
const inviteFind = jest.fn<any>();
const inviteUpdateMany = jest.fn<any>();
const inviteUpdateOne = jest.fn<any>();

jest.mock("@semantask/db/models/OrganizationInvitation", () => ({
    __esModule: true,
    default: {
        create: (...args: unknown[]) => inviteCreate(...args),
        findOne: (...args: unknown[]) => inviteFindOne(...args),
        find: (...args: unknown[]) => inviteFind(...args),
        updateMany: (...args: unknown[]) => inviteUpdateMany(...args),
        updateOne: (...args: unknown[]) => inviteUpdateOne(...args),
    },
}));

jest.mock("@semantask/db/models/Organization", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(() => ({
            select: () => ({
                lean: jest.fn(async () => ({ name: "Acme" })),
            }),
        })),
    },
}));

jest.mock("@semantask/db/models/OrganizationMembership", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(async () => null),
        create: jest.fn(async (doc: unknown) => doc),
    },
}));

jest.mock("@semantask/db/models/User", () => ({
    User: {
        findOne: jest.fn(() => ({
            select: () => ({
                lean: jest.fn(async () => null),
            }),
        })),
    },
}));

jest.mock("../organization.service", () => ({
    assertCanManageMembers: jest.fn(async () => undefined),
    assertOrganizationActive: jest.fn(async () => undefined),
    assertMembership: jest.fn(async () => undefined),
}));

jest.mock("../organization-quota.service", () => ({
    assertMemberQuotaAvailable: jest.fn(async () => undefined),
}));

import {
    createOrganizationInvitation,
    resendOrganizationInvitation,
} from "../organization-invite.service";
import { ValidationError } from "../organization-errors";

describe("organization-invite.service", () => {
    beforeEach(() => {
        inviteCreate.mockReset();
        inviteFindOne.mockReset();
        inviteFind.mockReset();
        inviteUpdateMany.mockReset();
        inviteUpdateOne.mockReset();
        inviteFindOne.mockResolvedValue(null);
        inviteCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
            toObject: () => ({
                _id: new Types.ObjectId(),
                ...doc,
                createdAt: new Date("2026-08-25T10:00:00.000Z"),
                acceptedAt: null,
            }),
        }));
    });

    it("creates a pending invitation for a valid email", async () => {
        const result = await createOrganizationInvitation({
            organizationId: new Types.ObjectId().toString(),
            actorUserId: new Types.ObjectId().toString(),
            email: " teammate@acme.com ",
        });

        expect(result.email).toBe("teammate@acme.com");
        expect(result.organizationName).toBe("Acme");
        expect(result.status).toBe("pending");
        expect(result.token).toHaveLength(48);
        expect(inviteCreate).toHaveBeenCalled();
    });

    it("creates an admin invitation when role is admin", async () => {
        const result = await createOrganizationInvitation({
            organizationId: new Types.ObjectId().toString(),
            actorUserId: new Types.ObjectId().toString(),
            email: "lead@acme.com",
            role: "admin",
        });
        expect(result.role).toBe("admin");
    });

    it("resends a pending invitation by rotating the token", async () => {
        const inviteId = new Types.ObjectId();
        const orgId = new Types.ObjectId();
        const saved: Record<string, unknown> = {
            _id: inviteId,
            organizationId: orgId,
            email: "teammate@acme.com",
            role: "member",
            token: "old-token-old-token-old-token-old-token",
            status: "pending",
            invitedBy: new Types.ObjectId(),
            expiresAt: new Date("2026-08-27T00:00:00.000Z"),
            createdAt: new Date("2026-08-25T10:00:00.000Z"),
            acceptedAt: null,
        };
        inviteFindOne.mockResolvedValue({
            ...saved,
            save: jest.fn(async function save(this: { token: string; expiresAt: Date }) {
                saved.token = this.token;
                saved.expiresAt = this.expiresAt;
            }),
            toObject: () => saved,
        });

        const result = await resendOrganizationInvitation({
            organizationId: orgId.toString(),
            actorUserId: new Types.ObjectId().toString(),
            invitationId: inviteId.toString(),
        });

        expect(result.token).toHaveLength(48);
        expect(result.token).not.toBe("old-token-old-token-old-token-old-token");
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("rejects invalid email", async () => {
        await expect(
            createOrganizationInvitation({
                organizationId: new Types.ObjectId().toString(),
                actorUserId: new Types.ObjectId().toString(),
                email: "not-an-email",
            })
        ).rejects.toBeInstanceOf(ValidationError);
    });
});
