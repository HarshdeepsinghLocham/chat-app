import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import { listToolGrants } from "@semantask/services/tool-grant.service";
import { organizationApiErrorStatus } from "@semantask/services/organization-errors";
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

    try {
        await assertOrganizationActive(id);
        await assertMembership(id, guard.user.id);
        const url = new URL(req.url);
        const result = await listToolGrants({
            organizationId: id,
            page: Number(url.searchParams.get("page") || 1),
            limit: Number(url.searchParams.get("limit") || 20),
        });
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        console.error("GET /api/organizations/[id]/tool-grants error", error);
        return NextResponse.json(
            { success: false, error: "Failed to load grants" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
