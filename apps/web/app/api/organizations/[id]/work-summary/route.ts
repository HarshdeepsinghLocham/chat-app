import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import { isOrgDashboardEnabled } from "@semantask/services/organization-policy.service";
import { getOrganizationWorkSummary } from "@semantask/services/work-summary.service";
import {
    organizationApiErrorStatus,
    ValidationError,
} from "@semantask/services/organization-errors";
import { isValidObjectId } from "@semantask/services/work-board.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
    if (!isOrgDashboardEnabled()) {
        return NextResponse.json(
            { success: false, error: "Not found" },
            { status: 404 }
        );
    }

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

        const summary = await getOrganizationWorkSummary(id);

        return NextResponse.json({
            success: true,
            data: summary,
        });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        if (error instanceof ValidationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 400 }
            );
        }
        console.error("GET /api/organizations/[id]/work-summary error", error);
        return NextResponse.json(
            { success: false, error: "Failed to load work summary" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
