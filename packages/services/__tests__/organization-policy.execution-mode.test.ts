import { afterEach, describe, expect, it } from "@jest/globals";

jest.mock("@semantask/db", () => ({
    connectToDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@semantask/db/models/OrganizationPolicy", () => ({
    __esModule: true,
    default: {},
    EXECUTION_MODES: ["suggest_only", "require_approval", "auto_execute"],
    PROMPT_GUARD_MODES: ["off", "monitor", "enforce"],
}));

jest.mock("../organization.service", () => ({
    assertCanManageMembers: jest.fn(),
    assertMembership: jest.fn(),
}));

import {
    getEffectiveExecutionMode,
    isExecutionModeEnforce,
    parseDefaultExecutionMode,
} from "../organization-policy.service";

afterEach(() => {
    delete process.env.DEFAULT_EXECUTION_MODE;
    delete process.env.EXECUTION_MODE_ENFORCE;
    delete process.env.GRANDFATHER_AUTO_TENANTS;
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
