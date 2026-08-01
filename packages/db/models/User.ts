import mongoose, { Schema, model, Document, Types, Model } from "mongoose";


export interface IUser extends Document {
    _id: mongoose.Types.ObjectId
    username: string;
    email: string;
    password?: string;
    googleSub?: string;
    authProviders: Array<'password' | 'google'>;
    isOnline: boolean;
    profilePicture?: string;
    role: 'user' | 'moderator' | 'admin';
    status: 'active' | 'banned';
    isBanned: boolean;
    isDeleted: boolean;
    lastSeen: Date;
    isVerified: Date;
    twoFactorEnabled: boolean;
    twoFactorSecret: string;
    tokenVersion: number;
    mustChangePassword: boolean;
    conversations: Types.ObjectId[];
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: false }, // Optional for OAuth users
    googleSub: { type: String, required: false, index: true },
    authProviders: {
        type: [String],
        enum: ['password', 'google'],
        default: ['password'],
    },
    profilePicture: { type: String },
    isOnline: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    isBanned: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
    lastSeen: { type: Date, default: Date.now },
    isVerified: { type: Date },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    tokenVersion: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: false },
    conversations: [{ type: Schema.Types.ObjectId, ref: 'Conversation' }],
},
    { timestamps: true },
);

// Primary account identity stays unique by normalized email.
userSchema.index({ email: 1 }, { unique: true, name: "uniq_user_email" });

// Ensure one Google subject can only map to one account.
userSchema.index(
    { googleSub: 1 },
    {
        unique: true,
        partialFilterExpression: {
            googleSub: { $type: "string", $gt: "" },
        },
        name: "uniq_user_google_sub",
    }
);

export const User: Model<IUser> =
    (mongoose.models.User as Model<IUser>) || model<IUser>("User", userSchema);