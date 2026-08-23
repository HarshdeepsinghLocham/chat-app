import { NextResponse } from "next/server";
import { createClient } from "redis";
import { getRedisUrl } from "@/lib/config/redis";
import { requireAdminUser } from "@/lib/utils/auth/requireAdminUser";

const redis = createClient({
    url: getRedisUrl(),
});

async function connectRedis() {
    if (!redis.isOpen) {
        await redis.connect();
    }
}

export async function GET() {
    try {
        const guard = await requireAdminUser();
        if (guard.response) {
            return guard.response;
        }

        await connectRedis();

        const [activeUsers, totalMessagesTodayRaw] = await Promise.all([
            redis.sCard("active_users"),
            redis.get("total_messages_today"),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                activeUsers: activeUsers ?? 0,
                totalMessagesToday: Number(totalMessagesTodayRaw ?? 0),
            },
        });
    } catch (err) {
        console.error("Dashboard API Error:", err);
        return NextResponse.json(
            { success: false, error: "Failed to fetch dashboard data" },
            { status: 500 }
        );
    }
}
