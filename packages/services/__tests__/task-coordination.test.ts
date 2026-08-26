import { describe, expect, it } from "@jest/globals";
import { deriveCoordinationStatus } from "@semantask/types";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@semantask/db/models/Message", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));

jest.mock("@semantask/db/models/TaskAction", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));

jest.mock("../repositories/task.repo", () => ({
    buildTaskActionIdempotencyKey: () => "key",
    createTaskAction: jest.fn(),
}));

import { draftExecutionParameters } from "../execution-proposal.service";

describe("deriveCoordinationStatus", () => {
    it("maps cancelled, completed, blocked, approval, and open", () => {
        expect(deriveCoordinationStatus({
            status: "pending",
            boardStatus: "todo",
            cancelRequestedAt: "2026-08-26T00:00:00.000Z",
        })).toBe("CANCELLED");
        expect(deriveCoordinationStatus({
            status: "completed",
            boardStatus: "done",
            lifecycleState: "completed",
        })).toBe("COMPLETED");
        expect(deriveCoordinationStatus({
            status: "pending",
            boardStatus: "todo",
            lifecycleState: "blocked",
        })).toBe("BLOCKED");
        expect(deriveCoordinationStatus({
            status: "pending",
            boardStatus: "todo",
            pendingApproval: true,
        })).toBe("AWAITING_APPROVAL");
        expect(deriveCoordinationStatus({
            status: "executing",
            boardStatus: "doing",
            lifecycleState: "executing",
        })).toBe("IN_PROGRESS");
        expect(deriveCoordinationStatus({
            status: "pending",
            boardStatus: "todo",
            lifecycleState: "ready",
        })).toBe("OPEN");
    });
});

describe("draftExecutionParameters", () => {
    it("does not invent email addresses for send_email", () => {
        const drafted = draftExecutionParameters({
            tool: "send_email",
            title: "Send welcome email to new hire",
            outcome: "A professional welcome email is sent to the new hire by Friday.",
            sourceContent: "Send a professional welcome email to the new hire by Friday.",
        });
        expect(drafted.paramsComplete).toBe(false);
        expect(drafted.parameters.to).toEqual(["new hire"]);
        expect(drafted.parameters.subject).toBe("Send welcome email to new hire");
    });

    it("uses an explicit email when present", () => {
        const drafted = draftExecutionParameters({
            tool: "send_email",
            title: "Send welcome email",
            outcome: "Email is sent.",
            sourceContent: "Send a welcome email to alice@company.com by Friday.",
        });
        expect(drafted.paramsComplete).toBe(true);
        expect(drafted.parameters.to).toEqual(["alice@company.com"]);
    });
});
