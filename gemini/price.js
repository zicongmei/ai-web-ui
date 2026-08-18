// Centralized Pricing Configuration for Gemini Models

const GEMINI_PRICING_CONFIG = {
    // Text and Multimodal Generation Models
    TEXT: {
        'gemini-3.7-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.75 / 1_000_000,
                outputRate: 3.75 / 1_000_000
            })
        },
        'gemini-3.6-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.75 / 1_000_000,
                outputRate: 3.75 / 1_000_000
            })
        },
        'gemini-3.5-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 1.50 / 1_000_000,
                outputRate: 9.00 / 1_000_000
            })
        },
        'gemini-3.5-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.30 / 1_000_000,
                outputRate: 2.50 / 1_000_000
            })
        },
        'gemini-3.1-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.25 / 1_000_000,
                outputRate: 1.50 / 1_000_000
            })
        },
        'gemini-3.1-pro-preview': {
            getPricing: (promptTokenCount) => {
                const PROMPT_THRESHOLD_TOKENS = 200_000;
                let inputRate, outputRate;

                if (promptTokenCount <= PROMPT_THRESHOLD_TOKENS) {
                    inputRate = 2.00 / 1_000_000;
                    outputRate = 12.00 / 1_000_000;
                } else {
                    inputRate = 4.00 / 1_000_000;
                    outputRate = 18.00 / 1_000_000;
                }
                return { inputRate, outputRate };
            }
        },
        'gemini-3-flash-preview': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.50 / 1_000_000,
                outputRate: 3.00 / 1_000_000
            })
        },
        'gemini-2.5-pro': {
            getPricing: (promptTokenCount) => {
                const PROMPT_THRESHOLD_TOKENS = 200_000;
                let inputRate, outputRate;

                if (promptTokenCount <= PROMPT_THRESHOLD_TOKENS) {
                    inputRate = 1.25 / 1_000_000;
                    outputRate = 10.00 / 1_000_000;
                } else {
                    inputRate = 2.50 / 1_000_000;
                    outputRate = 15.00 / 1_000_000;
                }
                return { inputRate, outputRate };
            }
        },
        'gemini-2.5-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.30 / 1_000_000,
                outputRate: 2.50 / 1_000_000
            })
        },
        'gemini-2.5-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.10 / 1_000_000,
                outputRate: 0.40 / 1_000_000
            })
        },
        'gemini-2.0-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.10 / 1_000_000,
                outputRate: 0.40 / 1_000_000
            })
        },
        'gemini-2.0-flash-lite': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.075 / 1_000_000,
                outputRate: 0.30 / 1_000_000
            })
        }
    },

    // Video Generation Models (Veo)
    VIDEO_GEN: {
        'veo-3.1-generate-preview': { input: 0, output_per_second_per_sample: 0.40 },
        'veo-3.1-fast-generate-preview': { input: 0, output_per_second_per_sample: 0.10 },
        'veo-3.1-lite-generate-preview': { input: 0, output_per_second_per_sample: 0.05 },
        'veo-3.0-generate-001': { input: 0, output_per_second_per_sample: 0.40 },
        'veo-3.0-fast-generate-001': { input: 0, output_per_second_per_sample: 0.10 },
        'veo-2.0-generate-001': { input: 0, output_per_second_per_sample: 0.35 }
    },

    // Image Generation Models
    IMAGE_GEN: {
        'imagen-4.0-fast-generate-001': {
            input: { text_per_m_tokens: 0, image_fixed_price: 0 },
            output: { image_fixed_price: 0.02 }
        },
        'imagen-4.0-generate-001': {
            input: { text_per_m_tokens: 0, image_fixed_price: 0 },
            output: { image_fixed_price: 0.04 }
        },
        'imagen-4.0-ultra-generate-001': {
            input: { text_per_m_tokens: 0, image_fixed_price: 0 },
            output: { image_fixed_price: 0.06 }
        },
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
};
