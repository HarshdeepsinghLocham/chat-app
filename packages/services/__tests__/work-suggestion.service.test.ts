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
        findOneAndUpdate: jest.fn(),
    },
    WORK_SUGGESTION_STATUSES: ["proposed", "accepted", "dismissed", "converted"],
}));

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findById: jest.fn(),
    },
}));

jest.mock("../repositories/task.repo", () => ({
    createTask: jest.fn(),
    updateTask: jest.fn(),
}));

jest.mock("../outbox.service", () => ({
    enqueueOutboxEvent: jest.fn(),
}));

jest.mock("../organization-policy.service", () => ({
    assertAcceptCreatesCoordinationOnly: jest.fn(),
}));

jest.mock("../conversation-label.service", () => ({
    resolveConversationLabels: jest.fn(async () => new Map()),
}));

jest.mock("../execution-proposal.service", () => ({
    proposeExecutionFromSuggestion: jest.fn(async () => ({ action: null, created: false })),
}));

jest.mock("../organization.service", () => ({
    assertUsersAreOrgMembers: jest.fn(async () => undefined),
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

            const result = await createWorkSuggestion({
                messageId,
                conversationId,
                organizationId,
                title: "Follow up with the team",
                confidence: 0.9,
                extractorVersion: "intelligent-v6-message-intent",
                summary: "Suggested from chat",
            });

            expect(result.created).toBe(true);
            expect(result.suggestion._id).toBe(suggestionId);
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

            expect(first.created).toBe(false);
            expect(second.created).toBe(false);
            expect(first.suggestion._id).toBe(second.suggestion._id);
            expect(create).not.toHaveBeenCalled();
            expect(infoSpy).not.toHaveBeenCalled();
        });

        it("re-fetches on duplicate key race", async () => {
            findOne
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
                .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(buildDoc()) });
            create.mockRejectedValue({ code: 11000 });

            const result = await createWorkSuggestion({
                messageId,
                conversationId,
                title: "Follow up with the team",
                confidence: 0.9,
                extractorVersion: "v1",
            });

            expect(result.created).toBe(false);
            expect(result.suggestion._id).toBe(suggestionId);
            expect(infoSpy).not.toHaveBeenCalled();
        });

        it("rejects short title", async () => {
            await expect(
                createWorkSuggestion({
                    messageId,
                    conversationId,
                    title: "ab",
                    confidence: 0.9,
                    extractorVersion: "v1",
                })
            ).rejects.toBeInstanceOf(ValidationError);
            expect(create).not.toHaveBeenCalled();
        });

        it("rejects out-of-range confidence", async () => {
            await expect(
                createWorkSuggestion({
                    messageId,
                    conversationId,
                    title: "Follow up with the team",
                    confidence: 1.5,
                    extractorVersion: "v1",
                })
            ).rejects.toBeInstanceOf(ValidationError);
            expect(create).not.toHaveBeenCalled();
        });

        it("rejects blank extractorVersion", async () => {
            await expect(
                createWorkSuggestion({
                    messageId,
                    conversationId,
                    title: "Follow up with the team",
                    confidence: 0.9,
                    extractorVersion: "   ",
                })
            ).rejects.toBeInstanceOf(ValidationError);
            expect(create).not.toHaveBeenCalled();
        });

        it("rejects malformed organizationId and intentId", async () => {
            await expect(
                createWorkSuggestion({
                    messageId,
                    conversationId,
                    organizationId: "not-an-id",
                    title: "Follow up with the team",
                    confidence: 0.9,
                    extractorVersion: "v1",
                })
            ).rejects.toBeInstanceOf(ValidationError);

            await expect(
                createWorkSuggestion({
                    messageId,
                    conversationId,
                    intentId: "bad",
                    title: "Follow up with the team",
                    confidence: 0.9,
                    extractorVersion: "v1",
                })
            ).rejects.toBeInstanceOf(ValidationError);
            expect(create).not.toHaveBeenCalled();
        });

        it("normalizes title, clamps confidence, and filters invalid assignees on write", async () => {
            findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
            create.mockResolvedValue(buildDoc());
            const validAssignee = new Types.ObjectId().toString();
            const longTitle = `Follow up ${"x".repeat(250)}`;

            await createWorkSuggestion({
                messageId,
                conversationId,
                organizationId,
                title: `  ${longTitle}  `,
                confidence: 0.9,
                extractorVersion: "v1",
                candidates: {
                    assigneeCandidates: [validAssignee, "not-an-id", ""],
                },
            });

            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: longTitle.trim().slice(0, 200),
                    confidence: 0.9,
                    organizationId: expect.any(Types.ObjectId),
                    candidates: expect.objectContaining({
                        assigneeCandidates: [expect.any(Types.ObjectId)],
                    }),
                })
            );
            const written = create.mock.calls[0]?.[0];
            expect(written.candidates.assigneeCandidates).toHaveLength(1);
            expect(written.candidates.assigneeCandidates[0].toString()).toBe(validAssignee);
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
            const limitMock = jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([buildDoc()]),
            });
            const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
            find.mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    skip: skipMock,
                }),
            });

            const result = await listWorkSuggestions({
                conversationId,
                status: "proposed",
                page: 2.9,
                limit: 10.7,
            });

            expect(countDocuments).toHaveBeenCalledWith({
                conversationId: expect.any(Types.ObjectId),
                status: "proposed",
            });
            expect(skipMock).toHaveBeenCalledWith(10);
            expect(limitMock).toHaveBeenCalledWith(10);
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
