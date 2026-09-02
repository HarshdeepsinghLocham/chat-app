import type { SuggestionConfidenceSignal, WorkSuggestionRecord } from "@semantask/types";

const SIGNAL_LABELS: Record<SuggestionConfidenceSignal, string> = {
    explicit_action: "explicit action detected",
    recipient_or_object: "recipient detected",
    deadline: "deadline detected",
};

const POLICY_LABELS: Record<string, string> = {
    approval_required: "Approval required",
    auto_execute_allowed: "May auto-execute",
    prohibited: "Prohibited",
};

const TOOL_LABELS: Record<string, string> = {
    send_email: "Send email",
    create_github_issue: "Create GitHub issue",
    schedule_meeting: "Schedule meeting",
};

export function suggestionOutcome(suggestion: WorkSuggestionRecord): string {
    return suggestion.requestedOutcome?.trim()
        || suggestion.summary?.trim()
        || "No outcome extracted.";
}

export function suggestionConfidencePercent(suggestion: WorkSuggestionRecord): number {
    return Math.round(suggestion.confidence * 100);
}

export function suggestionSignalLabels(suggestion: WorkSuggestionRecord): string[] {
    return (suggestion.confidenceSignals ?? []).map((signal) => SIGNAL_LABELS[signal] ?? signal);
}

export function suggestionToolLabel(suggestion: WorkSuggestionRecord): string | null {
    if (!suggestion.suggestedTool) return null;
    return TOOL_LABELS[suggestion.suggestedTool] ?? suggestion.suggestedTool;
}

export function suggestionPolicyLabel(suggestion: WorkSuggestionRecord): string | null {
    if (!suggestion.executionPolicy) return null;
    return POLICY_LABELS[suggestion.executionPolicy] ?? suggestion.executionPolicy;
}
