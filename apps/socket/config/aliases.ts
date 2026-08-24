import { warnIfAliasOnly } from "./parse.js";

/** Call once at socket boot. Dual-read of `INTERNAL_SECRET` stays during rotation. */
export function warnDeprecatedSocketAliases(): void {
    warnIfAliasOnly("INTERNAL_SECRET_SOCKET", "INTERNAL_SECRET");
}
