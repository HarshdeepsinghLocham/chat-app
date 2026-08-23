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

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
    const transporter = getTransporter();
    const smtp = getSmtpConfig();

    await transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: "Your verification code",
        text: `Your OTP is ${otp}. It expires in 5 minutes.`,
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`,
    });
}
