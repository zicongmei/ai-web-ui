// Pricing configuration for DeepSeek models
// Rates are in USD per 1M tokens ($/1M tokens) -> $/token = rate / 1e6
const DEEPSEEK_PRICING_CONFIG = {
    TEXT: {
        'deepseek-chat': {
            // Standard price: $0.14/1M input, $0.28/1M output
            getPricing: (inputTokens) => ({
                inputRate: 0.14 / 1000000,
                outputRate: 0.28 / 1000000
            })
        },
        'deepseek-reasoner': {
            // Standard price: $0.55/1M input, $2.19/1M output
            getPricing: (inputTokens) => ({
                inputRate: 0.55 / 1000000,
                outputRate: 2.19 / 1000000
            })
        }
    }
};
