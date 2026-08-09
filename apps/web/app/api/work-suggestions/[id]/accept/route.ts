import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import {
    assertWorkSuggestionMutationAccess,
} from "@semantask/services/authorization.service";
import {
    acceptWorkSuggestion,
    getWorkSuggestion,
} from "@semantask/services/work-suggestion.service";
import { workSuggestionMutationErrorResponse } from "../mutation-helpers";

type RouteContext = { params: Promise<{ id: string }> };

const acceptBodySchema = z.object({
    assignees: z.array(z.string().min(1)).max(32).optional(),
    dueAt: z.union([z.string().datetime(), z.null()]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
}).strict();

export async function POST(req: Request, context: RouteContext) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const { id } = await context.params;

    try {
        await connectToDatabase();

        let body: z.infer<typeof acceptBodySchema> = {};
        const raw = await req.text();
        if (raw.trim().length > 0) {
            body = acceptBodySchema.parse(JSON.parse(raw));
        }

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

        const result = await acceptWorkSuggestion({
            suggestionId: id,
            actorUserId: guard.user.id,
            assignees: body.assignees,
            dueAt: body.dueAt,
            priority: body.priority,
        });

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid accept payload" },
                { status: 400 }
            );
        }
        return workSuggestionMutationErrorResponse(error, "POST /api/work-suggestions/[id]/accept");
    }
}
