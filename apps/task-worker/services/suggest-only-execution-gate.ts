/**
 * S2.4 suggest_only exceptions for explicit manager request / human-approved re-entry.
 * Pure helpers so unit tests can cover the gate without booting the full worker.
 */

export type SuggestOnlyExecutionPayloadFlags = {
    humanApprovedExecution?: boolean;
    explicitManagerRequest?: boolean;
    needsApproval?: boolean;
};

/**
 * Skip the leaked-ingress fail-closed path when the event is an explicit manager
 * request (or needs approval) or a human-approved re-entry — not a silent accept leak.
 */
export function shouldSkipSuggestOnlyIngressFailClosed(
    payload: SuggestOnlyExecutionPayloadFlags
): boolean {
    return payload.humanApprovedExecution === true
        || payload.explicitManagerRequest === true
        || payload.needsApproval === true;
}

export type SuggestOnlyPolicyOverrideInput = {
    policyOutcome: string;
    modeDeniedBySuggestOnly: boolean;
    explicitManagerRequest?: boolean;
    needsApproval?: boolean;
    humanApprovedExecution?: boolean;
};

/**
 * Under suggest_only mode denial:
 * - explicit / needsApproval (not yet human-approved) → force approval_required
 * - humanApprovedExecution → bypass mode denial (grants/policy still apply elsewhere)
 */
export function resolveSuggestOnlyPolicyOverride(input: SuggestOnlyPolicyOverrideInput): {
    forceApprovalForExplicit: boolean;
    bypassSuggestOnlyAfterHumanApproval: boolean;
} {
    const forceApprovalForExplicit = input.policyOutcome === "blocked"
        && input.modeDeniedBySuggestOnly
        && (input.explicitManagerRequest === true || input.needsApproval === true)
        && input.humanApprovedExecution !== true;

    const bypassSuggestOnlyAfterHumanApproval = input.policyOutcome === "blocked"
        && input.modeDeniedBySuggestOnly
        && input.humanApprovedExecution === true;

    return { forceApprovalForExplicit, bypassSuggestOnlyAfterHumanApproval };
}
