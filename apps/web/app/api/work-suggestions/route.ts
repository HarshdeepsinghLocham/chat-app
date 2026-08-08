import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/Db/db";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { requireConversationAccess } from "@/lib/utils/auth/requireConversationAccess";
import {
    AuthorizationError,
} from "@semantask/services/authorization.service";
import {
    assertMembership,
    assertOrganizationActive,
} from "@semantask/services/organization.service";
import {
    listWorkSuggestions,
    WORK_SUGGESTION_STATUSES,
} from "@semantask/services/work-suggestion.service";
import {
    organizationApiErrorStatus,
    ValidationError,
} from "@semantask/services/organization-errors";
import type { WorkSuggestionStatus } from "@semantask/types";

function parsePositiveInt(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSuggestionStatus(value: string | null): value is WorkSuggestionStatus {
    return Boolean(value && (WORK_SUGGESTION_STATUSES as readonly string[]).includes(value));
}

export async function GET(req: Request) {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() || undefined;
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const statusParam = url.searchParams.get("status");
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 20);

    if (!conversationId && !organizationId) {
        return NextResponse.json(
            { success: false, error: "conversationId or organizationId is required" },
            { status: 400 }
        );
    }

    if (statusParam && !isSuggestionStatus(statusParam)) {
        return NextResponse.json(
            { success: false, error: "Invalid status" },
            { status: 400 }
        );
    }

    try {
        await connectToDatabase();

        if (conversationId) {
            const access = await requireConversationAccess(conversationId, guard.user);
            if (access.response) {
                return access.response;
            }
        }

        if (organizationId) {
            await assertOrganizationActive(organizationId);
            await assertMembership(organizationId, guard.user.id);
        }

        const result = await listWorkSuggestions({
            conversationId,
            organizationId,
            status: isSuggestionStatus(statusParam) ? statusParam : undefined,
            page,
            limit,
        });

        return NextResponse.json({
            success: true,
            data: result,
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
        console.error("GET /api/work-suggestions error", error);
        return NextResponse.json(
            { success: false, error: "Failed to list work suggestions" },
            { status: organizationApiErrorStatus(error) }
        );
    }
}
