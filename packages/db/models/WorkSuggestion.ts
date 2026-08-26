import mongoose, { Model, Schema } from "mongoose";

/** Mirrors `@semantask/types` WorkSuggestionStatus — kept local so `@semantask/db` stays types-free. */
export const WORK_SUGGESTION_STATUSES = [
    "proposed",
    "accepted",
    "dismissed",
    "converted",
] as const;

export type WorkSuggestionStatus = (typeof WORK_SUGGESTION_STATUSES)[number];

export interface IWorkSuggestion {
    _id: mongoose.Types.ObjectId;
    messageId: mongoose.Types.ObjectId;
    conversationId: mongoose.Types.ObjectId;
    /** Null / missing = personal workspace. */
    organizationId?: mongoose.Types.ObjectId | null;
    /** Optional FK to MessageIntent facts row. */
    intentId?: mongoose.Types.ObjectId | null;
    status: WorkSuggestionStatus;
    title: string;
    summary: string;
    confidence: number;
    candidates: {
        assigneeCandidates: mongoose.Types.ObjectId[];
        dueAtCandidate?: Date | null;
        priorityCandidate: "low" | "medium" | "high" | "urgent" | "";
    };
    requestedOutcome?: string | null;
    suggestedTool?: "create_github_issue" | "schedule_meeting" | "send_email" | null;
    executionPolicy?: "approval_required" | "auto_execute_allowed" | "prohibited" | null;
    confidenceSignals?: Array<"explicit_action" | "recipient_or_object" | "deadline">;
    possibleDuplicateTaskId?: mongoose.Types.ObjectId | null;
    dismissReason?: string | null;
    convertedTaskId?: mongoose.Types.ObjectId | null;
    extractorVersion: string;
    createdAt: Date;
    updatedAt: Date;
}

const WorkSuggestionSchema = new Schema<IWorkSuggestion>(
    {
        messageId: {
            type: Schema.Types.ObjectId,
            ref: "Message",
            required: true,
            index: true,
        },
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
            index: true,
        },
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            default: null,
            index: true,
        },
        intentId: {
            type: Schema.Types.ObjectId,
            ref: "MessageIntent",
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: WORK_SUGGESTION_STATUSES,
            required: true,
            default: "proposed",
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 200,
        },
        summary: {
            type: String,
            trim: true,
            maxlength: 4000,
            default: "",
        },
        requestedOutcome: {
            type: String,
            trim: true,
            maxlength: 4000,
            default: null,
        },
        suggestedTool: {
            type: String,
            enum: ["create_github_issue", "schedule_meeting", "send_email"],
            default: null,
        },
        executionPolicy: {
            type: String,
            enum: ["approval_required", "auto_execute_allowed", "prohibited"],
            default: null,
        },
        confidenceSignals: {
            type: [{ type: String, enum: ["explicit_action", "recipient_or_object", "deadline"] }],
            default: undefined,
        },
        possibleDuplicateTaskId: {
            type: Schema.Types.ObjectId,
            ref: "Task",
            default: null,
            index: true,
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            required: true,
        },
        candidates: {
            assigneeCandidates: [{ type: Schema.Types.ObjectId, ref: "User" }],
            dueAtCandidate: { type: Date, default: null },
            priorityCandidate: {
                type: String,
                enum: ["low", "medium", "high", "urgent", ""],
                default: "",
            },
        },
        dismissReason: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: null,
        },
        convertedTaskId: {
            type: Schema.Types.ObjectId,
            ref: "Task",
            default: null,
            index: true,
        },
        extractorVersion: {
            type: String,
            required: true,
            maxlength: 64,
            index: true,
        },
    },
    {
        timestamps: true,
        strict: true,
        versionKey: false,
    }
);

WorkSuggestionSchema.index(
    { organizationId: 1, status: 1, createdAt: -1 },
    { name: "idx_work_suggestion_org_status_created" }
);

WorkSuggestionSchema.index(
    { conversationId: 1, status: 1, createdAt: -1 },
    { name: "idx_work_suggestion_conversation_status_created" }
);

/** One active proposed suggestion per source message; history rows may share messageId. */
WorkSuggestionSchema.index(
    { messageId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "proposed" },
        name: "uniq_work_suggestion_message_proposed",
    }
);

WorkSuggestionSchema.index(
    { "candidates.assigneeCandidates": 1, status: 1 },
    { name: "idx_work_suggestion_assignee_status" }
);

const WorkSuggestionModel: Model<IWorkSuggestion> =
    (mongoose.models.WorkSuggestion as Model<IWorkSuggestion>)
    || mongoose.model<IWorkSuggestion>("WorkSuggestion", WorkSuggestionSchema);

export default WorkSuggestionModel;
