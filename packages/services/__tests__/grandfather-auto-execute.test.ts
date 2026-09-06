import { beforeEach, describe, expect, it } from "@jest/globals";

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

const getOrganizationById = jest.fn();

jest.mock("../organization.service", () => ({
    assertCanManageMembers: jest.fn().mockResolvedValue(undefined),
    assertMembership: jest.fn().mockResolvedValue(undefined),
    getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
}));

import { applyGrandfatherAutoExecute } from "../organization-policy.service";

const ORG_A = "507f1f77bcf86cd799439011";
const ORG_B = "507f1f77bcf86cd799439012";

function leanOf(value: unknown) {
    return { lean: async () => value };
}

describe("applyGrandfatherAutoExecute", () => {
    beforeEach(() => {
        findOne.mockReset();
        findOneAndUpdate.mockReset();
        getOrganizationById.mockReset();
    });

    it("is a no-op for an empty list", async () => {
        const result = await applyGrandfatherAutoExecute({ organizationIds: [] });
        expect(result.ok).toBe(true);
        expect(result.rows).toEqual([]);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("fails closed on invalid or missing ids and writes nothing", async () => {
        getOrganizationById.mockImplementation(async (id: string) => (
            id === ORG_A ? { _id: ORG_A } : null
        ));
        findOne.mockReturnValue(leanOf(null));

        const result = await applyGrandfatherAutoExecute({
            organizationIds: ["not-an-id", ORG_A, ORG_B],
        });

        expect(result.ok).toBe(false);
        expect(result.rows).toEqual([
            { organizationId: "not-an-id", status: "invalid_id", previousMode: null },
            { organizationId: ORG_A, status: "would_apply", previousMode: null },
            { organizationId: ORG_B, status: "missing_org", previousMode: null },
        ]);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("dry-run reports would_apply without writing when executionMode is unset", async () => {
        getOrganizationById.mockResolvedValue({ _id: ORG_A });
        findOne.mockReturnValue(leanOf({
            organizationId: ORG_A,
            version: 1,
            executionMode: null,
        }));

        const result = await applyGrandfatherAutoExecute({
            organizationIds: [ORG_A, ` ${ORG_A} `],
            dryRun: true,
        });

        expect(result).toEqual({
            ok: true,
            dryRun: true,
            rows: [{
                organizationId: ORG_A,
                status: "would_apply",
                previousMode: null,
            }],
        });
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("skips orgs with any explicit execution mode", async () => {
        getOrganizationById.mockResolvedValue({ _id: "org" });
        findOne.mockImplementation((filter: { organizationId: { toString(): string } }) => {
            const id = String(filter.organizationId);
            if (id === ORG_A) {
                return leanOf({
                    organizationId: ORG_A,
                    version: 2,
                    executionMode: "auto_execute",
                });
            }
            return leanOf({
                organizationId: ORG_B,
                version: 1,
                executionMode: "require_approval",
            });
        });

        const result = await applyGrandfatherAutoExecute({
            organizationIds: [ORG_A, ORG_B],
        });

        expect(result.ok).toBe(true);
        expect(result.rows).toEqual([
            { organizationId: ORG_A, status: "already_auto_execute", previousMode: "auto_execute" },
            { organizationId: ORG_B, status: "already_explicit", previousMode: "require_approval" },
        ]);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("persists auto_execute only when executionMode is unset", async () => {
        getOrganizationById.mockResolvedValue({ _id: ORG_A });
        findOne.mockReturnValue(leanOf({
            organizationId: ORG_A,
            version: 1,
            executionMode: null,
        }));
        findOneAndUpdate.mockReturnValue(leanOf({
            organizationId: ORG_A,
            version: 2,
            executionMode: "auto_execute",
        }));

        const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
        const result = await applyGrandfatherAutoExecute({
            organizationIds: [ORG_A],
        });
        infoSpy.mockRestore();

        expect(result.ok).toBe(true);
        expect(result.rows).toEqual([
            { organizationId: ORG_A, status: "applied", previousMode: null },
        ]);
        expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter] = findOneAndUpdate.mock.calls[0] as [Record<string, unknown>];
        expect(filter).toMatchObject({
            version: 1,
            executionMode: null,
        });
    });
});
