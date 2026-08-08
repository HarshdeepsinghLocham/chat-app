import mongoose from "mongoose";
import type {
    TaskPriority,
    WorkSuggestionCandidates,
    WorkSuggestionRecord,
    WorkSuggestionStatus,
} from "@semantask/types";
import { connectToDatabase } from "@semantask/db";
import WorkSuggestionModel, {
    type IWorkSuggestion,
    WORK_SUGGESTION_STATUSES,
} from "@semantask/db/models/WorkSuggestion";
import { ValidationError } from "./organization-errors";

function isSuggestionStatus(value: unknown): value is WorkSuggestionStatus {
    return typeof value === "string"
        && (WORK_SUGGESTION_STATUSES as readonly string[]).includes(value);
}

export type CreateWorkSuggestionInput = {
    messageId: string;
    conversationId: string;
    organizationId?: string | null;
    intentId?: string | null;
    status?: WorkSuggestionStatus;
    title: string;
    summary?: string;
    confidence: number;
    candidates?: Partial<WorkSuggestionCandidates>;
    extractorVersion: string;
};

export type ListWorkSuggestionsInput = {
    conversationId?: string;
    organizationId?: string;
    status?: WorkSuggestionStatus;
    page?: number;
    limit?: number;
};

export type WorkSuggestionListResult = {
    items: WorkSuggestionRecord[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && mongoose.Types.ObjectId.isValid(value));
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export function normalizeWorkSuggestion(doc: IWorkSuggestion): WorkSuggestionRecord {
    return {
        _id: doc._id.toString(),
        messageId: doc.messageId.toString(),
        conversationId: doc.conversationId.toString(),
        organizationId: doc.organizationId ? doc.organizationId.toString() : null,
        intentId: doc.intentId ? doc.intentId.toString() : null,
        status: doc.status,
        title: doc.title,
        summary: doc.summary ?? "",
        confidence: doc.confidence,
        candidates: {
            assigneeCandidates: (doc.candidates?.assigneeCandidates ?? []).map((id) => id.toString()),
            dueAtCandidate: doc.candidates?.dueAtCandidate
                ? new Date(doc.candidates.dueAtCandidate).toISOString()
                : null,
            priorityCandidate: (doc.candidates?.priorityCandidate ?? "") as TaskPriority | "",
        },
        dismissReason: doc.dismissReason ?? null,
        convertedTaskId: doc.convertedTaskId ? doc.convertedTaskId.toString() : null,
        extractorVersion: doc.extractorVersion,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    };
}

async function findProposedByMessageId(messageId: string): Promise<IWorkSuggestion | null> {
    return WorkSuggestionModel.findOne({
        messageId: new mongoose.Types.ObjectId(messageId),
        status: "proposed",
    }).exec();
}

export async function createWorkSuggestion(
    input: CreateWorkSuggestionInput
): Promise<WorkSuggestionRecord> {
    await connectToDatabase();

    if (!isValidObjectId(input.messageId) || !isValidObjectId(input.conversationId)) {
        throw new ValidationError("Invalid messageId or conversationId");
    }

    if (!input.title || input.title.trim().length < 3) {
        throw new ValidationError("title must be at least 3 characters");
    }

    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
        throw new ValidationError("confidence must be between 0 and 1");
    }

    if (!input.extractorVersion?.trim()) {
        throw new ValidationError("extractorVersion is required");
    }

    const status: WorkSuggestionStatus = input.status ?? "proposed";
    if (!isSuggestionStatus(status)) {
        throw new ValidationError("Invalid status");
    }

    if (status === "proposed") {
        const existing = await findProposedByMessageId(input.messageId);
        if (existing) {
            return normalizeWorkSuggestion(existing);
        }
    }

    const assigneeCandidates = (input.candidates?.assigneeCandidates ?? [])
        .filter((id) => isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    try {
        const doc = await WorkSuggestionModel.create({
            messageId: new mongoose.Types.ObjectId(input.messageId),
            conversationId: new mongoose.Types.ObjectId(input.conversationId),
            organizationId: isValidObjectId(input.organizationId)
                ? new mongoose.Types.ObjectId(input.organizationId)
                : null,
            intentId: isValidObjectId(input.intentId)
                ? new mongoose.Types.ObjectId(input.intentId)
                : null,
            status,
            title: input.title.trim().slice(0, 200),
            summary: (input.summary ?? "").slice(0, 4000),
            confidence: Math.max(0, Math.min(1, input.confidence)),
            candidates: {
                assigneeCandidates,
                dueAtCandidate: input.candidates?.dueAtCandidate
                    ? new Date(input.candidates.dueAtCandidate)
                    : null,
                priorityCandidate: input.candidates?.priorityCandidate ?? "",
            },
            extractorVersion: input.extractorVersion.trim().slice(0, 64),
        });

        console.info(JSON.stringify({
            event: "suggestion.created",
            suggestionId: doc._id.toString(),
            messageId: input.messageId,
            conversationId: input.conversationId,
            organizationId: input.organizationId ?? null,
            status: doc.status,
            confidence: doc.confidence,
            extractorVersion: doc.extractorVersion,
        }));

        return normalizeWorkSuggestion(doc);
    } catch (error) {
        if (status === "proposed" && isDuplicateKeyError(error)) {
            const raced = await findProposedByMessageId(input.messageId);
            if (raced) {
                return normalizeWorkSuggestion(raced);
            }
        }
        throw error;
    }
}

export async function getWorkSuggestion(id: string): Promise<WorkSuggestionRecord | null> {
    if (!isValidObjectId(id)) {
        return null;
    }

    await connectToDatabase();

    const doc = await WorkSuggestionModel.findById(id).exec();
    if (!doc) {
        return null;
    }

    return normalizeWorkSuggestion(doc);
}

export async function listWorkSuggestions(
    input: ListWorkSuggestionsInput
): Promise<WorkSuggestionListResult> {
    await connectToDatabase();

    const conversationId = input.conversationId?.trim() || undefined;
    const organizationId = input.organizationId?.trim() || undefined;

    if (!conversationId && !organizationId) {
        throw new ValidationError("conversationId or organizationId is required");
    }

    if (conversationId && !isValidObjectId(conversationId)) {
        throw new ValidationError("Invalid conversationId");
    }

    if (organizationId && !isValidObjectId(organizationId)) {
        throw new ValidationError("Invalid organizationId");
    }

    if (input.status != null && !isSuggestionStatus(input.status)) {
        throw new ValidationError("Invalid status");
    }

    const page = Number.isFinite(input.page) ? Math.max(1, Number(input.page)) : 1;
    const limit = Number.isFinite(input.limit)
        ? Math.min(100, Math.max(1, Number(input.limit)))
        : 20;

    const query: Record<string, unknown> = {};
    if (conversationId) {
        query.conversationId = new mongoose.Types.ObjectId(conversationId);
    }
    if (organizationId) {
        query.organizationId = new mongoose.Types.ObjectId(organizationId);
    }
    if (input.status) {
        query.status = input.status;
    }

    const [total, rows] = await Promise.all([
        WorkSuggestionModel.countDocuments(query),
        WorkSuggestionModel.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec(),
    ]);

    return {
        items: rows.map((row) => normalizeWorkSuggestion(row)),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

export { WORK_SUGGESTION_STATUSES };
