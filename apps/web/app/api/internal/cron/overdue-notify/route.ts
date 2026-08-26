import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/Db/db";
import { notifyOverdueTasks } from "@semantask/services/overdue-notify.service";

/**
 * Lightweight overdue notifier for cron / ops.
 * Protect with INTERNAL_CRON_TOKEN when set.
 */
export async function POST(req: Request) {
    const expected = process.env.INTERNAL_CRON_TOKEN?.trim();
    if (expected) {
        const provided = req.headers.get("x-internal-cron-token")?.trim();
        if (provided !== expected) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        await connectToDatabase();
        const body = (await req.json().catch(() => ({}))) as {
            organizationId?: string;
            limit?: number;
        };
        const result = await notifyOverdueTasks({
            organizationId: body.organizationId,
            limit: body.limit,
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
