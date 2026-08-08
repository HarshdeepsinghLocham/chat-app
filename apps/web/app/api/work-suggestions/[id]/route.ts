import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    assertWorkSuggestionAccess,
    AuthorizationError,
} from "@semantask/services/authorization.service";
import { getWorkSuggestion } from "@semantask/services/work-suggestion.service";
import { organizationApiErrorStatus } from "@semantask/services/organization-errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const { id } = await context.params;

    try {
        await connectToDatabase();
        const suggestion = await getWorkSuggestion(id);
        if (!suggestion) {
            return NextResponse.json(
                { success: false, error: "Work suggestion not found" },
                { status: 404 }
            );
        }

        await assertWorkSuggestionAccess(guard.user.id, suggestion, {
            userRole: guard.user.role,
            allowAdminBypass: true,
        });

        return NextResponse.json({
            success: true,
            data: suggestion,
        });
    } catch (error) {
        if (error instanceof AuthorizationError) {
            // FORBIDDEN must not reveal that a suggestion exists.
            if (error.code === "FORBIDDEN") {
                return NextResponse.json(
                    { success: false, error: "Work suggestion not found" },
                    { status: 404 }
                );
            }
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.code === "NOT_FOUND" ? 404 : 403 }
            );
        }
        console.error("GET /api/work-suggestions/[id] error", error);
        return NextResponse.json(
            { success: false, error: "Failed to load work suggestion" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
