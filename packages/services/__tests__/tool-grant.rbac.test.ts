import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { AuthorizationError } from "../authorization-errors";

const resolveOrganizationPolicy = jest.fn();

jest.mock("../organization-policy.service", () => ({
    resolveOrganizationPolicy: (...args: unknown[]) => resolveOrganizationPolicy(...args),
}));

import { assertToolGrant } from "../tool-grant.service";

const USER_ID = "507f1f77bcf86cd799439011";
const ORG_ID = "507f1f77bcf86cd799439012";

describe("TASK_TOOL_RBAC vs organization deny list", () => {
    const previous = process.env.TASK_TOOL_RBAC;

    beforeEach(() => {
        resolveOrganizationPolicy.mockReset();
    });

    afterEach(() => {
        if (previous === undefined) {
            delete process.env.TASK_TOOL_RBAC;
        } else {
            process.env.TASK_TOOL_RBAC = previous;
        }
    });

    it("still enforces org toolDenyList when TASK_TOOL_RBAC=off", async () => {
        process.env.TASK_TOOL_RBAC = "off";
        resolveOrganizationPolicy.mockResolvedValue({
            organizationId: ORG_ID,
            version: 1,
            toolDenyList: ["send_email"],
            defaultToolGrants: [],
            requireApprovalFor: [],
        });

        await expect(assertToolGrant(USER_ID, "send_email", null, ORG_ID))
            .rejects.toBeInstanceOf(AuthorizationError);
        expect(resolveOrganizationPolicy).toHaveBeenCalledWith(ORG_ID);
    });

    it("skips ToolGrant lookup when TASK_TOOL_RBAC=off and tool is not denied", async () => {
        process.env.TASK_TOOL_RBAC = "off";
        resolveOrganizationPolicy.mockResolvedValue({
            organizationId: ORG_ID,
            version: 1,
            toolDenyList: [],
            defaultToolGrants: [],
            requireApprovalFor: [],
        });

        await expect(assertToolGrant(USER_ID, "send_email", null, ORG_ID))
            .resolves.toBeUndefined();
    });
});
