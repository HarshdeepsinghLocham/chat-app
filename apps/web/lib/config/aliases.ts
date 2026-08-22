import { warnIfAliasOnly } from "./parse";

/** Call once at web Node boot. Dual-read aliases stay; this only warns. */
export function warnDeprecatedWebAliases(): void {
    warnIfAliasOnly("SMTP_USER", "EMAIL_USER");
    warnIfAliasOnly("SMTP_PASS", "EMAIL_PASS");
    warnIfAliasOnly("GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    warnIfAliasOnly("IMAGEKIT_PUBLIC_KEY", "NEXT_PUBLIC_PUBLIC_KEY");
    warnIfAliasOnly("INTERNAL_SECRET_WORKER", "INTERNAL_SECRET");
}
