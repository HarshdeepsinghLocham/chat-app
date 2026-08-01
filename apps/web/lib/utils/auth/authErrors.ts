export type AuthErrorCode =
    | "AUTH_UNAUTHORIZED"
    | "AUTH_FORBIDDEN"
    | "AUTH_ACCESS_TOKEN_MISSING"
    | "AUTH_ACCESS_TOKEN_INVALID"
    | "AUTH_USER_NOT_FOUND"
    | "AUTH_USER_BANNED"
    | "AUTH_USER_DELETED"
    | "AUTH_TOKEN_REVOKED"
    | "AUTH_PASSWORD_CHANGE_REQUIRED";

export class AuthError extends Error {
    readonly statusCode: 401 | 403;
    readonly code: AuthErrorCode;

    constructor(message: string, statusCode: 401 | 403, code: AuthErrorCode) {
        super(message);
        this.name = "AuthError";
        this.statusCode = statusCode;
        this.code = code;
    }
}

export class UnauthorizedError extends AuthError {
    constructor(
        message = "Unauthorized",
        code: Extract<AuthErrorCode, "AUTH_UNAUTHORIZED" | "AUTH_ACCESS_TOKEN_MISSING" | "AUTH_ACCESS_TOKEN_INVALID" | "AUTH_USER_NOT_FOUND" | "AUTH_TOKEN_REVOKED"> = "AUTH_UNAUTHORIZED"
    ) {
        super(message, 401, code);
        this.name = "UnauthorizedError";
    }
}

export class ForbiddenError extends AuthError {
    constructor(
        message = "Forbidden",
        code: Extract<AuthErrorCode, "AUTH_FORBIDDEN" | "AUTH_USER_BANNED" | "AUTH_USER_DELETED" | "AUTH_PASSWORD_CHANGE_REQUIRED"> = "AUTH_FORBIDDEN"
    ) {
        super(message, 403, code);
        this.name = "ForbiddenError";
    }
}

export function isAuthError(error: unknown): error is AuthError {
    return error instanceof AuthError;
}
