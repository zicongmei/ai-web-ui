// Centralized Pricing Configuration for DeepSeek Models

const DEEPSEEK_PRICING_CONFIG = {
    TEXT: {
        'deepseek-chat': { // Corresponds to deepseek-v4-flash (non-thinking)
            getPricing: (promptTokenCount) => ({
                inputRate: 0.14 / 1_000_000,   // Cache Miss (Default for calculation)
                outputRate: 0.28 / 1_000_000,
                cacheHitRate: 0.0028 / 1_000_000
            })
        },
        'deepseek-reasoner': { // Corresponds to deepseek-v4-flash (thinking)
            getPricing: (promptTokenCount) => ({
                inputRate: 0.14 / 1_000_000,   // Cache Miss (Default for calculation)
                outputRate: 0.28 / 1_000_000,
                cacheHitRate: 0.0028 / 1_000_000
            })
        },
        'deepseek-v4-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.14 / 1_000_000,   // Cache Miss (Default for calculation)
                outputRate: 0.28 / 1_000_000,
                cacheHitRate: 0.0028 / 1_000_000
            })
        },
        'deepseek-v4-pro': {
            getPricing: (promptTokenCount) => ({
                inputRate: 1.74 / 1_000_000,   // Cache Miss (Full Price)
                outputRate: 3.48 / 1_000_000,  // Full Price
                cacheHitRate: 0.0145 / 1_000_000
            })
        }
    }
};
