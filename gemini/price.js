// Centralized Pricing Configuration for Gemini Models

const GEMINI_PRICING_CONFIG = {
    // Text and Multimodal Generation Models
    TEXT: {
        'gemini-2.5-flash': {
            getPricing: (promptTokenCount) => ({
                inputRate: 0.30 / 1_000_000,
                outputRate: 2.50 / 1_000_000
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
        },
        'gemini-3-pro-preview': {
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
        }
    },

    // Video Generation Models (Veo)
    VIDEO_GEN: {
        'veo-2.0-generate-001': { input: 0, output_per_second_per_sample: 0.35 }, 
        'veo-3.0-generate-001': { input: 0, output_per_second_per_sample: 0.40 },
        'veo-3.0-fast-generate-001': { input: 0, output_per_second_per_sample: 0.15 },
        'veo-3.1-generate-preview': { input: 0, output_per_second_per_sample: 0.40 },
        'veo-3.1-fast-generate-preview': { input: 0, output_per_second_per_sample: 0.15 }
    },

    // Image Generation Models
    IMAGE_GEN: {
        'gemini-3-pro-image-preview': {
            input: {
                text_per_m_tokens: 1.00,
                image_fixed_price: 0.0011, // Per image input
            },
            output: {
                image_1K_2K_fixed_price: 0.134, // Per image output for 1K/2K sizes
                image_4K_fixed_price: 0.24, // Per image output for 4K size
            },
        },
        'gemini-2.5-flash-image': {
            input: {
                text_and_image_per_m_tokens: 0.30, // Combined text/image input token price
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
    
    // Story Config (Alternative format used in story.js, mapped to standard model names)
    // story.js uses a different structure, so we might adapt it or keep it here for reference
    // The story.js logic is specific enough that it might be easier to adapt story.js to use TEXT pricing above.
};
