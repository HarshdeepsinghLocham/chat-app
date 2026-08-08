import mongoose from "mongoose";
import WorkSuggestionModel, {
    WORK_SUGGESTION_STATUSES,
} from "../models/WorkSuggestion";

function buildValidDoc(overrides: Record<string, unknown> = {}) {
    return new WorkSuggestionModel({
        messageId: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(),
        title: "Follow up with the team",
        confidence: 0.85,
        extractorVersion: "intelligent-v6-message-intent",
        ...overrides,
    });
}

describe("WorkSuggestion model", () => {
    describe("status values", () => {
        it("exposes the Phase 1 lifecycle statuses", () => {
            expect([...WORK_SUGGESTION_STATUSES]).toEqual([
                "proposed",
                "accepted",
                "dismissed",
                "converted",
            ]);
        });

        it("defaults status to proposed", () => {
            const doc = buildValidDoc();
            expect(doc.status).toBe("proposed");
            expect(doc.validateSync()).toBeUndefined();
        });

        it("rejects invalid status", () => {
            const doc = buildValidDoc({ status: "pending" });
            const error = doc.validateSync();
            expect(error).toBeDefined();
            expect(error?.errors.status).toBeDefined();
        });

        it.each([...WORK_SUGGESTION_STATUSES])("accepts status %s", (status) => {
            const doc = buildValidDoc({ status });
            expect(doc.validateSync()).toBeUndefined();
        });
    });

    describe("required fields", () => {
        it("accepts a minimal valid document", () => {
            const doc = buildValidDoc();
            expect(doc.validateSync()).toBeUndefined();
            expect(doc.organizationId).toBeNull();
            expect(doc.intentId).toBeNull();
            expect(doc.dismissReason).toBeNull();
            expect(doc.convertedTaskId).toBeNull();
            expect(doc.summary).toBe("");
            expect(doc.candidates.priorityCandidate).toBe("");
            expect(doc.candidates.assigneeCandidates).toEqual([]);
        });

        it("requires messageId", () => {
            const doc = buildValidDoc({ messageId: undefined });
            const error = doc.validateSync();
            expect(error?.errors.messageId).toBeDefined();
        });

        it("requires conversationId", () => {
            const doc = buildValidDoc({ conversationId: undefined });
            const error = doc.validateSync();
            expect(error?.errors.conversationId).toBeDefined();
        });

        it("requires title", () => {
            const doc = buildValidDoc({ title: undefined });
            const error = doc.validateSync();
            expect(error?.errors.title).toBeDefined();
        });

        it("rejects title shorter than 3 characters", () => {
            const doc = buildValidDoc({ title: "ab" });
            const error = doc.validateSync();
            expect(error?.errors.title).toBeDefined();
        });

        it("requires confidence", () => {
            const doc = buildValidDoc({ confidence: undefined });
            const error = doc.validateSync();
            expect(error?.errors.confidence).toBeDefined();
        });

        it("rejects confidence outside 0..1", () => {
            const high = buildValidDoc({ confidence: 1.5 });
            expect(high.validateSync()?.errors.confidence).toBeDefined();
            const low = buildValidDoc({ confidence: -0.1 });
            expect(low.validateSync()?.errors.confidence).toBeDefined();
        });

        it("requires extractorVersion", () => {
            const doc = buildValidDoc({ extractorVersion: undefined });
            const error = doc.validateSync();
            expect(error?.errors.extractorVersion).toBeDefined();
        });
    });

    describe("indexes and idempotency", () => {
        const indexes = WorkSuggestionModel.schema.indexes();

        function findIndex(name: string) {
            return indexes.find((entry) => {
                const options = entry[1] as { name?: string };
                return options?.name === name;
            });
        }

        it("indexes organizationId + status + createdAt", () => {
            const entry = findIndex("idx_work_suggestion_org_status_created");
            expect(entry).toBeDefined();
            expect(entry?.[0]).toEqual({
                organizationId: 1,
                status: 1,
                createdAt: -1,
            });
        });

        it("indexes conversationId + status + createdAt", () => {
            const entry = findIndex("idx_work_suggestion_conversation_status_created");
            expect(entry).toBeDefined();
            expect(entry?.[0]).toEqual({
                conversationId: 1,
                status: 1,
                createdAt: -1,
            });
        });

        it("partial-unique on messageId while proposed (idempotent active suggestion)", () => {
            const entry = findIndex("uniq_work_suggestion_message_proposed");
            expect(entry).toBeDefined();
            expect(entry?.[0]).toEqual({ messageId: 1 });
            const options = entry?.[1] as {
                unique?: boolean;
                partialFilterExpression?: { status?: string };
            };
            expect(options.unique).toBe(true);
            expect(options.partialFilterExpression).toEqual({ status: "proposed" });
        });

        it("indexes assigneeCandidates + status", () => {
            const entry = findIndex("idx_work_suggestion_assignee_status");
            expect(entry).toBeDefined();
            expect(entry?.[0]).toEqual({
                "candidates.assigneeCandidates": 1,
                status: 1,
            });
        });

        it("keeps a non-unique messageId field index for history lookups", () => {
            const messageIdPath = WorkSuggestionModel.schema.path("messageId");
            expect(messageIdPath?.options?.index).toBe(true);
            expect(messageIdPath?.options?.unique).not.toBe(true);
        });
    });
});
