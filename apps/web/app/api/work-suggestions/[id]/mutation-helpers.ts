import { NextResponse } from "next/server";
import { AuthorizationError } from "@semantask/services/authorization.service";
import {
    ConflictError,
    ValidationError,
    organizationApiErrorStatus,
} from "@semantask/services/organization-errors";

export function workSuggestionMutationErrorResponse(error: unknown, context: string) {
    if (error instanceof AuthorizationError) {
        if (error.code === "FORBIDDEN" || error.code === "NOT_FOUND") {
            return NextResponse.json(
                { success: false, error: "Work suggestion not found" },
                { status: 404 }
            );
        }
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 403 }
        );
    }

    if (error instanceof ValidationError) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 400 }
        );
    }

    if (error instanceof SyntaxError) {
        return NextResponse.json(
            { success: false, error: "Invalid JSON payload" },
            { status: 400 }
        );
    }

    if (error instanceof ConflictError) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 409 }
        );
    }

    console.error(`${context} error`, error);
    return NextResponse.json(
        { success: false, error: "Failed to update work suggestion" },
        { status: organizationApiErrorStatus(error) }
    );
}
