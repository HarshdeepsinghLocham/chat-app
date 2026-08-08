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

function isExecutionModeValue(value: unknown): value is ExecutionMode {
    return typeof value === "string"
        && (EXECUTION_MODES as readonly string[]).includes(value);
}

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

/** Parse DEFAULT_EXECUTION_MODE (default suggest_only). */
export function parseDefaultExecutionMode(raw?: string | null): ExecutionMode {
    const value = (raw ?? process.env.DEFAULT_EXECUTION_MODE ?? "suggest_only").trim().toLowerCase();
    return isExecutionModeValue(value) ? value : "suggest_only";
}

/** EXECUTION_MODE_ENFORCE=0|1 (default 0 / shadow). */
export function isExecutionModeEnforce(raw?: string | null): boolean {
    const value = (raw ?? process.env.EXECUTION_MODE_ENFORCE ?? "0").trim().toLowerCase();
    return value === "1" || value === "true" || value === "enforce";
}

function isEnvFlagEnabled(raw: string | null | undefined, defaultEnabled: boolean): boolean {
    const source = raw ?? (defaultEnabled ? "1" : "0");
    const value = source.trim().toLowerCase();
    if (value === "1" || value === "true" || value === "on") {
        return true;
    }
    if (value === "0" || value === "false" || value === "off") {
        return false;
    }
    return defaultEnabled;
}

/** SUGGESTION_INGRESS=0|1 (default 0). Dual-write WorkSuggestion on classify. */
export function isSuggestionIngressEnabled(raw?: string | null): boolean {
    return isEnvFlagEnabled(raw ?? process.env.SUGGESTION_INGRESS, false);
}

/**
 * SUGGESTION_BLOCK_EXEC=0|1 (default 1).
 * When enabled with effective suggest_only, hard-block execution enqueue.
 */
export function isSuggestionBlockExecEnabled(raw?: string | null): boolean {
    return isEnvFlagEnabled(raw ?? process.env.SUGGESTION_BLOCK_EXEC, true);
}

/** True when execution enqueue must be refused for the given effective mode. */
export function shouldBlockExecutionEnqueue(executionMode: ExecutionMode): boolean {
    return isSuggestionBlockExecEnabled() && executionMode === "suggest_only";
}

export function parseGrandfatherAutoTenants(raw?: string | null): Set<string> {
    const source = raw ?? process.env.GRANDFATHER_AUTO_TENANTS ?? "";
    return new Set(
        source
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
    );
}

/**
 * Resolve effective workspace execution mode.
 * Grandfather list → org field → DEFAULT_EXECUTION_MODE / suggest_only.
 * Missing org field is treated as suggest_only via the default env path.
 */
export function getEffectiveExecutionMode(args: {
    organizationId?: string | null;
    executionMode?: ExecutionMode | null;
}): ExecutionMode {
    const organizationId = args.organizationId ?? null;
    if (organizationId && parseGrandfatherAutoTenants().has(organizationId)) {
        return "auto_execute";
    }
    if (args.executionMode && isExecutionModeValue(args.executionMode)) {
        return args.executionMode;
    }
    return parseDefaultExecutionMode();
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
