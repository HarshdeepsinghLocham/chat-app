import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import { sumOrganizationTokensSince } from "@semantask/services/usage-event.service";
import { organizationApiErrorStatus } from "@semantask/services/organization-errors";
import { isValidObjectId } from "@semantask/services/work-board.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const { id } = await context.params;
    if (!isValidObjectId(id)) {
        return NextResponse.json(
            { success: false, error: "Invalid organization id" },
            { status: 400 }
        );
    }

    try {
        await assertOrganizationActive(id);
        await assertMembership(id, guard.user.id);
        const since = new Date();
        since.setUTCDate(1);
        since.setUTCHours(0, 0, 0, 0);
        const tokensThisMonth = await sumOrganizationTokensSince(id, since);
        return NextResponse.json({
            success: true,
            data: { tokensThisMonth, periodStart: since.toISOString() },
        });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        console.error("GET /api/organizations/[id]/usage error", error);
        return NextResponse.json(
            { success: false, error: "Failed to load usage" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
