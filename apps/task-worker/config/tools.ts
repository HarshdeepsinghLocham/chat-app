import { firstNonEmpty, parseCsvLowercase } from "./parse.js";

export type ResendConfig = {
    apiKey: string | undefined;
    from: string | undefined;
};

export type GitHubIssueConfig = {
    token: string | undefined;
    repo: string | undefined;
};

export function getResendConfig(): ResendConfig {
    return {
        apiKey: firstNonEmpty(process.env.RESEND_API_KEY),
        from: firstNonEmpty(process.env.RESEND_FROM_EMAIL),
    };
}

export function getGitHubIssueConfig(): GitHubIssueConfig {
    return {
        token: firstNonEmpty(process.env.GITHUB_TOKEN),
        repo: firstNonEmpty(process.env.GITHUB_REPO),
    };
}

export function getScheduleMeetingWebhookUrl(): string | undefined {
    return firstNonEmpty(process.env.SCHEDULE_MEETING_WEBHOOK_URL);
}

/**
 * Deploy-wide email allowlist. Org `allowedEmailDomains` still wins when set.
 * Canonical: `TASK_WORKER_ALLOWED_EMAIL_DOMAINS`.
 */
export function getEnvAllowedEmailDomains(): string[] {
    return parseCsvLowercase(
        firstNonEmpty(process.env.TASK_WORKER_ALLOWED_EMAIL_DOMAINS) ?? "",
    );
}

export function getWorkerToolsConfig() {
    return {
        resend: getResendConfig(),
        github: getGitHubIssueConfig(),
        scheduleMeetingWebhookUrl: getScheduleMeetingWebhookUrl(),
        allowedEmailDomains: getEnvAllowedEmailDomains(),
    };
}
