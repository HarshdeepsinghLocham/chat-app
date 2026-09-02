import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/config/smtp";

function getTransporter() {
    const smtp = getSmtpConfig();
    if (!smtp.user || !smtp.pass) {
        throw new Error("SMTP credentials are not configured");
    }
    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
    });
}

export async function sendTransactionalEmail(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
}): Promise<void> {
    const transporter = getTransporter();
    const smtp = getSmtpConfig();
    await transporter.sendMail({
        from: smtp.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
    });
}

export function isSmtpConfigured(): boolean {
    const smtp = getSmtpConfig();
    return Boolean(smtp.user && smtp.pass && smtp.from);
}
