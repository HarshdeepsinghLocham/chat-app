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

import { getLlmProviderConfig } from "./llm.js";
import { getWorkerRuntimeConfig } from "./worker.js";

export function getWorkerConfig() {
    return {
        runtime: getWorkerRuntimeConfig(),
        llm: getLlmProviderConfig(),
    };
}
