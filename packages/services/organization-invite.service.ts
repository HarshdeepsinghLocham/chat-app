import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { OrganizationMemberRole } from "@semantask/db/models/OrganizationMembership";
import { connectToDatabase } from "@semantask/db";
import OrganizationInvitationModel, {
    type OrganizationInvitationStatus,
} from "@semantask/db/models/OrganizationInvitation";
import OrganizationMembershipModel from "@semantask/db/models/OrganizationMembership";
import OrganizationModel from "@semantask/db/models/Organization";
import { User } from "@semantask/db/models/User";
import { AuthorizationError } from "./authorization-errors";
import { ConflictError, ValidationError } from "./organization-errors";
import {
    assertCanManageMembers,
    assertOrganizationActive,
    assertMembership,
} from "./organization.service";
import { assertMemberQuotaAvailable } from "./organization-quota.service";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const INVITE_ROLES: OrganizationMemberRole[] = ["admin", "member"];

export type OrganizationInvitationRecord = {
    id: string;
    organizationId: string;
    organizationName: string;
    email: string;
    role: OrganizationMemberRole;
    status: OrganizationInvitationStatus;
    token: string;
    invitedBy: string;
    expiresAt: string;
    createdAt: string;
    acceptedAt: string | null;
};

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type InvitationLean = {
    _id: Types.ObjectId;
    organizationId: Types.ObjectId;
    email: string;
    role: OrganizationMemberRole;
    token: string;
    status: OrganizationInvitationStatus;
    invitedBy: Types.ObjectId;
    expiresAt: Date;
    createdAt: Date;
    acceptedAt?: Date | null;
};

function serializeInvitation(
    doc: InvitationLean,
    organizationName: string
): OrganizationInvitationRecord {
    return {
        id: doc._id.toString(),
        organizationId: doc.organizationId.toString(),
        organizationName,
        email: doc.email,
        role: doc.role,
        status: doc.status,
        token: doc.token,
        invitedBy: doc.invitedBy.toString(),
        expiresAt: doc.expiresAt.toISOString(),
        createdAt: doc.createdAt.toISOString(),
        acceptedAt: doc.acceptedAt ? doc.acceptedAt.toISOString() : null,
    };
}

async function getOrganizationName(organizationId: string): Promise<string> {
    const org = await OrganizationModel.findById(organizationId)
        .select({ name: 1 })
        .lean<{ name: string } | null>();
    return org?.name ?? "Organization";
}

export async function createOrganizationInvitation(input: {
    organizationId: string;
    actorUserId: string;
    email: string;
    role?: OrganizationMemberRole;
}): Promise<OrganizationInvitationRecord> {
    await assertCanManageMembers(input.organizationId, input.actorUserId);
    await assertOrganizationActive(input.organizationId);
    await assertMemberQuotaAvailable(input.organizationId);

    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
        throw new ValidationError("Valid email is required");
    }

    const role = input.role ?? "member";
    if (!INVITE_ROLES.includes(role)) {
        throw new ValidationError("Invite role must be admin or member");
    }

    await connectToDatabase();

    const existingUser = await User.findOne({ email })
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>();
    if (existingUser) {
        const alreadyMember = await OrganizationMembershipModel.findOne({
            organizationId: new Types.ObjectId(input.organizationId),
            userId: existingUser._id,
        }).lean();
        if (alreadyMember) {
            throw new ConflictError("User is already a member of this organization");
        }
    }

    const pending = await OrganizationInvitationModel.findOne({
        organizationId: new Types.ObjectId(input.organizationId),
        email,
        status: "pending",
        expiresAt: { $gt: new Date() },
    });
    if (pending) {
        throw new ConflictError("A pending invitation already exists for this email");
    }

    const token = randomBytes(24).toString("hex");
    const doc = await OrganizationInvitationModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        email,
        role,
        token,
        status: "pending",
        invitedBy: new Types.ObjectId(input.actorUserId),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    const organizationName = await getOrganizationName(input.organizationId);
    return serializeInvitation(doc.toObject() as InvitationLean, organizationName);
}

export async function listOrganizationInvitations(
    organizationId: string,
    actorUserId: string
): Promise<OrganizationInvitationRecord[]> {
    await assertMembership(organizationId, actorUserId);
    await connectToDatabase();

    const now = new Date();
    await OrganizationInvitationModel.updateMany(
        {
            organizationId: new Types.ObjectId(organizationId),
            status: "pending",
            expiresAt: { $lte: now },
        },
        { $set: { status: "expired" } }
    );

    const rows = await OrganizationInvitationModel.find({
        organizationId: new Types.ObjectId(organizationId),
        status: { $in: ["pending", "accepted"] },
    })
        .sort({ createdAt: -1 })
        .lean<InvitationLean[]>();

    const organizationName = await getOrganizationName(organizationId);
    return rows.map((row) => serializeInvitation(row, organizationName));
}

export async function revokeOrganizationInvitation(input: {
    organizationId: string;
    actorUserId: string;
    invitationId: string;
}): Promise<void> {
    await assertCanManageMembers(input.organizationId, input.actorUserId);
    if (!isValidObjectId(input.invitationId)) {
        throw new ValidationError("Invalid invitation id");
    }

    await connectToDatabase();
    const invite = await OrganizationInvitationModel.findOne({
        _id: new Types.ObjectId(input.invitationId),
        organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!invite) {
        throw new AuthorizationError("NOT_FOUND", "Invitation not found");
    }
    if (invite.status !== "pending") {
        throw new ValidationError("Only pending invitations can be revoked");
    }
    invite.status = "revoked";
    await invite.save();
}

export async function getOrganizationInvitationByToken(
    token: string
): Promise<OrganizationInvitationRecord | null> {
    const trimmed = token.trim();
    if (!trimmed) return null;

    await connectToDatabase();
    const invite = await OrganizationInvitationModel.findOne({ token: trimmed }).lean<
        InvitationLean | null
    >();
    if (!invite) return null;

    if (invite.status === "pending" && invite.expiresAt.getTime() <= Date.now()) {
        await OrganizationInvitationModel.updateOne(
            { _id: invite._id },
            { $set: { status: "expired" } }
        );
        return serializeInvitation(
            { ...invite, status: "expired" },
            await getOrganizationName(invite.organizationId.toString())
        );
    }

    return serializeInvitation(
        invite,
        await getOrganizationName(invite.organizationId.toString())
    );
}

export async function acceptOrganizationInvitation(input: {
    token: string;
    userId: string;
    userEmail: string;
}): Promise<{
    invitation: OrganizationInvitationRecord;
    organizationId: string;
}> {
    const email = normalizeEmail(input.userEmail);
    if (!email) {
        throw new ValidationError("Authenticated user email is required");
    }
    if (!isValidObjectId(input.userId)) {
        throw new ValidationError("Invalid user");
    }

    await connectToDatabase();
    const invite = await OrganizationInvitationModel.findOne({ token: input.token.trim() });
    if (!invite) {
        throw new AuthorizationError("NOT_FOUND", "Invitation not found");
    }

    if (invite.status === "accepted") {
        const organizationName = await getOrganizationName(invite.organizationId.toString());
        return {
            invitation: serializeInvitation(
                invite.toObject() as InvitationLean,
                organizationName
            ),
            organizationId: invite.organizationId.toString(),
        };
    }

    if (invite.status === "revoked") {
        throw new ValidationError("This invitation was revoked");
    }

    if (invite.status === "expired" || invite.expiresAt.getTime() <= Date.now()) {
        invite.status = "expired";
        await invite.save();
        throw new ValidationError("This invitation has expired");
    }

    if (invite.status !== "pending") {
        throw new ValidationError("Invitation is not available");
    }

    if (normalizeEmail(invite.email) !== email) {
        throw new AuthorizationError(
            "FORBIDDEN",
            "Sign in with the invited email address to accept this invitation"
        );
    }

    await assertOrganizationActive(invite.organizationId.toString());
    await assertMemberQuotaAvailable(invite.organizationId.toString());

    const existing = await OrganizationMembershipModel.findOne({
        organizationId: invite.organizationId,
        userId: new Types.ObjectId(input.userId),
    });

    if (!existing) {
        await OrganizationMembershipModel.create({
            organizationId: invite.organizationId,
            userId: new Types.ObjectId(input.userId),
            role: invite.role,
        });
    }

    invite.status = "accepted";
    invite.acceptedAt = new Date();
    invite.acceptedByUserId = new Types.ObjectId(input.userId);
    await invite.save();

    const organizationName = await getOrganizationName(invite.organizationId.toString());
    return {
        invitation: serializeInvitation(
            invite.toObject() as InvitationLean,
            organizationName
        ),
        organizationId: invite.organizationId.toString(),
    };
}
