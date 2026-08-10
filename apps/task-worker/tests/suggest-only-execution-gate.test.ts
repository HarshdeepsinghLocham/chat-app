import assert from "node:assert/strict";
import { test } from "node:test";
import {
    resolveSuggestOnlyPolicyOverride,
    shouldSkipSuggestOnlyIngressFailClosed,
} from "../services/suggest-only-execution-gate.js";

test("leaked suggest_only events do not skip fail-closed", () => {
    assert.equal(shouldSkipSuggestOnlyIngressFailClosed({}), false);
    assert.equal(
        shouldSkipSuggestOnlyIngressFailClosed({
            explicitManagerRequest: false,
            needsApproval: false,
            humanApprovedExecution: false,
        }),
        false
    );
});

test("needsApproval alone does not skip ingress fail-closed", () => {
    assert.equal(
        shouldSkipSuggestOnlyIngressFailClosed({ needsApproval: true }),
        false
    );
});

test("explicit manager request skips ingress fail-closed", () => {
    assert.equal(
        shouldSkipSuggestOnlyIngressFailClosed({ explicitManagerRequest: true }),
        true
    );
});

test("human-approved re-entry skips ingress fail-closed", () => {
    assert.equal(
        shouldSkipSuggestOnlyIngressFailClosed({ humanApprovedExecution: true }),
        true
    );
});

test("suggest_only + explicit → force approval_required (pending)", () => {
    const result = resolveSuggestOnlyPolicyOverride({
        policyOutcome: "blocked",
        modeDeniedBySuggestOnly: true,
        explicitManagerRequest: true,
        needsApproval: true,
        humanApprovedExecution: false,
    });
    assert.equal(result.forceApprovalForExplicit, true);
    assert.equal(result.bypassSuggestOnlyAfterHumanApproval, false);
});

test("suggest_only + needsApproval without explicit does not force approval", () => {
    const result = resolveSuggestOnlyPolicyOverride({
        policyOutcome: "blocked",
        modeDeniedBySuggestOnly: true,
        explicitManagerRequest: false,
        needsApproval: true,
        humanApprovedExecution: false,
    });
    assert.equal(result.forceApprovalForExplicit, false);
    assert.equal(result.bypassSuggestOnlyAfterHumanApproval, false);
});

test("suggest_only + humanApproved without explicit does not bypass", () => {
    const result = resolveSuggestOnlyPolicyOverride({
        policyOutcome: "blocked",
        modeDeniedBySuggestOnly: true,
        explicitManagerRequest: false,
        needsApproval: false,
        humanApprovedExecution: true,
    });
    assert.equal(result.forceApprovalForExplicit, false);
    assert.equal(result.bypassSuggestOnlyAfterHumanApproval, false);
});

test("suggest_only + explicit + humanApproved → bypass mode denial", () => {
    const result = resolveSuggestOnlyPolicyOverride({
        policyOutcome: "blocked",
        modeDeniedBySuggestOnly: true,
        explicitManagerRequest: true,
        needsApproval: false,
        humanApprovedExecution: true,
    });
    assert.equal(result.forceApprovalForExplicit, false);
    assert.equal(result.bypassSuggestOnlyAfterHumanApproval, true);
});

test("non-suggest_only blocks do not force approval or bypass", () => {
    const result = resolveSuggestOnlyPolicyOverride({
        policyOutcome: "blocked",
        modeDeniedBySuggestOnly: false,
        explicitManagerRequest: true,
        humanApprovedExecution: true,
    });
    assert.equal(result.forceApprovalForExplicit, false);
    assert.equal(result.bypassSuggestOnlyAfterHumanApproval, false);
});
