import mongoose, { model, Model, Schema, Types } from "mongoose";

export type AuthEventType =
    | "login_success"
    | "login_failed"
    | "register_success"
    | "register_failed"
    | "refresh_success"
    | "refresh_failed"
    // Historical only: emitted by a removed step-up flow. Kept so existing audit rows deserialize.
    | "step_up_triggered"
    | "step_up_success"
    | "step_up_failed"
    | "logout_success"
    | "logout_failed"
    | "logout_all_devices_success"
    | "logout_all_devices_failed"
    | "google_oauth_success"
    | "google_oauth_failed"
    | "password_changed"
    | "password_change_failed"
    | "tokens_revoked"
    | "tokens_revoked_failed";

export interface IAuthEvent extends mongoose.Document {
    _id: Types.ObjectId;
    eventType: AuthEventType;
    outcome: "success" | "failure";
    userId?: Types.ObjectId;
    email?: string;
    ipAddress: string;
    userAgent: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const authEventSchema = new Schema<IAuthEvent>(
    {
        eventType: {
            type: String,
            required: true,
            enum: [
                "login_success",
                "login_failed",
                "register_success",
                "register_failed",
                "refresh_success",
                "refresh_failed",
                "step_up_triggered",
                "step_up_success",
                "step_up_failed",
                "logout_success",
                "logout_failed",
                "logout_all_devices_success",
                "logout_all_devices_failed",
                "google_oauth_success",
                "google_oauth_failed",
                "password_changed",
                "password_change_failed",
                "tokens_revoked",
                "tokens_revoked_failed",
            ],
            index: true,
        },
        outcome: {
            type: String,
            required: true,
            enum: ["success", "failure"],
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },
        email: { type: String, required: false, index: true },
        ipAddress: { type: String, required: true, default: "unknown", index: true },
        userAgent: { type: String, required: true, default: "Unknown" },
        reason: { type: String, required: false },
        metadata: { type: Schema.Types.Mixed, required: false },
    },
    { timestamps: true }
);

authEventSchema.index({ createdAt: -1 });
authEventSchema.index({ eventType: 1, createdAt: -1 });
authEventSchema.index({ userId: 1, createdAt: -1 });

export const AuthEventModel: Model<IAuthEvent> =
    (mongoose.models.AuthEvent as Model<IAuthEvent>) ||
    model<IAuthEvent>("AuthEvent", authEventSchema);
