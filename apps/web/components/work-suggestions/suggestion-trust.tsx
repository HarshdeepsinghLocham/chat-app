import type { WorkSuggestionRecord } from "@semantask/types";
import {
    suggestionConfidencePercent,
    suggestionPolicyLabel,
    suggestionSignalLabels,
    suggestionToolLabel,
} from "@/lib/work-suggestions/trust";

export function SuggestionTrustPanel({ suggestion }: { suggestion: WorkSuggestionRecord }) {
    const signals = suggestionSignalLabels(suggestion);
    const toolLabel = suggestionToolLabel(suggestion);
    const policyLabel = suggestionPolicyLabel(suggestion);

    return (
        <div className="space-y-2" data-testid="suggestion-trust">
            <p className="text-sm" data-testid="suggestion-confidence">
                <span className="font-medium">{suggestionConfidencePercent(suggestion)}% confidence</span>
            </p>
            {signals.length > 0 ? (
                <div data-testid="suggestion-why">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Why this suggestion?
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                        {signals.map((label) => (
                            <li key={label}>{label}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {toolLabel ? (
                <p className="text-sm" data-testid="suggestion-tool">
                    Suggested action: {toolLabel}
                </p>
            ) : null}
            {policyLabel ? (
                <p className="text-sm" data-testid="suggestion-execution-policy">
                    Execution: {policyLabel}
                </p>
            ) : null}
            {suggestion.possibleDuplicateTaskId ? (
                <p className="text-sm text-muted-foreground" data-testid="suggestion-duplicate-hint">
                    Similar open work already exists in this conversation. Accept only if this is new.
                </p>
            ) : null}
        </div>
    );
}
