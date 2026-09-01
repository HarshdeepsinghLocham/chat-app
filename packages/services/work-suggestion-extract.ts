import type {
    ExecutionMode,
    SuggestionConfidenceSignal,
    SuggestionExecutionPolicy,
    SuggestedWorkTool,
} from "@semantask/types";

const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const FILLER_WORDS = /\b(professional|kindly|please|urgently|asap)\b/gi;
const LEADING_POLITE = /^(please\s+|can you\s+|could you\s+|would you\s+|will you\s+)/i;
const CREATE_TASK_META = /^(please\s+)?create a task to\s+/i;
const ARTICLES = /\b(a|an|the)\b/gi;
const HIGH_RISK_ALWAYS_APPROVAL = new Set<string>(["send_email"]);

export type DistillWorkSuggestionInput = {
    content: string;
    actionVerb?: string;
    objectText?: string;
    dueAtCandidate?: Date | string | null;
};

export type DistilledWorkSuggestion = {
    title: string;
    requestedOutcome: string;
    summary: string;
    suggestedTool: SuggestedWorkTool | null;
    confidenceSignals: SuggestionConfidenceSignal[];
    titleKey: string;
};

export function normalizeWorkTitleKey(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContent(content: string): string {
    return content.trim().replace(/\s+/g, " ");
}

function stripDuePhrases(text: string): string {
    return text
        .replace(new RegExp(`\\s+by\\s+(?:this\\s+)?(?:${WEEKDAYS})\\b`, "ig"), "")
        .replace(new RegExp(`\\s+on\\s+(?:this\\s+)?(?:${WEEKDAYS})\\b`, "ig"), "")
        .replace(/\s+by\s+(today|tonight|tomorrow)\b/gi, "")
        .replace(/\s+in\s+\d{1,3}\s+days?\b/gi, "")
        .replace(/\s+by\s+next\s+week\b/gi, "")
        .replace(/\s+by\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
        .replace(/\s+by\s+\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/gi, "")
        .replace(/[.,;:!?]+$/g, "")
        .trim();
}

function capitalizeFirst(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripArticles(text: string): string {
    return text.replace(ARTICLES, " ").replace(/\s+/g, " ").trim();
}

/**
 * Distill a chat request into a work title.
 * "Send a professional welcome email to the new hire by Friday."
 * → "Send welcome email to new hire"
 */
export function distillWorkTitle(content: string, actionVerb = ""): string {
    let text = normalizeContent(content);
    if (!text) return "Follow up";

    text = text.replace(LEADING_POLITE, "");
    text = text.replace(CREATE_TASK_META, "");
    text = stripDuePhrases(text);
    text = text.replace(FILLER_WORDS, " ").replace(/\s+/g, " ").trim();
    text = text.replace(/^(@\w+[:,]?\s*)+/, "").trim();

    if (actionVerb) {
        const verbPattern = new RegExp(`^${actionVerb}\\b`, "i");
        if (verbPattern.test(text)) {
            const rest = text.replace(verbPattern, "").trim();
            text = `${capitalizeFirst(actionVerb)} ${stripArticles(rest)}`.trim();
        } else {
            text = stripArticles(text);
            text = capitalizeFirst(text);
        }
    } else {
        text = stripArticles(text);
        text = capitalizeFirst(text);
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text.length < 3) {
        const fallback = stripArticles(stripDuePhrases(normalizeContent(content)));
        text = capitalizeFirst(fallback).slice(0, 200);
    }

    const trimmed = text.slice(0, 200).trim();
    return trimmed.length >= 3 ? trimmed : "Follow up";
}

export function buildRequestedOutcome(content: string, dueAtCandidate?: Date | string | null): string {
    const normalized = normalizeContent(content);
    if (!normalized) {
        return "No additional context was provided.";
    }

    const strippedMeta = normalized.replace(LEADING_POLITE, "").replace(CREATE_TASK_META, "");
    const lower = strippedMeta.toLowerCase();

    if (/^send\b/.test(lower)) {
        const rest = strippedMeta.replace(/^send\b/i, "").trim();
        const withoutDue = stripDuePhrases(rest);
        const object = withoutDue.replace(/^[.,\s]+/, "").replace(/[.,;:!?]+$/g, "");
        const dueSuffix = duePhraseSuffix(strippedMeta, dueAtCandidate);
        const subject = object.charAt(0).toUpperCase() + object.slice(1);
        return `${subject} is sent${dueSuffix}.`;
    }

    const capitalized = strippedMeta.charAt(0).toUpperCase() + strippedMeta.slice(1);
    const withPeriod = /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    return withPeriod;
}

function duePhraseSuffix(content: string, dueAtCandidate?: Date | string | null): string {
    const match = content.match(
        new RegExp(`\\bby\\s+((?:this\\s+)?(?:${WEEKDAYS})|today|tonight|tomorrow|next\\s+week|20\\d{2}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/20\\d{2})?)\\b`, "i")
    );
    if (match?.[1]) {
        return ` by ${match[1].toLowerCase()}`;
    }
    if (dueAtCandidate) {
        const date = dueAtCandidate instanceof Date ? dueAtCandidate : new Date(dueAtCandidate);
        if (!Number.isNaN(date.getTime())) {
            return ` by ${date.toISOString().slice(0, 10)}`;
        }
    }
    return "";
}

export function inferSuggestedTool(content: string, actionVerb = ""): SuggestedWorkTool | null {
    const lower = `${actionVerb} ${content}`.toLowerCase();

    if (/\bemail\b/.test(lower) && /\b(send|email)\b/.test(lower)) {
        return "send_email";
    }
    if (/\bgithub\b/.test(lower) && /\bissue\b/.test(lower)) {
        return "create_github_issue";
    }
    if (
        /\b(schedule|book)\b/.test(lower)
        && /\b(meeting|meet|call|calendar)\b/.test(lower)
    ) {
        return "schedule_meeting";
    }
    if (/\bschedule_meeting\b/.test(lower) || (/\bmeeting\b/.test(lower) && /\bcalendar\b/.test(lower))) {
        return "schedule_meeting";
    }

    return null;
}

export function buildConfidenceSignals(input: {
    actionVerb?: string;
    objectText?: string;
    dueAtCandidate?: Date | string | null;
    suggestedTool?: SuggestedWorkTool | null;
}): SuggestionConfidenceSignal[] {
    const signals: SuggestionConfidenceSignal[] = [];
    if (input.actionVerb && input.actionVerb.trim().length > 0) {
        signals.push("explicit_action");
    }
    const object = (input.objectText ?? "").trim();
    if (object.length >= 3 || input.suggestedTool) {
        signals.push("recipient_or_object");
    }
    if (input.dueAtCandidate) {
        signals.push("deadline");
    }
    return signals;
}

export function distillWorkSuggestion(input: DistillWorkSuggestionInput): DistilledWorkSuggestion {
    const content = normalizeContent(input.content);
    const actionVerb = (input.actionVerb ?? "").trim();
    const title = distillWorkTitle(content, actionVerb);
    const requestedOutcome = buildRequestedOutcome(content, input.dueAtCandidate);
    const suggestedTool = inferSuggestedTool(content, actionVerb);
    const confidenceSignals = buildConfidenceSignals({
        actionVerb,
        objectText: input.objectText ?? content,
        dueAtCandidate: input.dueAtCandidate,
        suggestedTool,
    });

    return {
        title,
        requestedOutcome,
        summary: `Requested outcome: ${requestedOutcome}`,
        suggestedTool,
        confidenceSignals,
        titleKey: normalizeWorkTitleKey(title),
    };
}

export type SuggestionPolicyInput = {
    tool: string | null;
    toolDenyList?: string[] | null;
    requireApprovalFor?: string[] | null;
    executionMode?: ExecutionMode | null;
};

/**
 * Stamp-only policy for the suggestion UI. Runtime enforcement remains in the worker.
 */
export function resolveSuggestionExecutionPolicy(
    input: SuggestionPolicyInput
): SuggestionExecutionPolicy {
    const tool = input.tool?.trim().toLowerCase() || null;
    const deny = (input.toolDenyList ?? []).map((entry) => entry.toLowerCase());
    const requireApproval = (input.requireApprovalFor ?? []).map((entry) => entry.toLowerCase());

    if (tool && deny.includes(tool)) {
        return "prohibited";
    }

    if (!tool) {
        return "approval_required";
    }

    if (input.executionMode === "suggest_only") {
        return "approval_required";
    }

    if (HIGH_RISK_ALWAYS_APPROVAL.has(tool) || requireApproval.includes(tool)) {
        return "approval_required";
    }

    if (input.executionMode === "auto_execute") {
        return "auto_execute_allowed";
    }

    return "approval_required";
}
