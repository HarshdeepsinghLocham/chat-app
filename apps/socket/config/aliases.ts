import { warnIfAliasOnly } from "./parse.js";

/** Call once at socket boot. Dual-read aliases stay; this only warns. */
export function warnDeprecatedSocketAliases(): void {
    warnIfAliasOnly("INTERNAL_SECRET_SOCKET", "INTERNAL_SECRET");
}
