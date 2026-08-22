import { Types } from "mongoose";
import { connectToDatabase } from "@semantask/db";
import OrganizationPolicyModel, {
    EXECUTION_MODES,
    PROMPT_GUARD_MODES,
    type IOrganizationPolicy,
    type OrganizationExecutionMode,
    type PromptGuardMode,
} from "@semantask/db/models/OrganizationPolicy";
import type { ExecutionMode } from "@semantask/types";
import { assertCanManageMembers, assertMembership } from "./organization.service";
import { AuthorizationError } from "./authorization-errors";
import { ValidationError } from "./organization-errors";
import {
    getEffectiveExecutionMode,
    isExecutionModeValue,
} from "./config/execution";

export {
    getEffectiveExecutionMode,
    isExecutionModeEnforce,
    parseDefaultExecutionMode,
    parseGrandfatherAutoTenants,
} from "./config/execution";
export {
    assertAcceptCreatesCoordinationOnly,
    isAcceptCreatesExecutionEnabled,
    isSuggestionBlockExecEnabled,
    isSuggestionIngressEnabled,
    isWorkInboxUiEnabled,
    shouldBlockExecutionEnqueue,
} from "./config/flags";

export type ResolvedOrganizationPolicy = {
    organizationId: string;
    version: number;
    confidenceThresholds: Record<string, number> | null;
    allowedEmailDomains: string[] | null;
    requireApprovalFor: string[];
    toolDenyList: string[];
    defaultToolGrants: string[];
    promptGuardMode: PromptGuardMode | null;
    executionMode: ExecutionMode | null;
};

function isValidObjectId(value: string | null | undefined): value is string {
    return Boolean(value && Types.ObjectId.isValid(value));
}

function asStringArray(value: unknown): string[] | null {
    if (value === null || value === undefined) return null;
    if (!Array.isArray(value)) return null;
    return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
}

function normalizeConfidenceThresholds(
    value: Record<string, number> | null | undefined
): Record<string, number> | null {
    if (value === null || value === undefined) {
        return value ?? null;
    }

    const normalized: Record<string, number> = {};
    for (const [key, threshold] of Object.entries(value)) {
        if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            throw new ValidationError(
                `confidenceThresholds.${key} must be a finite number in [0, 1]`
            );
        }
        normalized[key] = threshold;
    }
    return normalized;
}

function normalizeStoredExecutionMode(
    value: OrganizationExecutionMode | null | undefined
): ExecutionMode | null {
    if (value == null) return null;
    return isExecutionModeValue(value) ? value : null;
}

export async function getOrganizationPolicy(
    organizationId: string
): Promise<IOrganizationPolicy | null> {
    if (!isValidObjectId(organizationId)) {
        return null;
    }

    await connectToDatabase();
    return OrganizationPolicyModel.findOne({
        organizationId: new Types.ObjectId(organizationId),
    }).lean<IOrganizationPolicy>();
}

export async function resolveOrganizationPolicy(
    organizationId: string | null | undefined
): Promise<ResolvedOrganizationPolicy | null> {
    if (!organizationId) {
        return null;
    }

    const doc = await getOrganizationPolicy(organizationId);
    if (!doc) {
        return {
            organizationId,
            version: 0,
            confidenceThresholds: null,
            allowedEmailDomains: null,
            requireApprovalFor: [],
            toolDenyList: [],
            defaultToolGrants: [],
            promptGuardMode: null,
            executionMode: null,
        };
    }

    return {
        organizationId,
        version: doc.version,
        confidenceThresholds: doc.confidenceThresholds ?? null,
        allowedEmailDomains: doc.allowedEmailDomains?.length
            ? doc.allowedEmailDomains.map((d) => d.toLowerCase())
            : null,
        requireApprovalFor: (doc.requireApprovalFor ?? []).map((t) => t.toLowerCase()),
        toolDenyList: (doc.toolDenyList ?? []).map((t) => t.toLowerCase()),
        defaultToolGrants: (doc.defaultToolGrants ?? []).map((t) => t.toLowerCase()),
        promptGuardMode: doc.promptGuardMode ?? null,
        executionMode: normalizeStoredExecutionMode(doc.executionMode),
    };
}

export type UpsertOrganizationPolicyInput = {
    organizationId: string;
    actorUserId: string;
    confidenceThresholds?: Record<string, number> | null;
    allowedEmailDomains?: string[] | null;
    requireApprovalFor?: string[] | null;
    toolDenyList?: string[] | null;
    defaultToolGrants?: string[] | null;
    promptGuardMode?: PromptGuardMode | null;
    executionMode?: ExecutionMode | null;
};

export async function upsertOrganizationPolicy(
    input: UpsertOrganizationPolicyInput
): Promise<IOrganizationPolicy> {
    await assertCanManageMembers(input.organizationId, input.actorUserId);

    if (
        input.promptGuardMode != null
        && !PROMPT_GUARD_MODES.includes(input.promptGuardMode)
    ) {
        throw new ValidationError("Invalid promptGuardMode");
    }

    if (
        input.executionMode != null
        && !(EXECUTION_MODES as readonly string[]).includes(input.executionMode)
    ) {
        throw new ValidationError("Invalid executionMode");
    }

    await connectToDatabase();

    const organizationObjectId = new Types.ObjectId(input.organizationId);
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const previous = await OrganizationPolicyModel.findOne({
            organizationId: organizationObjectId,
        }).lean<IOrganizationPolicy>();
        const previousMode = normalizeStoredExecutionMode(previous?.executionMode);

        const $set: Record<string, unknown> = {};
        if (input.confidenceThresholds !== undefined) {
            $set.confidenceThresholds = normalizeConfidenceThresholds(input.confidenceThresholds);
        }
        if (input.allowedEmailDomains !== undefined) {
            $set.allowedEmailDomains = asStringArray(input.allowedEmailDomains);
        }
        if (input.requireApprovalFor !== undefined) {
            $set.requireApprovalFor = asStringArray(input.requireApprovalFor) ?? [];
        }
        if (input.toolDenyList !== undefined) {
            $set.toolDenyList = asStringArray(input.toolDenyList) ?? [];
        }
        if (input.defaultToolGrants !== undefined) {
            $set.defaultToolGrants = asStringArray(input.defaultToolGrants) ?? [];
        }
        if (input.promptGuardMode !== undefined) {
            $set.promptGuardMode = input.promptGuardMode;
        }

        let executionModeChanged = false;
        if (input.executionMode !== undefined) {
            $set.executionMode = input.executionMode;
            if (previousMode !== input.executionMode) {
                executionModeChanged = true;
                $set.executionModeUpdatedAt = new Date();
                if (isValidObjectId(input.actorUserId)) {
                    $set.executionModeUpdatedBy = new Types.ObjectId(input.actorUserId);
                }
            }
        }

        const filter: Record<string, unknown> = {
            organizationId: organizationObjectId,
        };
        if (previous) {
            filter.version = previous.version;
        }

        try {
            const updated = await OrganizationPolicyModel.findOneAndUpdate(
                filter,
                {
                    $set,
                    $inc: { version: 1 },
                    $setOnInsert: {
                        organizationId: organizationObjectId,
                    },
                },
                {
                    upsert: !previous,
                    new: true,
                }
            ).lean<IOrganizationPolicy>();

            if (!updated) {
                // Version compare-and-swap miss — another writer won; retry.
                continue;
            }

            if (executionModeChanged) {
                console.info(JSON.stringify({
                    event: "policy.execution_mode.changed",
                    organizationId: input.organizationId,
                    actorUserId: input.actorUserId,
                    previousMode,
                    executionMode: normalizeStoredExecutionMode(updated.executionMode)
                        ?? input.executionMode,
                    version: updated.version,
                }));
            }

            return updated;
        } catch (error) {
            const maybeMongo = error as { code?: number };
            if (maybeMongo?.code === 11000) {
                continue;
            }
            throw error;
        }
    }

    throw new Error("Failed to upsert organization policy after concurrent retries");
}

export async function getOrganizationPolicyForViewer(
    organizationId: string,
    actorUserId: string
): Promise<IOrganizationPolicy | null> {
    await assertMembership(organizationId, actorUserId);
    return getOrganizationPolicy(organizationId);
}

export function serializeOrganizationPolicy(doc: IOrganizationPolicy | null, organizationId: string) {
    if (!doc) {
        return {
            organizationId,
            version: 0,
            confidenceThresholds: null,
            allowedEmailDomains: null,
            requireApprovalFor: [],
            toolDenyList: [],
            defaultToolGrants: [],
            promptGuardMode: null,
            executionMode: null,
            effectiveExecutionMode: getEffectiveExecutionMode({ organizationId, executionMode: null }),
        };
    }

    const executionMode = normalizeStoredExecutionMode(doc.executionMode);

    return {
        organizationId: doc.organizationId.toString(),
        version: doc.version,
        confidenceThresholds: doc.confidenceThresholds ?? null,
        allowedEmailDomains: doc.allowedEmailDomains ?? null,
        requireApprovalFor: doc.requireApprovalFor ?? [],
        toolDenyList: doc.toolDenyList ?? [],
        defaultToolGrants: doc.defaultToolGrants ?? [],
        promptGuardMode: doc.promptGuardMode ?? null,
        executionMode,
        effectiveExecutionMode: getEffectiveExecutionMode({
            organizationId: doc.organizationId.toString(),
            executionMode,
        }),
        executionModeUpdatedAt: doc.executionModeUpdatedAt?.toISOString?.() ?? null,
        updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    };
}

export { AuthorizationError };
