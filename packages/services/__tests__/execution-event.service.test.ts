import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined as never),
}));

const findOneAndUpdate = jest.fn<any>();
const findById = jest.fn<any>();

jest.mock("@semantask/db/models/Task", () => ({
    __esModule: true,
    default: {
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
        findById: (...args: unknown[]) => findById(...args),
    },
}));

const createEvent = jest.fn<any>();
jest.mock("@semantask/db/models/TaskExecutionEvent", () => ({
    __esModule: true,
    default: {
        create: (...args: unknown[]) => createEvent(...args),
    },
}));

const notifyUsers = jest.fn<any>();
jest.mock("../notify.service", () => ({
    notifyUsers: (...args: unknown[]) => notifyUsers(...args),
}));

import { persistExecutionUpdatePayload } from "../execution-event.service";

function flushAsyncWork(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("persistExecutionUpdatePayload", () => {
    const taskId = "507f1f77bcf86cd799439012";
    const conversationId = "507f1f77bcf86cd799439013";
    const assigneeId = "507f1f77bcf86cd799439014";

    beforeEach(() => {
        findOneAndUpdate.mockReset();
        findById.mockReset();
        createEvent.mockReset();
        notifyUsers.mockReset();
        findOneAndUpdate.mockReturnValue({
            exec: jest.fn<any>().mockResolvedValue({ executionEventSequence: 1 }),
        });
        createEvent.mockResolvedValue({ _id: "event-1", type: "execution_completed" } as never);
        findById.mockReturnValue({
            select: () => ({
                lean: async () => ({
                    title: "Ship release",
                    assignees: [{ toString: () => assigneeId }],
                    conversationId: { toString: () => conversationId },
                }),
            }),
        });
        notifyUsers.mockResolvedValue(undefined as never);
    });

    it("notifies only failure when state is failed even if step is completed", async () => {
        await persistExecutionUpdatePayload({
            taskId,
            conversationId,
            state: "failed",
            actionType: "send_email",
            summary: "Tool completed with an error",
            error: "SMTP rejected",
            updatedAt: new Date().toISOString(),
            runId: "run-1",
            step: "completed",
        });

        await flushAsyncWork();
        await flushAsyncWork();

        expect(notifyUsers).toHaveBeenCalledTimes(1);
        expect(notifyUsers).toHaveBeenCalledWith(
            [assigneeId],
            expect.objectContaining({ kind: "execution_failed" })
        );
        expect(notifyUsers).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ kind: "execution_succeeded" })
        );
    });
});
