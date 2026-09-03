import type { MessageSemanticType } from "@semantask/types";

export const GLOBAL_EXECUTION_CONFIDENCE_BASELINE = 0.7;

export const DEFAULT_EXECUTION_CONFIDENCE_THRESHOLDS: Record<MessageSemanticType, number> = {
    task: 0.7,
    scheduling: 0.7,
    incident: 0.75,
    automation: 0.75,
    escalation: 0.85,
    approval: 0.9,
    chat: 0.7,
    unknown: 0.7,
};

/** Code default when no org `confidenceThresholds` entry applies. Org policy overlays win. */
export function getExecutionConfidenceThreshold(
    semanticType?: MessageSemanticType | string | null
): number {
    if (!semanticType || !(semanticType in DEFAULT_EXECUTION_CONFIDENCE_THRESHOLDS)) {
        return DEFAULT_EXECUTION_CONFIDENCE_THRESHOLDS.unknown
            ?? GLOBAL_EXECUTION_CONFIDENCE_BASELINE;
    }

    const typed = semanticType as MessageSemanticType;
    return DEFAULT_EXECUTION_CONFIDENCE_THRESHOLDS[typed];
}
