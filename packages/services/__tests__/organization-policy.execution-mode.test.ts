import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const findOne = jest.fn();
const findOneAndUpdate = jest.fn();

jest.mock("@semantask/db/models/OrganizationPolicy", () => ({
    __esModule: true,
    default: {
        findOne: (...args: unknown[]) => findOne(...args),
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    },
    EXECUTION_MODES: ["suggest_only", "require_approval", "auto_execute"],
    PROMPT_GUARD_MODES: ["off", "monitor", "enforce"],
}));

jest.mock("../organization.service", () => ({
    assertCanManageMembers: jest.fn().mockResolvedValue(undefined),
    assertMembership: jest.fn().mockResolvedValue(undefined),
}));

import {
    assertAcceptCreatesCoordinationOnly,
    getEffectiveExecutionMode,
    isAcceptCreatesExecutionEnabled,
    isExecutionModeEnforce,
    isSuggestionBlockExecEnabled,
    isSuggestionIngressEnabled,
    isWorkInboxUiEnabled,
    parseDefaultExecutionMode,
    shouldBlockExecutionEnqueue,
    upsertOrganizationPolicy,
} from "../organization-policy.service";
import { ConflictError } from "../organization-errors";

const ENV_KEYS = [
    "DEFAULT_EXECUTION_MODE",
    "EXECUTION_MODE_ENFORCE",
    "GRANDFATHER_AUTO_TENANTS",
    "SUGGESTION_INGRESS",
    "SUGGESTION_BLOCK_EXEC",
    "ACCEPT_CREATES_EXECUTION",
    "WORK_INBOX_UI",
] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
    }
    findOne.mockReset();
    findOneAndUpdate.mockReset();
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
            organizationId: "507f1f77bcf86cd799439011",
            executionMode: "auto_execute",
        })).toBe("auto_execute");
    });

    it("grandfather list wins over missing field", () => {
        process.env.GRANDFATHER_AUTO_TENANTS = "507f1f77bcf86cd799439011";
        expect(getEffectiveExecutionMode({
            organizationId: "507f1f77bcf86cd799439011",
            executionMode: null,
        })).toBe("auto_execute");
    });
});

describe("execution mode flags", () => {
    it("parseDefaultExecutionMode falls back on invalid", () => {
        expect(parseDefaultExecutionMode("nope")).toBe("suggest_only");
        expect(parseDefaultExecutionMode("auto_execute")).toBe("auto_execute");
    });

    it("isExecutionModeEnforce defaults off", () => {
        expect(isExecutionModeEnforce()).toBe(false);
        expect(isExecutionModeEnforce("1")).toBe(true);
        expect(isExecutionModeEnforce("enforce")).toBe(true);
    });
});

describe("suggestion ingress flags", () => {
    it("isSuggestionIngressEnabled defaults off", () => {
        delete process.env.SUGGESTION_INGRESS;
        expect(isSuggestionIngressEnabled()).toBe(false);
        expect(isSuggestionIngressEnabled("1")).toBe(true);
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
    it("defaults WORK_INBOX_UI off", () => {
        delete process.env.WORK_INBOX_UI;
        expect(isWorkInboxUiEnabled()).toBe(false);
        expect(isWorkInboxUiEnabled("0")).toBe(false);
    });

    it("enables WORK_INBOX_UI when set", () => {
        expect(isWorkInboxUiEnabled("1")).toBe(true);
        expect(isWorkInboxUiEnabled("true")).toBe(true);
    });
});

describe("upsertOrganizationPolicy executionMode CAS", () => {
    it("retries on concurrent version conflict and audits the committed transition", async () => {
        const orgId = "507f1f77bcf86cd799439011";
        const actorId = "507f1f77bcf86cd799439012";
        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);

        findOne
            .mockReturnValueOnce({
                lean: async () => ({
                    organizationId: orgId,
                    version: 1,
                    executionMode: "suggest_only",
                }),
            })
            .mockReturnValueOnce({
                lean: async () => ({
                    organizationId: orgId,
                    version: 2,
                    executionMode: "require_approval",
                }),
            });

        findOneAndUpdate
            .mockReturnValueOnce({ lean: async () => null })
            .mockReturnValueOnce({
                lean: async () => ({
                    organizationId: orgId,
                    version: 3,
                    executionMode: "auto_execute",
                    executionModeUpdatedBy: actorId,
                }),
            });

        const updated = await upsertOrganizationPolicy({
            organizationId: orgId,
            actorUserId: actorId,
            executionMode: "auto_execute",
        });

        expect(updated.executionMode).toBe("auto_execute");
        expect(updated.version).toBe(3);
        expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(infoSpy).toHaveBeenCalledTimes(1);
        const audit = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
        expect(audit.event).toBe("policy.execution_mode.changed");
        expect(audit.previousMode).toBe("require_approval");
        expect(audit.executionMode).toBe("auto_execute");
        expect(audit.actorUserId).toBe(actorId);
        expect(audit.version).toBe(3);

        infoSpy.mockRestore();
    });
});
