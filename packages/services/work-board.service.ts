import mongoose from "mongoose";
import { connectToDatabase } from "@semantask/db";
import TaskModel from "@semantask/db/models/Task";
import {
    isBoardStatus,
    type BoardStatus,
    type TaskRecord,
} from "@semantask/types";
import { ValidationError } from "./organization-errors";
import { normalizeTask } from "./normalizers/task.normalizer";

const DOING_EXECUTION_STATUSES = ["executing", "partial", "waiting_for_input"] as const;

export type ListWorkBoardInput = {
    conversationId?: string;
    organizationId?: string;
    boardStatus?: BoardStatus;
    page?: number;
    limit?: number;
};

export type WorkBoardListResult = {
    items: TaskRecord[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export function isValidObjectId(value: string): boolean {
    return mongoose.Types.ObjectId.isValid(value);
}

/** Mongo filter that includes historical docs whose boardStatus was never persisted. */
export function boardStatusQuery(boardStatus: BoardStatus): Record<string, unknown> {
    if (boardStatus === "done") {
        return {
            $or: [
                { boardStatus: "done" },
                { boardStatus: { $exists: false }, status: "completed" },
                { boardStatus: null, status: "completed" },
            ],
        };
    }
    if (boardStatus === "doing") {
        return {
            $or: [
                { boardStatus: "doing" },
                { boardStatus: { $exists: false }, status: { $in: [...DOING_EXECUTION_STATUSES] } },
                { boardStatus: null, status: { $in: [...DOING_EXECUTION_STATUSES] } },
            ],
        };
    }
    return {
        $or: [
            { boardStatus: "todo" },
            {
                boardStatus: { $exists: false },
                status: { $nin: ["completed", ...DOING_EXECUTION_STATUSES] },
            },
            {
                boardStatus: null,
                status: { $nin: ["completed", ...DOING_EXECUTION_STATUSES] },
            },
        ],
    };
}

export async function listWorkBoard(input: ListWorkBoardInput): Promise<WorkBoardListResult> {
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

    if (input.boardStatus != null && !isBoardStatus(input.boardStatus)) {
        throw new ValidationError("Invalid boardStatus");
    }

    const page = Number.isFinite(input.page)
        ? Math.max(1, Math.trunc(Number(input.page)))
        : 1;
    const limit = Number.isFinite(input.limit)
        ? Math.min(100, Math.max(1, Math.trunc(Number(input.limit))))
        : 20;

    const query: Record<string, unknown> = {};
    if (conversationId) {
        query.conversationId = new mongoose.Types.ObjectId(conversationId);
    }
    if (organizationId) {
        query.organizationId = new mongoose.Types.ObjectId(organizationId);
    }
    if (input.boardStatus) {
        Object.assign(query, boardStatusQuery(input.boardStatus));
    }

    const [total, rows] = await Promise.all([
        TaskModel.countDocuments(query),
        TaskModel.find(query)
            .sort({ dueAt: 1, updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec(),
    ]);

    return {
        items: rows.map((row) => normalizeTask(row)),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}
