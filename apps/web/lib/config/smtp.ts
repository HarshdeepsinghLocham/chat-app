import { firstNonEmpty, parsePort } from "./parse";

export type SmtpConfig = {
    host: string;
    port: number;
    user: string | undefined;
    pass: string | undefined;
    from: string | undefined;
};

export function getSmtpConfig(): SmtpConfig {
    const user = firstNonEmpty(process.env.SMTP_USER);
    const pass = firstNonEmpty(process.env.SMTP_PASS);
    const from = firstNonEmpty(process.env.EMAIL_FROM, process.env.SMTP_USER);

    return {
        host: firstNonEmpty(process.env.SMTP_HOST) ?? "smtp.gmail.com",
        port: parsePort(process.env.SMTP_PORT, 587),
        user,
        pass,
        from,
    };
}
