import { getLlmProviderConfig } from "../../config/llm.js";
import { BaseLLMProvider } from "./base-provider.js";
import { HuggingFaceProvider } from "./providers/huggingface-provider.js";
import { OpenAIProvider } from "./providers/openai-provider.js";
import { LLMError, type LLMProviderConfig, type LLMProviderStartupReport } from "./types.js";
import { recommendProviderForTask, type LLMTaskProfile, type ProviderRecommendation } from "./recommendations.js";
import { validateLLMProviderStartup } from "./startup.js";

function buildConfig(): LLMProviderConfig {
    return getLlmProviderConfig();
}

function applyProviderDefaults(config: LLMProviderConfig, overrides: Partial<LLMProviderConfig>): LLMProviderConfig {
    if (config.provider === "huggingface") {
        return {
            ...config,
            transport: overrides.transport ?? config.transport ?? (config.baseUrl?.endsWith("/v1") ? "openai-compatible" : "inference-api"),
            supportsResponsesApi: overrides.supportsResponsesApi ?? false,
            supportsStructuredOutputs: overrides.supportsStructuredOutputs ?? false,
            supportsToolCalling: overrides.supportsToolCalling ?? false,
            supportsJsonMode: overrides.supportsJsonMode ?? false,
        };
    }

    if (config.provider === "amd-openai-compatible") {
        return {
            ...config,
            supportsResponsesApi: overrides.supportsResponsesApi ?? false,
            supportsJsonMode: overrides.supportsJsonMode ?? false,
        };
    }

    return config;
}

export function createLLMProvider(config: Partial<LLMProviderConfig> = {}): BaseLLMProvider {
    const resolved = applyProviderDefaults({
        ...buildConfig(),
        ...config,
    } as LLMProviderConfig, config);

    switch (resolved.provider) {
        case "openai":
        case "openai-compatible":
        case "amd-openai-compatible":
            return new OpenAIProvider(resolved);
        case "huggingface":
            return new HuggingFaceProvider(resolved);
        default:
            throw new LLMError({
                message: `Unsupported LLM provider: ${resolved.provider}`,
                code: "LLM_PROVIDER_NOT_SUPPORTED",
                provider: resolved.provider,
                retryable: false,
            });
    }
}

export function createDefaultLLMProvider(): BaseLLMProvider {
    return createLLMProvider();
}

export function recommendProviderForTaskProfile(profile: LLMTaskProfile, config?: Partial<LLMProviderConfig>): ProviderRecommendation {
    return recommendProviderForTask(profile, config);
}

export async function validateProviderStartup(config: Partial<LLMProviderConfig> = {}): Promise<LLMProviderStartupReport> {
    const resolved = applyProviderDefaults({ ...buildConfig(), ...config } as LLMProviderConfig, config);

    let provider: BaseLLMProvider;

    try {
        provider = createLLMProvider(config);
    } catch (error) {
        return {
            provider: resolved.provider,
            model: resolved.model,
            ok: false,
            reachable: false,
            authPresent: Boolean(resolved.apiKey),
            modelConfigured: Boolean(resolved.model),
            endpointShapeValid: Boolean(resolved.baseUrl || resolved.provider === "openai"),
            error: error instanceof Error ? error.message : String(error),
        };
    }

    return validateLLMProviderStartup(provider, {
        provider: resolved.provider,
        model: resolved.model,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
    });
}