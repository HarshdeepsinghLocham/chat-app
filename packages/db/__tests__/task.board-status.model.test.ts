import mongoose from "mongoose";
import TaskModel, { BOARD_STATUSES } from "../models/Task";

function buildValidDoc(overrides: Record<string, unknown> = {}) {
    return new TaskModel({
        conversationId: new mongoose.Types.ObjectId(),
        title: "Coordinate the launch",
        createdBy: new mongoose.Types.ObjectId(),
        source: "ai",
        dedupeKey: `test::${new mongoose.Types.ObjectId().toString()}`,
        ...overrides,
    });
}

describe("Task boardStatus", () => {
    it("exposes coordination columns", () => {
        expect([...BOARD_STATUSES]).toEqual(["todo", "doing", "done"]);
    });

    it("defaults boardStatus to todo", () => {
        const doc = buildValidDoc();
        expect(doc.boardStatus).toBe("todo");
        expect(doc.validateSync()).toBeUndefined();
    });

    it("rejects invalid boardStatus", () => {
        const doc = buildValidDoc({ boardStatus: "pending" });
        const error = doc.validateSync();
        expect(error).toBeDefined();
        expect(error?.errors.boardStatus).toBeDefined();
    });

    it.each([...BOARD_STATUSES])("accepts boardStatus %s", (boardStatus) => {
        const doc = buildValidDoc({ boardStatus });
        expect(doc.validateSync()).toBeUndefined();
    });
});
