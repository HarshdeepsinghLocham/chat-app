import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
    evaluateClassifierGold,
    type GoldFile,
} from "../eval/classifier-eval";

jest.mock("@semantask/observability/metrics", () => ({
    classifierClassificationsCounter: { inc: jest.fn() },
    classifierDisagreementCounter: { inc: jest.fn() },
}));

describe("classifier evaluation harness", () => {
    it("meets seed gates on gold cases (type, actionable, heuristics)", () => {
        // Resolve from this test file so the harness is cwd-independent.
        const goldPath = join(__dirname, "../eval/classifier-gold.json");
        const gold = JSON.parse(readFileSync(goldPath, "utf8")) as GoldFile;

        expect(gold.cases.length).toBeGreaterThanOrEqual(40);

        const t7 = gold.cases.find((row) => row.id === "t7");
        expect(t7).toBeDefined();
        expect(t7?.priority).toBeTruthy();

        const report = evaluateClassifierGold(gold);

        expect(report.typeAccuracy).toBeGreaterThanOrEqual(0.7);
        expect(report.actionableAccuracy).toBeGreaterThanOrEqual(0.7);
        expect(report.assigneeHitRate).not.toBeNull();
        expect(report.assigneeHitRate ?? 0).toBeGreaterThanOrEqual(0.9);
        expect(report.dueHitRate).not.toBeNull();
        expect(report.dueHitRate ?? 0).toBeGreaterThanOrEqual(0.9);
        expect(report.priorityHitRate).not.toBeNull();
        expect(report.priorityHitRate ?? 0).toBeGreaterThanOrEqual(0.9);
        expect(report.titlePassRate ?? 0).toBeGreaterThanOrEqual(0.95);

        const t7PriorityFailures = report.failures.filter(
            (f) => f.id === "t7" && f.reason.startsWith("priority")
        );
        expect(t7PriorityFailures).toEqual([]);

        if (report.typeAccuracy < 0.85) {
            // Surface mismatches for debugging without failing above the seed gate.
            // eslint-disable-next-line no-console
            console.warn("classifier-eval failures", report.failures.slice(0, 10));
        }
    });
});
