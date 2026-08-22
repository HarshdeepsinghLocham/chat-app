import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
    assertAcceptCreatesCoordinationOnly,
    getClassifierMode,
    getEffectiveExecutionMode,
    isAcceptCreatesExecutionEnabled,
    isExecutionModeEnforce,
    isSuggestionBlockExecEnabled,
    isSuggestionIngressEnabled,
    isWorkInboxUiEnabled,
    parseDefaultExecutionMode,
    shouldBlockExecutionEnqueue,
} from "../config";
import { ConflictError } from "../organization-errors";

const ENV_KEYS = [
    "DEFAULT_EXECUTION_MODE",
    "EXECUTION_MODE_ENFORCE",
    "GRANDFATHER_AUTO_TENANTS",
    "SUGGESTION_INGRESS",
    "SUGGESTION_BLOCK_EXEC",
    "ACCEPT_CREATES_EXECUTION",
    "WORK_INBOX_UI",
    "TASK_CLASSIFIER_MODE",
] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
    }
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        const value = originalEnv[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

describe("getEffectiveExecutionMode", () => {
    const orgId = "507f1f77bcf86cd799439011";

    it("defaults missing field to suggest_only", () => {
        expect(getEffectiveExecutionMode({ organizationId: null, executionMode: null }))
            .toBe("suggest_only");
    });

    it("honors DEFAULT_EXECUTION_MODE for personal", () => {
        process.env.DEFAULT_EXECUTION_MODE = "require_approval";
        expect(getEffectiveExecutionMode({ executionMode: null })).toBe("require_approval");
    });

    it("uses org field when set", () => {
        expect(getEffectiveExecutionMode({
            organizationId: orgId,
            executionMode: "auto_execute",
        })).toBe("auto_execute");
    });

    it("overlay: env → org field → grandfather wins; personal skips org/grandfather", () => {
        process.env.DEFAULT_EXECUTION_MODE = "require_approval";
        process.env.GRANDFATHER_AUTO_TENANTS = orgId;

        expect(getEffectiveExecutionMode({ organizationId: null, executionMode: null }))
            .toBe("require_approval");
        expect(getEffectiveExecutionMode({
            organizationId: orgId,
            executionMode: "suggest_only",
        })).toBe("auto_execute");

        delete process.env.GRANDFATHER_AUTO_TENANTS;
        expect(getEffectiveExecutionMode({
            organizationId: orgId,
            executionMode: "suggest_only",
        })).toBe("suggest_only");
        expect(getEffectiveExecutionMode({
            organizationId: orgId,
            executionMode: null,
        })).toBe("require_approval");
    });

    it("grandfather list wins over missing field", () => {
        process.env.GRANDFATHER_AUTO_TENANTS = orgId;
        expect(getEffectiveExecutionMode({
            organizationId: orgId,
            executionMode: null,
        })).toBe("auto_execute");
    });
});

describe("execution mode flags", () => {
    it("parseDefaultExecutionMode falls back on invalid", () => {
        expect(parseDefaultExecutionMode("nope")).toBe("suggest_only");
        expect(parseDefaultExecutionMode("auto_execute")).toBe("auto_execute");
    });

    it("isExecutionModeEnforce defaults on", () => {
        delete process.env.EXECUTION_MODE_ENFORCE;
        expect(isExecutionModeEnforce()).toBe(true);
        expect(isExecutionModeEnforce("1")).toBe(true);
        expect(isExecutionModeEnforce("enforce")).toBe(true);
        expect(isExecutionModeEnforce("0")).toBe(false);
    });
});

describe("suggestion ingress flags", () => {
    it("isSuggestionIngressEnabled defaults on", () => {
        delete process.env.SUGGESTION_INGRESS;
        expect(isSuggestionIngressEnabled()).toBe(true);
        expect(isSuggestionIngressEnabled("1")).toBe(true);
        expect(isSuggestionIngressEnabled("0")).toBe(false);
    });

    it("isSuggestionBlockExecEnabled defaults on", () => {
        delete process.env.SUGGESTION_BLOCK_EXEC;
        expect(isSuggestionBlockExecEnabled()).toBe(true);
        expect(isSuggestionBlockExecEnabled("0")).toBe(false);
    });

    it("shouldBlockExecutionEnqueue requires suggest_only and block flag", () => {
        process.env.SUGGESTION_BLOCK_EXEC = "1";
        expect(shouldBlockExecutionEnqueue("suggest_only")).toBe(true);
        expect(shouldBlockExecutionEnqueue("auto_execute")).toBe(false);
        process.env.SUGGESTION_BLOCK_EXEC = "0";
        expect(shouldBlockExecutionEnqueue("suggest_only")).toBe(false);
    });
});

describe("accept creates execution safety rail", () => {
    it("defaults ACCEPT_CREATES_EXECUTION off", () => {
        delete process.env.ACCEPT_CREATES_EXECUTION;
        expect(isAcceptCreatesExecutionEnabled()).toBe(false);
        expect(() => assertAcceptCreatesCoordinationOnly()).not.toThrow();
    });

    it("fails closed when ACCEPT_CREATES_EXECUTION is enabled", () => {
        expect(isAcceptCreatesExecutionEnabled("1")).toBe(true);
        expect(() => assertAcceptCreatesCoordinationOnly("1")).toThrow(ConflictError);
    });
});

describe("work inbox UI flag", () => {
    it("defaults WORK_INBOX_UI on", () => {
        delete process.env.WORK_INBOX_UI;
        expect(isWorkInboxUiEnabled()).toBe(true);
        expect(isWorkInboxUiEnabled("0")).toBe(false);
    });

    it("enables WORK_INBOX_UI when set", () => {
        expect(isWorkInboxUiEnabled("1")).toBe(true);
        expect(isWorkInboxUiEnabled("true")).toBe(true);
    });
});

describe("classifier mode flag", () => {
    it("defaults TASK_CLASSIFIER_MODE to regex", () => {
        delete process.env.TASK_CLASSIFIER_MODE;
        expect(getClassifierMode()).toBe("regex");
        expect(getClassifierMode("shadow")).toBe("shadow");
        expect(getClassifierMode("llm")).toBe("llm");
        expect(getClassifierMode("nope")).toBe("regex");
    });
});
