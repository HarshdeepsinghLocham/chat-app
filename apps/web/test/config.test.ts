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
    it("SMTP_USER / SMTP_PASS are canonical; EMAIL_USER / EMAIL_PASS are ignored", () => {
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
            expect(smtp.user).toBeUndefined();
            expect(smtp.pass).toBeUndefined();
            expect(smtp.from).toBeUndefined();
        });

        withEnv({
            SMTP_USER: "smtp-user",
            SMTP_PASS: "smtp-pass",
            EMAIL_FROM: "from@example.com",
            EMAIL_USER: "alias-user",
        }, () => {
            const smtp = getSmtpConfig();
            expect(smtp.user).toBe("smtp-user");
            expect(smtp.pass).toBe("smtp-pass");
            expect(smtp.from).toBe("from@example.com");
        });
    });

    it("GOOGLE_CLIENT_ID is canonical; NEXT_PUBLIC_GOOGLE_CLIENT_ID is ignored", () => {
        withEnv({
            GOOGLE_CLIENT_ID: "server-id",
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: "public-id",
        }, () => {
            expect(getGoogleClientId()).toBe("server-id");
        });

        withEnv({
            GOOGLE_CLIENT_ID: undefined,
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: "public-id",
        }, () => {
            expect(getGoogleClientId()).toBe("");
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

    it("boot warns once when only legacy INTERNAL_SECRET is set", () => {
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
                INTERNAL_SECRET_WORKER: undefined,
                INTERNAL_SECRET: "legacy-secret",
            }, () => {
                warnDeprecatedWebAliases();
                warnDeprecatedWebAliases();
            });
            expect(warn).toHaveBeenCalledTimes(1);
            const messages = warn.mock.calls.map((call) => String(call[0]));
            expect(messages.some((line) => line.includes("INTERNAL_SECRET"))).toBe(true);
            expect(messages.some((line) => line.includes("EMAIL_USER"))).toBe(false);
            expect(messages.some((line) => line.includes("NEXT_PUBLIC_GOOGLE_CLIENT_ID"))).toBe(false);
        } finally {
            warn.mockRestore();
            resetAliasWarnings();
        }
    });
});
