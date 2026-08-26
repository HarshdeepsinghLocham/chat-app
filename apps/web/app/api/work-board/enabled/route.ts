import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/utils/auth/requireAuthUser";
import { isCoordinationBoardEnabled } from "@semantask/services/organization-policy.service";

export async function GET() {
    const guard = await requireAuthUser();
    if (guard.response) {
        return guard.response;
    }

    return NextResponse.json({
        success: true,
        data: {
            enabled: isCoordinationBoardEnabled(),
        },
    });
}
