import mongoose, { Document, Model, Schema, Types } from "mongoose";
import type { OrganizationMemberRole } from "./OrganizationMembership";

export const ORGANIZATION_INVITATION_STATUSES = [
    "pending",
    "accepted",
    "revoked",
    "expired",
] as const;
export type OrganizationInvitationStatus = (typeof ORGANIZATION_INVITATION_STATUSES)[number];

export interface IOrganizationInvitation extends Document {
    _id: Types.ObjectId;
    organizationId: Types.ObjectId;
    email: string;
    role: OrganizationMemberRole;
    token: string;
    status: OrganizationInvitationStatus;
    invitedBy: Types.ObjectId;
    expiresAt: Date;
    acceptedAt?: Date | null;
    acceptedByUserId?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const OrganizationInvitationSchema = new Schema<IOrganizationInvitation>(
    {
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            maxlength: 320,
            index: true,
        },
        role: {
            type: String,
            enum: ["admin", "member"],
            required: true,
            default: "member",
        },
        token: { type: String, required: true, unique: true, index: true },
        status: {
            type: String,
            enum: ORGANIZATION_INVITATION_STATUSES,
            required: true,
            default: "pending",
            index: true,
        },
        invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        expiresAt: { type: Date, required: true, index: true },
        acceptedAt: { type: Date, default: null },
        acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

OrganizationInvitationSchema.index(
    { organizationId: 1, email: 1, status: 1 },
    { name: "idx_org_invite_email_status" }
);

const OrganizationInvitationModel: Model<IOrganizationInvitation> =
    (mongoose.models.OrganizationInvitation as Model<IOrganizationInvitation>)
    || mongoose.model<IOrganizationInvitation>(
        "OrganizationInvitation",
        OrganizationInvitationSchema
    );

export default OrganizationInvitationModel;
