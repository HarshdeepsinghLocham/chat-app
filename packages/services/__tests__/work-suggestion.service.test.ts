import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const findOne = jest.fn() as jest.Mock;
const findById = jest.fn() as jest.Mock;
const create = jest.fn() as jest.Mock;
const countDocuments = jest.fn() as jest.Mock;
const find = jest.fn() as jest.Mock;

jest.mock("@semantask/db/models/WorkSuggestion", () => ({
    __esModule: true,
    default: {
        findOne: (...args: unknown[]) => findOne(...args),
        findById: (...args: unknown[]) => findById(...args),
        create: (...args: unknown[]) => create(...args),
        countDocuments: (...args: unknown[]) => countDocuments(...args),
        find: (...args: unknown[]) => find(...args),
    },
    WORK_SUGGESTION_STATUSES: ["proposed", "accepted", "dismissed", "converted"],
}));

import {
    createWorkSuggestion,
    getWorkSuggestion,
    listWorkSuggestions,
    normalizeWorkSuggestion,
} from "../work-suggestion.service";
import { ValidationError } from "../organization-errors";
import type { IWorkSuggestion } from "@semantask/db/models/WorkSuggestion";

const messageId = new Types.ObjectId().toString();
const conversationId = new Types.ObjectId().toString();
const organizationId = new Types.ObjectId().toString();
const suggestionId = new Types.ObjectId().toString();

function buildDoc(overrides: Partial<IWorkSuggestion> = {}): IWorkSuggestion {
    const now = new Date("2026-08-08T10:00:00.000Z");
    return {
        _id: new Types.ObjectId(suggestionId),
        messageId: new Types.ObjectId(messageId),
        conversationId: new Types.ObjectId(conversationId),
        organizationId: new Types.ObjectId(organizationId),
        intentId: null,
        status: "proposed",
        title: "Follow up with the team",
        summary: "Suggested from chat",
        confidence: 0.9,
        candidates: {
            assigneeCandidates: [],
            dueAtCandidate: null,
            priorityCandidate: "",
        },
        dismissReason: null,
        convertedTaskId: null,
        extractorVersion: "intelligent-v6-message-intent",
        createdAt: now,
        updatedAt: now,
        ...overrides,
    } as IWorkSuggestion;
}

describe("work-suggestion.service", () => {
    let infoSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        findOne.mockReset();
        findById.mockReset();
        create.mockReset();
        countDocuments.mockReset();
        find.mockReset();
        infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
    });

    afterEach(() => {
        infoSpy.mockRestore();
    });

    describe("normalizeWorkSuggestion", () => {
        it("maps ObjectIds and dates to DTO strings", () => {
            const record = normalizeWorkSuggestion(buildDoc());
            expect(record._id).toBe(suggestionId);
            expect(record.messageId).toBe(messageId);
            expect(record.conversationId).toBe(conversationId);
            expect(record.organizationId).toBe(organizationId);
            expect(record.createdAt).toBe("2026-08-08T10:00:00.000Z");
            expect(record.status).toBe("proposed");
        });
    });

    describe("createWorkSuggestion", () => {
        it("creates a proposed suggestion and logs suggestion.created", async () => {
            findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            create.mockResolvedValue(buildDoc());

            const created = await createWorkSuggestion({
                messageId,
                conversationId,
                organizationId,
                title: "Follow up with the team",
                confidence: 0.9,
                extractorVersion: "intelligent-v6-message-intent",
                summary: "Suggested from chat",
            });

            expect(created._id).toBe(suggestionId);
            expect(create).toHaveBeenCalled();
            expect(infoSpy).toHaveBeenCalled();
            const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
            expect(payload.event).toBe("suggestion.created");
            expect(payload.messageId).toBe(messageId);
        });

        it("returns existing proposed suggestion for the same messageId (idempotent)", async () => {
            const existing = buildDoc();
            findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

            const first = await createWorkSuggestion({
                messageId,
                conversationId,
                title: "Follow up with the team",
                confidence: 0.9,
                extractorVersion: "v1",
            });
            const second = await createWorkSuggestion({
                messageId,
                conversationId,
                title: "Different title that should not create",
                confidence: 0.5,
                extractorVersion: "v2",
            });

            expect(first._id).toBe(second._id);
            expect(create).not.toHaveBeenCalled();
            expect(infoSpy).not.toHaveBeenCalled();
        });

        it("re-fetches on duplicate key race", async () => {
            findOne
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(buildDoc()) });
            create.mockRejectedValue({ code: 11000 });

            const created = await createWorkSuggestion({
                messageId,
                conversationId,
                title: "Follow up with the team",
                confidence: 0.9,
                extractorVersion: "v1",
            });

            expect(created._id).toBe(suggestionId);
            expect(infoSpy).not.toHaveBeenCalled();
        });
    });

    describe("getWorkSuggestion", () => {
        it("returns null for invalid id", async () => {
            await expect(getWorkSuggestion("not-an-id")).resolves.toBeNull();
            expect(findById).not.toHaveBeenCalled();
        });

        it("returns normalized record", async () => {
            findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(buildDoc()) });
            const record = await getWorkSuggestion(suggestionId);
            expect(record?.title).toBe("Follow up with the team");
        });
    });

    describe("listWorkSuggestions", () => {
        it("requires a conversation or organization scope", async () => {
            await expect(listWorkSuggestions({})).rejects.toBeInstanceOf(ValidationError);
        });

        it("filters by conversation/status and paginates", async () => {
            countDocuments.mockResolvedValue(25);
            find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    skip: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            exec: jest.fn().mockResolvedValue([buildDoc()]),
                        }),
                    }),
                }),
            });

            const result = await listWorkSuggestions({
                conversationId,
                status: "proposed",
                page: 2,
                limit: 10,
            });

            expect(countDocuments).toHaveBeenCalledWith({
                conversationId: expect.any(Types.ObjectId),
                status: "proposed",
            });
            expect(result.items).toHaveLength(1);
            expect(result.pagination).toEqual({
                page: 2,
                limit: 10,
                total: 25,
                totalPages: 3,
            });
        });
    });
});
