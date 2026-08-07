import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
    applyExecutionModeGate,
    evaluateExecutionPolicy,
} from "../services/execution-policy.js";
import { getExecutionConfidenceThreshold } from "../services/execution-confidence.js";

afterEach(() => {
    delete process.env.TASK_EXECUTION_CONFIDENCE_THRESHOLDS;
    delete process.env.EXECUTION_MODE_ENFORCE;
    delete process.env.DEFAULT_EXECUTION_MODE;
    delete process.env.GRANDFATHER_AUTO_TENANTS;
});

test("actionType none with low confidence requires approval and cites intent", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.5,
        semanticType: "task",
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "approval_required");
    assert.equal(decision.threshold, 0.7);
    assert.equal(decision.confidence, 0.5);
    assert.equal(decision.semanticType, "task");
    assert.ok(decision.reasons.some((reason) => reason.includes('intent "task"')));
    assert.ok(decision.reasons.some((reason) => reason.includes("0.50 < 0.70")));
});

test("incident at 0.72 requires approval under default 0.75 threshold", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.72,
        semanticType: "incident",
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "approval_required");
    assert.equal(decision.threshold, 0.75);
});

test("task at 0.72 auto-executes under default 0.7 threshold", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.72,
        semanticType: "task",
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "auto_execute");
    assert.equal(decision.threshold, 0.7);
    assert.ok(decision.reasons.some((reason) => reason.includes("0.72 ≥ 0.70")));
});

test("env overlay raises task threshold", () => {
    process.env.TASK_EXECUTION_CONFIDENCE_THRESHOLDS = JSON.stringify({ task: 0.9 });
    assert.equal(getExecutionConfidenceThreshold("task"), 0.9);

    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.8,
        semanticType: "task",
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "approval_required");
    assert.equal(decision.threshold, 0.9);
});

test("send_email without recipients is blocked", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "send_email",
        confidence: 0.95,
        semanticType: "task",
        parameters: { to: [] },
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "blocked");
    assert.equal(decision.riskLevel, "high");
});

test("enforce + missing executionMode (suggest_only) blocks tools", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.95,
        semanticType: "task",
        executionModeEnforce: true,
    });

    assert.equal(decision.outcome, "blocked");
    assert.equal(decision.executionMode, "suggest_only");
    assert.equal(decision.executionModeEnforced, true);
    assert.ok(decision.reasons.includes("execution_mode:suggest_only"));
});

test("shadow mode keeps auto_execute for missing executionMode", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.95,
        semanticType: "task",
        executionModeEnforce: false,
    });

    assert.equal(decision.outcome, "auto_execute");
    assert.equal(decision.executionMode, "suggest_only");
    assert.equal(decision.executionModeEnforced, false);
});

test("enforce + require_approval caps auto_execute", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.95,
        semanticType: "task",
        organizationId: "507f1f77bcf86cd799439011",
        orgPolicy: {
            version: 1,
            executionMode: "require_approval",
        },
        executionModeEnforce: true,
    });

    assert.equal(decision.outcome, "approval_required");
    assert.equal(decision.executionMode, "require_approval");
    assert.ok(decision.reasons.some((reason) => reason.includes("execution_mode:require_approval")));
});

test("enforce + auto_execute org mode allows tools", () => {
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.95,
        semanticType: "task",
        organizationId: "507f1f77bcf86cd799439011",
        orgPolicy: {
            version: 1,
            executionMode: "auto_execute",
        },
        executionModeEnforce: true,
    });

    assert.equal(decision.outcome, "auto_execute");
    assert.equal(decision.executionMode, "auto_execute");
});

test("grandfather org resolves to auto_execute under enforce", () => {
    process.env.GRANDFATHER_AUTO_TENANTS = "507f1f77bcf86cd799439011";
    const decision = evaluateExecutionPolicy({
        actionType: "none",
        confidence: 0.95,
        semanticType: "task",
        organizationId: "507f1f77bcf86cd799439011",
        orgPolicy: {
            version: 0,
            executionMode: null,
        },
        executionModeEnforce: true,
    });

    assert.equal(decision.outcome, "auto_execute");
    assert.equal(decision.executionMode, "auto_execute");
});

test("applyExecutionModeGate is pure for suggest_only enforce", () => {
    const gated = applyExecutionModeGate(
        {
            outcome: "auto_execute",
            riskLevel: "low",
            reasons: ["ok"],
            confidence: 0.9,
            threshold: 0.7,
        },
        "suggest_only",
        true
    );
    assert.equal(gated.outcome, "blocked");
    assert.deepEqual(gated.reasons, ["execution_mode:suggest_only"]);
});
