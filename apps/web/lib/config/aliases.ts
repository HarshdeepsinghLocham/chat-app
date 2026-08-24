import { warnIfAliasOnly } from "./parse";

/** Call once at web Node boot. Dual-read of `INTERNAL_SECRET` stays during rotation. */
export function warnDeprecatedWebAliases(): void {
    warnIfAliasOnly("INTERNAL_SECRET_WORKER", "INTERNAL_SECRET");
}
