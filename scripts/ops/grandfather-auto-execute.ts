/**
 * Persist grandfather auto_execute onto OrganizationPolicy docs.
 *
 * For each id in GRANDFATHER_AUTO_TENANTS (or --ids), upsert
 * `executionMode: "auto_execute"`. Then clear GRANDFATHER_AUTO_TENANTS in the
 * same deploy. The env parser stays until the list is empty.
 *
 * Usage (repo root, MONGODB_URI set):
 *   pnpm grandfather:auto-execute --dry-run
 *   pnpm grandfather:auto-execute
 *   pnpm grandfather:auto-execute --ids=507f...,507f...
 */
import "dotenv/config";
import mongoose from "mongoose";
import { parseGrandfatherAutoTenants } from "@semantask/services/config";
import { applyGrandfatherAutoExecute } from "@semantask/services/organization-policy.service";

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`) || process.argv.includes(`-${name}`);
}

function parseIdsArg(): string[] | null {
    const prefix = "--ids=";
    const arg = process.argv.find((entry) => entry.startsWith(prefix));
    if (!arg) {
        return null;
    }
    return arg.slice(prefix.length).split(",").map((entry) => entry.trim()).filter(Boolean);
}

async function main(): Promise<void> {
    const dryRun = hasFlag("dry-run") || hasFlag("dryRun");
    const idsArg = parseIdsArg();
    const organizationIds = idsArg ?? [...parseGrandfatherAutoTenants()];

    if (organizationIds.length === 0) {
        console.log("No organization IDs (GRANDFATHER_AUTO_TENANTS empty). Nothing to do.");
        return;
    }

    const result = await applyGrandfatherAutoExecute({ organizationIds, dryRun });
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
        console.error("Aborting: invalid or missing organization IDs. No policies were written.");
        process.exitCode = 1;
        return;
    }

    if (dryRun) {
        console.log("Dry run only. Re-run without --dry-run to persist, then clear GRANDFATHER_AUTO_TENANTS in the same deploy.");
        return;
    }

    const applied = result.rows.filter((row) => row.status === "applied").length;
    const skipped = result.rows.filter((row) => (
        row.status === "already_auto_execute" || row.status === "already_explicit"
    )).length;
    console.log(`Persisted auto_execute for ${applied} org(s); ${skipped} skipped (already set).`);
    console.log("Clear GRANDFATHER_AUTO_TENANTS in this deploy. Do not delete the env parser until the list is empty.");
}

main()
    .catch((error) => {
        console.error(
            "grandfather-auto-execute failed:",
            error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await mongoose.disconnect();
        } catch {
            // no-op
        }
    });
