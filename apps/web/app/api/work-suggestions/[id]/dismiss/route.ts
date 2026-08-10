import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    assertWorkSuggestionMutationAccess,
} from "@semantask/services/authorization.service";
import {
    dismissWorkSuggestion,
    getWorkSuggestion,
} from "@semantask/services/work-suggestion.service";
import { workSuggestionMutationErrorResponse } from "../mutation-helpers";

type RouteContext = { params: Promise<{ id: string }> };

const dismissBodySchema = z.object({
    reason: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(req: Request, context: RouteContext) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const { id } = await context.params;

    try {
        await connectToDatabase();

        const body = dismissBodySchema.parse(await req.json());

        const suggestion = await getWorkSuggestion(id);
        if (!suggestion) {
            return NextResponse.json(
                { success: false, error: "Work suggestion not found" },
                { status: 404 }
            );
        }

        await assertWorkSuggestionMutationAccess(guard.user.id, suggestion, {
            userRole: guard.user.role,
            allowAdminBypass: true,
        });

        const result = await dismissWorkSuggestion({
            suggestionId: id,
            actorUserId: guard.user.id,
            reason: body.reason,
        });

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid dismiss payload" },
                { status: 400 }
            );
        }
        return workSuggestionMutationErrorResponse(error, "POST /api/work-suggestions/[id]/dismiss");
    }
}
