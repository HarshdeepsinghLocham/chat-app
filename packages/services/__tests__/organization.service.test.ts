jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const membershipFindOne = jest.fn();
const membershipDeleteOne = jest.fn();
const membershipCountDocuments = jest.fn();

jest.mock("@semantask/db/models/Organization", () => ({
    __esModule: true,
    default: {},
}));

jest.mock("@semantask/db/models/OrganizationMembership", () => ({
    __esModule: true,
    default: {
        findOne: (...args: unknown[]) => membershipFindOne(...args),
        deleteOne: (...args: unknown[]) => membershipDeleteOne(...args),
        countDocuments: (...args: unknown[]) => membershipCountDocuments(...args),
    },
    ORGANIZATION_MEMBER_ROLES: ["owner", "admin", "member"],
}));

jest.mock("../user-ref.service", () => ({
    resolveUserRefs: jest.fn(async () => new Map()),
    userRefOrFallback: (userId: string) => ({ id: userId, username: "Unknown user" }),
}));

import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "@jest/globals";
import {
    assertUsersAreOrgMembers,
    canManageMembers,
    leaveOrganization,
    updateOrganizationMemberRole,
} from "../organization.service";
import { ValidationError } from "../organization-errors";
import { AuthorizationError } from "../authorization-errors";

describe("organization.service helpers", () => {
    beforeEach(() => {
        membershipFindOne.mockReset();
        membershipDeleteOne.mockReset();
        membershipCountDocuments.mockReset();
    });

    it("allows owners and admins to manage members", () => {
        expect(canManageMembers("owner")).toBe(true);
        expect(canManageMembers("admin")).toBe(true);
        expect(canManageMembers("member")).toBe(false);
    });

    it("blocks the sole owner from leaving", async () => {
        membershipFindOne.mockReturnValue({
            lean: jest.fn(async () => ({
                _id: new Types.ObjectId(),
                role: "owner",
            })),
        });

        await expect(
            leaveOrganization({
                organizationId: new Types.ObjectId().toString(),
                actorUserId: new Types.ObjectId().toString(),
            })
        ).rejects.toBeInstanceOf(ValidationError);
        expect(membershipDeleteOne).not.toHaveBeenCalled();
    });

    it("lets a member leave", async () => {
        const membershipId = new Types.ObjectId();
        membershipFindOne.mockReturnValue({
            lean: jest.fn(async () => ({
                _id: membershipId,
                role: "member",
            })),
        });
        membershipDeleteOne.mockResolvedValue({ deletedCount: 1 });

        await leaveOrganization({
            organizationId: new Types.ObjectId().toString(),
            actorUserId: new Types.ObjectId().toString(),
        });
        expect(membershipDeleteOne).toHaveBeenCalledWith({ _id: membershipId });
    });

    it("updates a member role and rejects owner changes", async () => {
        const save = jest.fn(async () => undefined);
        membershipFindOne
            .mockReturnValueOnce({
                lean: jest.fn(async () => ({ role: "admin" })),
            })
            .mockResolvedValueOnce({
                role: "member",
                save,
                toObject: () => ({ role: "admin" }),
            });

        await updateOrganizationMemberRole({
            organizationId: new Types.ObjectId().toString(),
            actorUserId: new Types.ObjectId().toString(),
            userId: new Types.ObjectId().toString(),
            role: "admin",
        });
        expect(save).toHaveBeenCalled();

        membershipFindOne.mockReset();
        membershipFindOne
            .mockReturnValueOnce({
                lean: jest.fn(async () => ({ role: "owner" })),
            })
            .mockResolvedValueOnce({
                role: "owner",
                save,
            });

        await expect(
            updateOrganizationMemberRole({
                organizationId: new Types.ObjectId().toString(),
                actorUserId: new Types.ObjectId().toString(),
                userId: new Types.ObjectId().toString(),
                role: "admin",
            })
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects assignees who are not org members", async () => {
        membershipCountDocuments.mockResolvedValue(0);

        await expect(
            assertUsersAreOrgMembers(new Types.ObjectId().toString(), [
                new Types.ObjectId().toString(),
            ])
        ).rejects.toBeInstanceOf(AuthorizationError);
    });
});
