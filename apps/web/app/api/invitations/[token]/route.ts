import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    acceptOrganizationInvitation,
    getOrganizationInvitationByToken,
} from "@semantask/services/organization-invite.service";
import { AuthorizationError } from "@semantask/services/authorization.service";
import { organizationApiErrorStatus } from "@semantask/services/organization-errors";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_req: Request, context: RouteContext) {
    const { token } = await context.params;
    try {
        await connectToDatabase();
        const invitation = await getOrganizationInvitationByToken(token);
        if (!invitation) {
            return NextResponse.json(
                { success: false, error: "Invitation not found" },
                { status: 404 }
            );
        }
        const { token: _token, ...publicInvite } = invitation;
        return NextResponse.json({ success: true, data: publicInvite });
    } catch (error) {
        console.error("GET /api/invitations/[token] error", error);
        return NextResponse.json(
            { success: false, error: "Failed to load invitation" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}

export async function POST(_req: Request, context: RouteContext) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const { token } = await context.params;
    try {
        await connectToDatabase();
        const result = await acceptOrganizationInvitation({
            token,
            userId: guard.user.id,
            userEmail: guard.user.email,
        });
        const { token: _token, ...publicInvite } = result.invitation;
        return NextResponse.json({
            success: true,
            data: {
                invitation: publicInvite,
                organizationId: result.organizationId,
            },
        });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        console.error("POST /api/invitations/[token]/accept error", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to accept invitation",
            },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
