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
 * Skip the leaked-ingress fail-closed path only for the explicit manager
 * "Allow AI tools" request (or its human-approved re-entry) — not for generic
 * needsApproval / silent accept leaks.
 */
export function shouldSkipSuggestOnlyIngressFailClosed(
    payload: SuggestOnlyExecutionPayloadFlags
): boolean {
    return payload.humanApprovedExecution === true
        || payload.explicitManagerRequest === true;
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
 * - explicit manager request (not yet human-approved) → force approval_required
 * - humanApprovedExecution after that explicit path → bypass mode denial
 *   (grants/policy still apply elsewhere)
 */
export function resolveSuggestOnlyPolicyOverride(input: SuggestOnlyPolicyOverrideInput): {
    forceApprovalForExplicit: boolean;
    bypassSuggestOnlyAfterHumanApproval: boolean;
} {
    const forceApprovalForExplicit = input.policyOutcome === "blocked"
        && input.modeDeniedBySuggestOnly
        && input.explicitManagerRequest === true
        && input.humanApprovedExecution !== true;

    const bypassSuggestOnlyAfterHumanApproval = input.policyOutcome === "blocked"
        && input.modeDeniedBySuggestOnly
        && input.humanApprovedExecution === true
        && input.explicitManagerRequest === true;

    return { forceApprovalForExplicit, bypassSuggestOnlyAfterHumanApproval };
}
