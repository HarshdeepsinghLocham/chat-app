import { getGoogleClientId } from "@/lib/config/app";
import { warnDeprecatedWebAliases } from "@/lib/config/aliases";
import { resetAliasWarnings } from "@/lib/config/parse";
import { getInternalSocketServerUrl } from "@/lib/config/socket";
import { getSmtpConfig } from "@/lib/config/smtp";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
    try {
        fn();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

describe("web lib/config", () => {
    it("SMTP_USER aliases EMAIL_USER / EMAIL_PASS", () => {
        withEnv({
            SMTP_HOST: undefined,
            SMTP_PORT: undefined,
            SMTP_USER: undefined,
            SMTP_PASS: undefined,
            EMAIL_USER: "alias-user",
            EMAIL_PASS: "alias-pass",
            EMAIL_FROM: undefined,
        }, () => {
            const smtp = getSmtpConfig();
            expect(smtp.host).toBe("smtp.gmail.com");
            expect(smtp.port).toBe(587);
            expect(smtp.user).toBe("alias-user");
            expect(smtp.pass).toBe("alias-pass");
            expect(smtp.from).toBe("alias-user");
        });
    });

    it("prefers GOOGLE_CLIENT_ID over NEXT_PUBLIC_GOOGLE_CLIENT_ID", () => {
        withEnv({
            GOOGLE_CLIENT_ID: "server-id",
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: "public-id",
        }, () => {
            expect(getGoogleClientId()).toBe("server-id");
        });
    });

    it("internal socket URL prefers SOCKET_SERVER_URL", () => {
        withEnv({
            SOCKET_SERVER_URL: "http://socket.internal:3001",
            NEXT_PUBLIC_SOCKET_URL: "http://localhost:3001",
        }, () => {
            expect(getInternalSocketServerUrl()).toBe("http://socket.internal:3001");
        });
    });

    it("boot warns once when only SMTP / Google aliases are set", () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        resetAliasWarnings();
        try {
            withEnv({
                SMTP_USER: undefined,
                EMAIL_USER: "alias-user",
                SMTP_PASS: undefined,
                EMAIL_PASS: "alias-pass",
                GOOGLE_CLIENT_ID: undefined,
                NEXT_PUBLIC_GOOGLE_CLIENT_ID: "public-id",
                IMAGEKIT_PUBLIC_KEY: "ik-public",
                NEXT_PUBLIC_PUBLIC_KEY: undefined,
                INTERNAL_SECRET_WORKER: "worker-secret",
                INTERNAL_SECRET: undefined,
            }, () => {
                warnDeprecatedWebAliases();
                warnDeprecatedWebAliases();
            });
            expect(warn).toHaveBeenCalledTimes(3);
            const messages = warn.mock.calls.map((call) => String(call[0]));
            expect(messages.some((line) => line.includes("EMAIL_USER"))).toBe(true);
            expect(messages.some((line) => line.includes("EMAIL_PASS"))).toBe(true);
            expect(messages.some((line) => line.includes("NEXT_PUBLIC_GOOGLE_CLIENT_ID"))).toBe(true);
        } finally {
            warn.mockRestore();
            resetAliasWarnings();
        }
    });
});
