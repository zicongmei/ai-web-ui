// Centralized Pricing Configuration for Gemini Models

const GEMINI_PRICING_CONFIG = {
    // Text and Multimodal Generation Models
    TEXT: {
        'gemini-3.8-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.75 / 1_000_000,
                outputRate: 3.75 / 1_000_000,
                cacheHitRate: 0.075 / 1_000_000
            })
        },
        'gemini-3.7-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.75 / 1_000_000,
                outputRate: 3.75 / 1_000_000,
                cacheHitRate: 0.075 / 1_000_000
            })
        },
        'gemini-3.6-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.75 / 1_000_000,
                outputRate: 3.75 / 1_000_000,
                cacheHitRate: 0.075 / 1_000_000
            })
        },
        'gemini-3.5-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 1.50 / 1_000_000,
                outputRate: 9.00 / 1_000_000,
                cacheHitRate: 0.15 / 1_000_000
            })
        },
        'gemini-3.5-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.30 / 1_000_000,
                outputRate: 2.50 / 1_000_000,
                cacheHitRate: 0.03 / 1_000_000
            })
        },
        'gemini-3.1-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.25 / 1_000_000,
                outputRate: 1.50 / 1_000_000,
                cacheHitRate: 0.025 / 1_000_000
            })
        },
        'gemini-3.1-pro-preview': {
            getPricing: (promptTokenCount) => {
                const PROMPT_THRESHOLD_TOKENS = 200_000;
                let inputRate, outputRate, cacheHitRate;

                if (promptTokenCount <= PROMPT_THRESHOLD_TOKENS) {
                    inputRate = 2.00 / 1_000_000;
                    outputRate = 12.00 / 1_000_000;
                    cacheHitRate = 0.20 / 1_000_000;
                } else {
                    inputRate = 4.00 / 1_000_000;
                    outputRate = 18.00 / 1_000_000;
                    cacheHitRate = 0.40 / 1_000_000;
                }
                return { inputRate, outputRate, cacheHitRate };
            }
        },
        'gemini-3-flash-preview': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.50 / 1_000_000,
                outputRate: 3.00 / 1_000_000,
                cacheHitRate: 0.05 / 1_000_000
            })
        },
        'gemini-2.5-pro': {
            getPricing: (promptTokenCount) => {
                const PROMPT_THRESHOLD_TOKENS = 200_000;
                let inputRate, outputRate, cacheHitRate;

                if (promptTokenCount <= PROMPT_THRESHOLD_TOKENS) {
                    inputRate = 1.25 / 1_000_000;
                    outputRate = 10.00 / 1_000_000;
                    cacheHitRate = 0.125 / 1_000_000;
                } else {
                    inputRate = 2.50 / 1_000_000;
                    outputRate = 15.00 / 1_000_000;
                    cacheHitRate = 0.25 / 1_000_000;
                }
                return { inputRate, outputRate, cacheHitRate };
            }
        },
        'gemini-2.5-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.30 / 1_000_000,
                outputRate: 2.50 / 1_000_000,
                cacheHitRate: 0.03 / 1_000_000
            })
        },
        'gemini-2.5-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.10 / 1_000_000,
                outputRate: 0.40 / 1_000_000,
                cacheHitRate: 0.01 / 1_000_000
            })
        },
        // Live Speech-to-Text & Live API Models
        'gemini-3.5-transcribe-live': {
            getPricing: (promptTokenCount) => ({
                inputRate: 3.50 / 1_000_000,
                outputRate: 21.00 / 1_000_000,
                cacheHitRate: 0
            })
        },
        'gemini-3.5-transcribe': {
            getPricing: (promptTokenCount) => ({
                inputRate: 2.00 / 1_000_000,
                outputRate: 12.00 / 1_000_000,
                cacheHitRate: 0
            })
        },
        'gemini-3.8-live': {
            getPricing: (promptTokenCount) => ({
                inputRate: 3.00 / 1_000_000,
                outputRate: 4.50 / 1_000_000,
                cacheHitRate: 0
            })
        },
        'gemini-3.8-live-extended-thinking': {
            getPricing: (promptTokenCount) => ({
                inputRate: 3.00 / 1_000_000,
                outputRate: 4.50 / 1_000_000,
                cacheHitRate: 0
            })
        },
        'gemini-3.1-flash-live-preview': {
            getPricing: (promptTokenCount) => ({
                inputRate: 3.00 / 1_000_000,
                outputRate: 4.50 / 1_000_000,
                cacheHitRate: 0
            })
        },
        'gemini-2.5-flash-native-audio-preview-12-2025': {
            getPricing: (promptTokenCount) => ({
                inputRate: 3.00 / 1_000_000,
                outputRate: 2.00 / 1_000_000,
                cacheHitRate: 0
            })
        }
    },

    // Video Generation Models (Veo and Gemini Omni)
    VIDEO_GEN: {
        'veo-3.1-generate-preview': { input: 0, output_per_second_per_sample: 0.40 },
        'veo-3.1-fast-generate-preview': { input: 0, output_per_second_per_sample: 0.10 },
        'veo-3.1-lite-generate-preview': { input: 0, output_per_second_per_sample: 0.05 },
        'gemini-omni-1.1-flash': { input: 1.50 / 1_000_000, output_per_second_per_sample: 0.10 },
        'gemini-omni-flash-preview': { input: 1.50 / 1_000_000, output_per_second_per_sample: 0.10 }
    },

    // Image Generation Models
    IMAGE_GEN: {
        'gemini-3.1-flash-image': {
            input: {
                text_and_image_per_m_tokens: 0.50,
            },
            output: {
                image_512_fixed_price: 0.045,
                image_1K_fixed_price: 0.067,
                image_2K_fixed_price: 0.101,
                image_4K_fixed_price: 0.151,
            },
        },
        'gemini-3.1-flash-lite-image': {
            input: {
                text_and_image_per_m_tokens: 0.25,
            },
            output: {
                image_512_fixed_price: 0.025,
                image_1K_fixed_price: 0.0336,
            },
        },
        'gemini-3-pro-image': {
            input: {
                text_per_m_tokens: 2.00,
                image_fixed_price: 0.0011,
            },
            output: {
                image_1K_2K_fixed_price: 0.134,
                image_4K_fixed_price: 0.24,
            },
        },
        'gemini-2.5-flash-image': {
            input: {
                text_and_image_per_m_tokens: 0.30,
            },
            output: {
                image_1K_fixed_price: 0.039,
            },
        },
    },

    // Token Equivalents
    TOKEN_EQUIVALENTS: {
        IMAGE_DEFAULT_1K_TOKENS: 1290, 
    },

    /**
     * Parses Gemini API usageMetadata to extract token counts for cache hits and misses.
     * Returns the token hit cache and token not hit cache.
     * @param {Object} usageMetadata - The usageMetadata object from the Gemini API response.
     * @returns {{ tokenHitCache: number, tokenNotHitCache: number, cachedTokens: number, uncachedTokens: number, promptTokens: number, outputTokens: number }}
     */
    parseTokenUsage: (usageMetadata) => {
        if (!usageMetadata) {
            return {
                tokenHitCache: 0,
                tokenNotHitCache: 0,
                cachedTokens: 0,
                uncachedTokens: 0,
                promptTokens: 0,
                outputTokens: 0
            };
        }
        const promptTokens = usageMetadata.promptTokenCount ?? usageMetadata.prompt_tokens ?? usageMetadata.total_input_tokens ?? usageMetadata.inputTokens ?? 0;
        const cachedTokens = usageMetadata.cachedContentTokenCount ?? usageMetadata.cached_content_token_count ?? usageMetadata.cached_tokens ?? usageMetadata.cachedTokens ?? usageMetadata.cached_input_tokens ?? 0;
        const uncachedTokens = Math.max(0, promptTokens - cachedTokens);
        const outputTokens = usageMetadata.candidatesTokenCount ?? usageMetadata.responseTokenCount ?? usageMetadata.candidates_tokens ?? usageMetadata.response_token_count ?? usageMetadata.total_output_tokens ?? usageMetadata.outputTokens ?? 0;
        return {
            tokenHitCache: cachedTokens,
            tokenNotHitCache: uncachedTokens,
            cachedTokens,
            uncachedTokens,
            promptTokens,
            outputTokens
        };
    },

    /**
     * Calculates the cost for a Gemini text model request differentiating cached and non-cached tokens.
     * @param {string} model - The model identifier.
     * @param {number} uncachedTokens - Tokens that did not hit cache.
     * @param {number} [outputTokens=0] - Candidates output tokens.
     * @param {number} [cachedTokens=0] - Tokens that hit cache.
     * @param {number} [totalPromptTokens] - Total prompt tokens for tiered threshold checks.
     * @returns {number} The calculated cost in USD.
     */
    calculateCost: (model, uncachedTokens, outputTokens = 0, cachedTokens = 0, totalPromptTokens = null) => {
        const modelPricing = GEMINI_PRICING_CONFIG.TEXT[model];
        if (!modelPricing || !modelPricing.getPricing) return 0;
        
        const totalPrompt = totalPromptTokens !== null ? totalPromptTokens : (uncachedTokens + cachedTokens);
        const { inputRate, outputRate, cacheHitRate } = modelPricing.getPricing(totalPrompt);
        
        const uncachedCost = uncachedTokens * (inputRate || 0);
        const cachedCost = cachedTokens * (cacheHitRate || 0);
        const outputCost = outputTokens * (outputRate || 0);
        
        return uncachedCost + cachedCost + outputCost;
    },

    /**
     * Convenience helper to calculate cost directly from usageMetadata.
     * @param {string} model - The model identifier.
     * @param {Object} usageMetadata - The usageMetadata object from the Gemini API response.
     * @returns {{ cost: number, tokenHitCache: number, tokenNotHitCache: number, outputTokens: number, promptTokens: number, cachedTokens: number, uncachedTokens: number }}
     */
    calculateUsageCost: (model, usageMetadata) => {
        const tokens = GEMINI_PRICING_CONFIG.parseTokenUsage(usageMetadata);
        const cost = GEMINI_PRICING_CONFIG.calculateCost(model, tokens.uncachedTokens, tokens.outputTokens, tokens.cachedTokens, tokens.promptTokens);
        return {
            cost,
            ...tokens
        };
    },

    /**
     * Helper to execute a Gemini generateContent API call and return the response
     * along with structured token counts (token hit cache and token not hit cache) and cost.
     *
     * @param {Object} options
     * @param {string} options.apiKey
     * @param {string} options.model
     * @param {Object} options.requestBody
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{
     *   data: Object,
     *   text: string,
     *   tokenHitCache: number,
     *   tokenNotHitCache: number,
     *   cachedTokens: number,
     *   uncachedTokens: number,
     *   outputTokens: number,
     *   promptTokens: number,
     *   cost: number
     * }>}
     */
    callGeminiApi: async ({ apiKey, model, requestBody, signal }) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || response.statusText);
        }
        const data = await response.json();
        const usage = GEMINI_PRICING_CONFIG.calculateUsageCost(model, data.usageMetadata);
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        return {
            data,
            text,
            ...usage
        };
    }
};

if (typeof window !== 'undefined') {
    window.parseTokenUsage = GEMINI_PRICING_CONFIG.parseTokenUsage;
    window.calculateCost = GEMINI_PRICING_CONFIG.calculateCost;
    window.calculateGeminiCost = GEMINI_PRICING_CONFIG.calculateCost;
    window.callGeminiApi = GEMINI_PRICING_CONFIG.callGeminiApi;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GEMINI_PRICING_CONFIG };
}
