import mongoose, { Model, Schema } from "mongoose";

/**
 * Thin idempotency store for product notifications (no inbox UI).
 * Keys expire after 8 days so overdue day-keys and hourly blocked keys recycle.
 */
export interface INotifyDedupe {
    _id: mongoose.Types.ObjectId;
    key: string;
    createdAt: Date;
}

const NotifyDedupeSchema = new Schema<INotifyDedupe>(
    {
        key: { type: String, required: true, unique: true, maxlength: 240 },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
    }
);

NotifyDedupeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 8 });

const NotifyDedupeModel: Model<INotifyDedupe> =
    (mongoose.models.NotifyDedupe as Model<INotifyDedupe>)
    || mongoose.model<INotifyDedupe>("NotifyDedupe", NotifyDedupeSchema);

export default NotifyDedupeModel;
