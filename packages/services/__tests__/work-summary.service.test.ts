import { Types } from "mongoose";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const countDocuments = jest.fn();
const find = jest.fn();

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        countDocuments: (...args: unknown[]) => countDocuments(...args),
        find: (...args: unknown[]) => find(...args),
    },
}));

const taskActionFind = jest.fn();

jest.mock("@semantask/db/models/TaskAction", () => ({
    __esModule: true,
    default: {
        find: (...args: unknown[]) => taskActionFind(...args),
    },
}));

const conversationFind = jest.fn();

jest.mock("@semantask/db/models/Conversation", () => ({
    Conversation: {
        find: (...args: unknown[]) => conversationFind(...args),
    },
}));

jest.mock("@semantask/db/models/ToolGrant", () => ({
    HIGH_RISK_TOOLS: ["send_email", "schedule_meeting", "create_github_issue"],
    isHighRiskToolName: (value: string) =>
        ["send_email", "schedule_meeting", "create_github_issue"].includes(value),
}));

import {
    getOrganizationWorkSummary,
    WORK_SUMMARY_AGING_MS,
} from "../work-summary.service";
import { ValidationError } from "../organization-errors";

const organizationId = "507f1f77bcf86cd799439011";
const conversationId = new Types.ObjectId("507f1f77bcf86cd799439012");
const taskId = new Types.ObjectId("507f1f77bcf86cd799439013");
const actionId = new Types.ObjectId("507f1f77bcf86cd799439014");

function mockFindChain<T>(result: T) {
    return {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(result),
    };
}

describe("getOrganizationWorkSummary", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        countDocuments.mockResolvedValue(0);
        conversationFind.mockReturnValue(mockFindChain([]));
        taskActionFind.mockReturnValue(mockFindChain([]));
        find.mockReturnValue(mockFindChain([]));
    });

    it("requires a valid organization id", async () => {
        await expect(getOrganizationWorkSummary("bad-id")).rejects.toBeInstanceOf(ValidationError);
    });

    it("returns empty buckets when the org has no conversations", async () => {
        const summary = await getOrganizationWorkSummary(organizationId);

        expect(summary.openWork.counts).toEqual({ todo: 0, doing: 0, done: 0 });
        expect(summary.openWork.overdue).toBe(0);
        expect(summary.openWork.openAgeMs).toBeNull();
        expect(summary.agingApprovals).toEqual({ pending: 0, aging: 0, oldest: [] });
        expect(summary.highRiskPending).toEqual({ pending: 0, aging: 0, oldest: [] });
        expect(taskActionFind).not.toHaveBeenCalled();
    });

    it("counts board columns using the boardStatus heuristic", async () => {
        countDocuments
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(1);

        conversationFind.mockReturnValue(mockFindChain([]));

        const summary = await getOrganizationWorkSummary(organizationId);

        expect(summary.openWork.counts).toEqual({ todo: 2, doing: 1, done: 3 });
        expect(summary.openWork.overdue).toBe(1);
        expect(countDocuments).toHaveBeenCalledTimes(4);
    });

    it("computes aging approvals and high-risk pending subsets", async () => {
        const now = Date.now();
        const fresh = new Date(now - 60 * 60 * 1000);
        const stale = new Date(now - WORK_SUMMARY_AGING_MS - 60 * 60 * 1000);

        conversationFind.mockReturnValue(mockFindChain([{ _id: conversationId }]));
        taskActionFind.mockReturnValue(
            mockFindChain([
                {
                    _id: actionId,
                    taskId,
                    conversationId,
                    toolName: "send_email",
                    actionType: "send_email",
                    createdAt: stale,
                },
                {
                    _id: new Types.ObjectId(),
                    taskId,
                    conversationId,
                    toolName: "lookup_contact",
                    actionType: "none",
                    createdAt: fresh,
                },
            ])
        );

        const summary = await getOrganizationWorkSummary(organizationId);

        expect(summary.agingApprovals.pending).toBe(2);
        expect(summary.agingApprovals.aging).toBe(1);
        expect(summary.agingApprovals.oldest[0]?._id).toBe(actionId.toString());
        expect(summary.highRiskPending.pending).toBe(1);
        expect(summary.highRiskPending.aging).toBe(1);
        expect(summary.highRiskPending.oldest[0]?.toolName).toBe("send_email");
    });

    it("maps oldest open tasks with resolved boardStatus", async () => {
        const createdAt = new Date("2026-08-20T10:00:00.000Z");
        find
            .mockReturnValueOnce(mockFindChain([{ createdAt }]))
            .mockReturnValueOnce(
                mockFindChain([
                    {
                        _id: taskId,
                        title: "Follow up",
                        status: "executing",
                        conversationId,
                        createdAt,
                        dueAt: null,
                    },
                ])
            );

        const summary = await getOrganizationWorkSummary(organizationId);

        expect(summary.openWork.openAgeMs).not.toBeNull();
        expect(summary.openWork.oldest).toEqual([
            expect.objectContaining({
                _id: taskId.toString(),
                title: "Follow up",
                boardStatus: "doing",
            }),
        ]);
    });
});
