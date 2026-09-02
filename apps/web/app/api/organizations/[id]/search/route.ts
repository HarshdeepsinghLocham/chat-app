import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import { searchOrganizationWork } from "@semantask/services/work-search.service";
import {
    organizationApiErrorStatus,
    ValidationError,
} from "@semantask/services/organization-errors";
import { isValidObjectId } from "@semantask/services/work-board.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
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

    const query = new URL(req.url).searchParams.get("q") ?? "";

    try {
        await assertOrganizationActive(id);
        await assertMembership(id, guard.user.id);
        const hits = await searchOrganizationWork({ organizationId: id, query });
        return NextResponse.json({ success: true, data: hits });
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
        console.error("GET /api/organizations/[id]/search error", error);
        return NextResponse.json(
            { success: false, error: "Failed to search" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
