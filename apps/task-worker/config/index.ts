export {
    getAgentModelOrDefault,
    getClassifierModel,
    getClassifierTimeoutMs,
    getLlmApiKey,
    getLlmLogRequests,
    getLlmProviderConfig,
    getLlmTimeoutMs,
    getPlannerModel,
    getReflectionModel,
} from "./llm.js";
export {
    getFsmMigrationConfig,
    getFsmRollout,
    getTaskStateProjectionMode,
    isFsmShadowEnabled,
    isPolicyShadowEmitEnabled,
    isRetryShadowEmitEnabled,
    isStateDivergenceCheckEnabled,
    type FsmMigrationConfig,
    type FsmRollout,
    type TaskStateProjectionMode,
} from "./migration.js";
export {
    getEnvAllowedEmailDomains,
    getGitHubIssueConfig,
    getResendConfig,
    getScheduleMeetingWebhookUrl,
    getWorkerToolsConfig,
    type GitHubIssueConfig,
    type ResendConfig,
} from "./tools.js";
export {
    getLeaseMs,
    getRedisUrl,
    getSocketServerUrl,
    getStuckHeartbeatMs,
    getStuckRemediationMode,
    getWorkerRuntimeConfig,
    LEASE_MS_FALLBACK,
    type StuckRemediationMode,
    type WorkerRuntimeConfig,
} from "./worker.js";
export { warnDeprecatedWorkerAliases } from "./aliases.js";

import { getLlmProviderConfig } from "./llm.js";
import { getFsmMigrationConfig } from "./migration.js";
import { getWorkerToolsConfig } from "./tools.js";
import { getWorkerRuntimeConfig } from "./worker.js";

export function getWorkerConfig() {
    return {
        runtime: getWorkerRuntimeConfig(),
        llm: getLlmProviderConfig(),
        fsm: getFsmMigrationConfig(),
        tools: getWorkerToolsConfig(),
    };
}
