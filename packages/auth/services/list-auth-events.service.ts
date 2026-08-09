import { FilterQuery, Types } from "mongoose";
import { AuthEventModel, AuthEventType, IAuthEvent } from "../repositories/authEventModel";

/** STEP_UP filters historical audit rows only; the app no longer emits step-up events. */
export type AdminAuthEventGroup = "LOGIN" | "REFRESH" | "REVOKE" | "STEP_UP";

type ListAuthEventsInput = {
    page?: number;
    limit?: number;
    eventType?: AdminAuthEventGroup;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
};

export type AdminAuthEventItem = {
    id: string;
    eventType: AdminAuthEventGroup;
    eventName: AuthEventType;
    outcome: "success" | "failure";
    userId: string | null;
    timestamp: string;
    ipAddress: string;
    userAgent: string;
    reason?: string;
};

type ListAuthEventsOutput = {
    events: AdminAuthEventItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

const GROUP_TO_EVENT_TYPES: Record<AdminAuthEventGroup, AuthEventType[]> = {
    LOGIN: ["login_success", "login_failed"],
    REFRESH: ["refresh_success", "refresh_failed"],
    REVOKE: [
        "logout_success",
        "logout_failed",
        "logout_all_devices_success",
        "logout_all_devices_failed",
        "tokens_revoked",
        "tokens_revoked_failed",
        "password_changed",
        "password_change_failed",
    ],
    STEP_UP: ["step_up_triggered", "step_up_success", "step_up_failed"],
};

function normalizePagination(page?: number, limit?: number) {
    const nextPage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const nextLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Number(limit))) : 20;
    return { page: nextPage, limit: nextLimit };
}

function toEventGroup(eventName: AuthEventType): AdminAuthEventGroup {
    if (eventName.startsWith("login_")) return "LOGIN";
    if (eventName.startsWith("refresh_")) return "REFRESH";
    if (eventName.startsWith("step_up_")) return "STEP_UP";
    return "REVOKE";
}

function isValidUserId(value?: string): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

export async function listAuthEvents(input: ListAuthEventsInput = {}): Promise<ListAuthEventsOutput> {
    const { page, limit } = normalizePagination(input.page, input.limit);

    const query: FilterQuery<IAuthEvent> = {};

    if (input.eventType) {
        query.eventType = { $in: GROUP_TO_EVENT_TYPES[input.eventType] };
    }

    if (isValidUserId(input.userId)) {
        query.userId = new Types.ObjectId(input.userId);
    }

    if (input.dateFrom || input.dateTo) {
        query.createdAt = {};
        if (input.dateFrom) {
            query.createdAt.$gte = input.dateFrom;
        }
        if (input.dateTo) {
            query.createdAt.$lte = input.dateTo;
        }
    }

    const [docs, total] = await Promise.all([
        AuthEventModel.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select("eventType outcome reason userId createdAt ipAddress userAgent")
            .lean<
                Array<{
                    _id: Types.ObjectId;
                    eventType: AuthEventType;
                    outcome: "success" | "failure";
                    reason?: string;
                    userId?: Types.ObjectId;
                    createdAt: Date;
                    ipAddress: string;
                    userAgent: string;
                }>
            >(),
        AuthEventModel.countDocuments(query),
    ]);

    const events = docs.map((doc) => ({
        id: doc._id.toString(),
        eventType: toEventGroup(doc.eventType),
        eventName: doc.eventType,
        outcome: doc.outcome,
        userId: doc.userId ? doc.userId.toString() : null,
        timestamp: doc.createdAt.toISOString(),
        ipAddress: doc.ipAddress,
        userAgent: doc.userAgent,
        reason: doc.reason,
    }));

    return {
        events,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}
