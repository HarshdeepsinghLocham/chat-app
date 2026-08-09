import {
    classifyMessageWithRegex,
    isActionableClassification,
} from "../message-classifier.service.js";
import {
    extractEntitiesFromContent,
    type ParticipantHint,
} from "../message-intent.helpers.js";

export type GoldCase = {
    id: string;
    content: string;
    semanticType: string;
    actionable: boolean;
    assigneeUsernames?: string[];
    duePhrase?: string;
    dueAtIso?: string;
    participants?: ParticipantHint[];
    titleMinLength?: number;
    priority?: string;
};

export type GoldFile = {
    version: number;
    description?: string;
    cases: GoldCase[];
};

export type ClassifierEvalReport = {
    total: number;
    typeCorrect: number;
    typeAccuracy: number;
    actionableCorrect: number;
    actionableAccuracy: number;
    assigneeLabeled: number;
    assigneeHits: number;
    assigneeHitRate: number | null;
    dueLabeled: number;
    dueHits: number;
    dueHitRate: number | null;
    priorityLabeled: number;
    priorityHits: number;
    priorityHitRate: number | null;
    titleChecks: number;
    titlePasses: number;
    titlePassRate: number | null;
    failures: Array<{ id: string; reason: string }>;
};

const DEFAULT_NOW = new Date("2026-08-08T15:00:00.000Z");

const WEEKDAY_INDEX: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};

function titleFromContent(content: string): string {
    const normalized = content.trim().replace(/\s+/g, " ");
    const withoutPrefix = normalized.replace(/^(@\w+[:,]?\s*)+/, "");
    const trimmed = withoutPrefix.slice(0, 200);
    return trimmed.length >= 3 ? trimmed : normalized.slice(0, 200);
}

function nextUtcWeekday(today: Date, weekday: number): Date {
    const current = today.getUTCDay();
    let delta = (weekday - current + 7) % 7;
    if (delta === 0) {
        delta = 7;
    }
    const expected = new Date(today);
    expected.setUTCDate(expected.getUTCDate() + delta);
    return expected;
}

function dueMatches(caseRow: GoldCase, dueAt: Date | null, now: Date): boolean | null {
    if (!dueAt) return false;
    if (caseRow.dueAtIso) {
        return dueAt.toISOString() === caseRow.dueAtIso;
    }
    if (!caseRow.duePhrase) return false;

    const phrase = caseRow.duePhrase.toLowerCase();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (phrase === "tomorrow") {
        const expected = new Date(today);
        expected.setUTCDate(expected.getUTCDate() + 1);
        return dueAt.toISOString() === expected.toISOString();
    }

    const weekday = WEEKDAY_INDEX[phrase];
    if (weekday != null) {
        const expected = nextUtcWeekday(today, weekday);
        return dueAt.toISOString() === expected.toISOString();
    }

    if (phrase === "next week") {
        const expected = new Date(today);
        expected.setUTCDate(expected.getUTCDate() + 7);
        return dueAt.toISOString() === expected.toISOString();
    }
    if (phrase === "in 2 days") {
        const expected = new Date(today);
        expected.setUTCDate(expected.getUTCDate() + 2);
        return dueAt.toISOString() === expected.toISOString();
    }

    // Unsupported duePhrase: reject (do not count as a hit).
    return null;
}

export function evaluateClassifierGold(
    gold: GoldFile,
    now: Date = DEFAULT_NOW
): ClassifierEvalReport {
    let typeCorrect = 0;
    let actionableCorrect = 0;
    let assigneeLabeled = 0;
    let assigneeHits = 0;
    let dueLabeled = 0;
    let dueHits = 0;
    let priorityLabeled = 0;
    let priorityHits = 0;
    let titleChecks = 0;
    let titlePasses = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of gold.cases) {
        const classification = classifyMessageWithRegex(row.content);
        if (classification.semanticType === row.semanticType) {
            typeCorrect += 1;
        } else {
            failures.push({
                id: row.id,
                reason: `type expected=${row.semanticType} got=${classification.semanticType}`,
            });
        }

        const actionable = isActionableClassification(classification);
        if (actionable === row.actionable) {
            actionableCorrect += 1;
        } else {
            failures.push({
                id: row.id,
                reason: `actionable expected=${row.actionable} got=${actionable}`,
            });
        }

        const entities = extractEntitiesFromContent(row.content, {
            participants: row.participants,
            now,
        });

        if (row.assigneeUsernames?.length) {
            assigneeLabeled += 1;
            const expectedIds = new Set(
                (row.participants ?? [])
                    .filter((p) => row.assigneeUsernames?.includes(p.username ?? ""))
                    .map((p) => p.userId)
            );
            const hit = [...expectedIds].every((id) => entities.assigneeUserIds.includes(id))
                && entities.assigneeUserIds.length === expectedIds.size;
            if (hit) {
                assigneeHits += 1;
            } else {
                failures.push({
                    id: row.id,
                    reason: `assignee expected=${[...expectedIds].join(",")} got=${entities.assigneeUserIds.join(",")}`,
                });
            }
        }

        if (row.duePhrase || row.dueAtIso) {
            dueLabeled += 1;
            const match = dueMatches(row, entities.dueAtCandidate, now);
            if (match === true) {
                dueHits += 1;
            } else {
                failures.push({
                    id: row.id,
                    reason: match === null
                        ? `due unsupported phrase=${row.duePhrase}`
                        : `due expected=${row.dueAtIso ?? row.duePhrase} got=${entities.dueAtCandidate?.toISOString() ?? "null"}`,
                });
            }
        }

        if (row.priority) {
            priorityLabeled += 1;
            if (entities.priorityCandidate === row.priority) {
                priorityHits += 1;
            } else {
                failures.push({
                    id: row.id,
                    reason: `priority expected=${row.priority} got=${entities.priorityCandidate || "\"\""}`,
                });
            }
        }

        const minLen = row.titleMinLength ?? 3;
        titleChecks += 1;
        const title = titleFromContent(row.content);
        if (title.trim().length >= minLen) {
            titlePasses += 1;
        } else {
            failures.push({ id: row.id, reason: `title too short: "${title}"` });
        }
    }

    const total = gold.cases.length;
    return {
        total,
        typeCorrect,
        typeAccuracy: total ? typeCorrect / total : 0,
        actionableCorrect,
        actionableAccuracy: total ? actionableCorrect / total : 0,
        assigneeLabeled,
        assigneeHits,
        assigneeHitRate: assigneeLabeled ? assigneeHits / assigneeLabeled : null,
        dueLabeled,
        dueHits,
        dueHitRate: dueLabeled ? dueHits / dueLabeled : null,
        priorityLabeled,
        priorityHits,
        priorityHitRate: priorityLabeled ? priorityHits / priorityLabeled : null,
        titleChecks,
        titlePasses,
        titlePassRate: titleChecks ? titlePasses / titleChecks : null,
        failures,
    };
}
