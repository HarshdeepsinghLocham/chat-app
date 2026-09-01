import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/Db/db";
import { notifyOverdueTasks } from "@semantask/services/overdue-notify.service";

/**
 * Lightweight overdue notifier for cron / ops.
 * Requires INTERNAL_CRON_TOKEN (fail closed when unset).
 */
export async function POST(req: Request) {
    const expected = process.env.INTERNAL_CRON_TOKEN?.trim();
    if (!expected) {
        console.error("POST /api/internal/cron/overdue-notify misconfigured: INTERNAL_CRON_TOKEN is not set");
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const provided = req.headers.get("x-internal-cron-token")?.trim();
    if (provided !== expected) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        await connectToDatabase();
        const body = (await req.json().catch(() => ({}))) as {
            organizationId?: string;
            limit?: number;
        };
        const parsedLimit = Number(body.limit);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(200, Math.max(1, Math.trunc(parsedLimit)))
            : undefined;
        const result = await notifyOverdueTasks({
            organizationId: body.organizationId,
            limit,
        });
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error("POST /api/internal/cron/overdue-notify error", error);
        return NextResponse.json(
            { success: false, error: "Failed to notify overdue tasks" },
            { status: 500 }
        );
    }
}
