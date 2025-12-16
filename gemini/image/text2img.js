// text2img.js

let currentApiKey = '';
let selectedModel = 'gemini-2.5-flash-image'; // Default model for image generation
let numOutputImages = 1; // Default number of images to generate
let selectedInputImages = []; // Store selected images for input (Array of base64 strings)

let abortController = null; // To manage ongoing fetch requests
let allApiInteractions = []; // To store all API calls for debug info

// Global totals for summary display
let totalGenerationTime = 0;
let generationStartTime = 0; // Capture start time for wall-clock duration
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalThoughtTokens = 0; // New global for thought tokens
let totalEstimatedCost = 0;

// Model names and labels for image generation
const GEMINI_IMAGE_MODELS = {
    'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
    'gemini-3-pro-image-preview': 'Gemini 3 Pro Preview Image'
};

const GEMINI_3_PRO_MODEL_ID = 'gemini-3-pro-image-preview'; // Define the Gemini 3 model ID

// Get DOM elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const imageCountInput = document.getElementById('imageCountInput');
const promptInput = document.getElementById('promptInput');
const generateImageButton = document.getElementById('generateImageButton');
const stopGenerationButton = document.getElementById('stopGenerationButton'); // New stop button
const recoverBatchButton = document.getElementById('recoverBatchButton'); // New recover button
const imageGallery = document.getElementById('imageGallery');
const statusMessage = document.getElementById('statusMessage');
const explanationNote = document.getElementById('explanationNote');

// New Options Elements
const aspectRatioSelect = document.getElementById('aspectRatioSelect');
const imageSizeSelect = document.getElementById('imageSizeSelect');
const imageSizeOptionGroup = document.getElementById('imageSizeOptionGroup'); // Get parent div
const useGoogleSearchInput = document.getElementById('useGoogleSearch');
const googleSearchOptionGroup = document.getElementById('googleSearchOptionGroup'); // Get parent div
const useBatchModeInput = document.getElementById('useBatchMode'); // Get Batch Mode checkbox

// Selected Image Elements
const selectedImageContainer = document.getElementById('selectedImageContainer');
const selectedImagesList = document.getElementById('selectedImagesList');
const clearAllImagesButton = document.getElementById('clearAllImagesButton');

// New elements for Load Image
const loadImageButton = document.getElementById('loadImageButton');
const imageFileInput = document.getElementById('imageFileInput');

// Debug Elements (modified to show all API calls)
const showApiCallsButton = document.getElementById('showApiCallsButton'); // Renamed debug button
const debugInfo = document.getElementById('debugInfo');
const apiCallsContainer = document.getElementById('apiCallsContainer'); // New container for multiple calls
const closeDebugButton = document.getElementById('closeDebugButton');

// Summary Display Elements
const totalGenerationTimeSpan = document.getElementById('totalGenerationTime');
const totalInputTokensSpan = document.getElementById('totalInputTokens');
const totalOutputTokensSpan = document.getElementById('totalOutputTokens');
const totalThoughtTokensSpan = document.getElementById('totalThoughtTokens'); // New span
const totalEstimatedCostSpan = document.getElementById('totalEstimatedCost');


// Utility functions for localStorage
function setLocalStorageItem(name, value) {
    try {
        localStorage.setItem(name, value);
    } catch (e) {
        console.error(`Error saving to localStorage for ${name}:`, e);
    }
}

function getLocalStorageItem(name) {
    try {
        return localStorage.getItem(name);
    } catch (e) {
        console.error(`Error loading from localStorage for ${name}:`, e);
        return null;
    }
}

// Function to validate and store the API key
function setApiKey() {
    const apiKey = geminiApiKeyInput.value.trim();
    if (!apiKey) {
        statusMessage.textContent = 'Please enter your Gemini API Key.';
        currentApiKey = '';
        return false;
    }
    currentApiKey = apiKey;
    setLocalStorageItem('geminiApiKey', apiKey); 
    statusMessage.textContent = 'API Key set successfully and saved!';
    setTimeout(() => statusMessage.textContent = '', 3000);
    return true;
}

// Function to load values from localStorage (excluding model-dependent features for initial setup)
function loadSettingsFromLocalStorage() {
    // API Key
    const apiKey = getLocalStorageItem('geminiApiKey');
    if (apiKey) {
        geminiApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
        statusMessage.textContent = 'Settings loaded from local storage!';
        setTimeout(() => statusMessage.textContent = '', 3000);
    }

    // Number of Images
    const storedNumImages = getLocalStorageItem('numOutputImages');
    if (storedNumImages !== null) {
        numOutputImages = parseInt(storedNumImages, 10);
        if (isNaN(numOutputImages) || numOutputImages < 1) { 
            numOutputImages = 1;
        }
        imageCountInput.value = numOutputImages;
    }

    // Aspect Ratio
    const storedAspectRatio = getLocalStorageItem('aspectRatio');
    if (storedAspectRatio) {
        aspectRatioSelect.value = storedAspectRatio;
    }

    // Load Prompt
    const storedPrompt = getLocalStorageItem('promptInput');
    if (storedPrompt) {
        promptInput.value = storedPrompt;
    }

    // Load Batch Mode
    const storedBatchMode = getLocalStorageItem('useBatchMode');
    if (storedBatchMode !== null) {
        useBatchModeInput.checked = (storedBatchMode === 'true');
    } else {
        useBatchModeInput.checked = true; // Default to true
    }

    // Load Selected Input Images
    const storedInputImages = getLocalStorageItem('selectedInputImages');
    if (storedInputImages) {
        try {
            selectedInputImages = JSON.parse(storedInputImages);
        } catch (e) {
            console.error("Failed to parse stored images:", e);
            selectedInputImages = [];
        }
    } else {
        // Fallback for backward compatibility with single image
        const oldSingleImage = getLocalStorageItem('selectedInputImageBase64');
        if (oldSingleImage) {
            selectedInputImages = [oldSingleImage];
            // Remove old key
            localStorage.removeItem('selectedInputImageBase64');
        }
    }
    renderSelectedImages();

    // Check for recoverable batch job
    const lastBatch = getLocalStorageItem('geminiLastBatchName');
    if (lastBatch) {
        recoverBatchButton.style.display = 'inline-block';
        recoverBatchButton.title = `Recover: ${lastBatch}`;
    }
}

// Function to populate model dropdown and load selected model
function populateModelSelect() {
    geminiModelSelect.innerHTML = ''; 
    for (const modelId in GEMINI_IMAGE_MODELS) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = GEMINI_IMAGE_MODELS[modelId];
        geminiModelSelect.appendChild(option);
    }

    const storedModel = getLocalStorageItem('selectedModel');
    if (storedModel && GEMINI_IMAGE_MODELS[storedModel]) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
    } else {
        geminiModelSelect.value = selectedModel; // Set default if no stored or invalid
    }
}

// Function to toggle model-dependent features (Image Size, Google Search)
function toggleModelDependentFeatures() {
    const isGemini3Pro = (selectedModel === GEMINI_3_PRO_MODEL_ID);

    // Toggle Image Size
    if (isGemini3Pro) {
        imageSizeSelect.disabled = false;
        imageSizeOptionGroup.classList.remove('feature-disabled-by-model');
        const storedImageSize = getLocalStorageItem('imageSize');
        if (storedImageSize && imageSizeSelect.options.namedItem(storedImageSize)) {
            imageSizeSelect.value = storedImageSize;
        } else {
            imageSizeSelect.value = '1K'; // Default to 1K if no stored value or invalid
        }
    } else {
        imageSizeSelect.disabled = true;
        imageSizeSelect.value = '1K'; // Force 1K for 2.5 models
        imageSizeOptionGroup.classList.add('feature-disabled-by-model');
    }

    // Toggle Google Search Tool
    if (isGemini3Pro) {
        useGoogleSearchInput.disabled = false;
        googleSearchOptionGroup.classList.remove('feature-disabled-by-model');
        const storedUseSearch = getLocalStorageItem('useGoogleSearch');
        useGoogleSearchInput.checked = (storedUseSearch === 'true');
    } else {
        useGoogleSearchInput.disabled = true;
        useGoogleSearchInput.checked = false; // Force unchecked for 2.5 models
        googleSearchOptionGroup.classList.add('feature-disabled-by-model');
    }

    // Update explanation note to reflect feature status
    updateExplanationNote();
}


// Function to update the selected model
function updateSelectedModel() {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedModel', selectedModel);
    toggleModelDependentFeatures(); // Update feature availability based on new model
}

// Function to update the number of output images
function updateNumOutputImages() {
    let value = parseInt(imageCountInput.value, 10);
    if (isNaN(value) || value < 1) {
        value = 1;
    }
    // Cap at the max value defined in HTML (e.g., 8)
    const maxValue = parseInt(imageCountInput.max, 10);
    if (!isNaN(maxValue) && value > maxValue) {
        value = maxValue;
        imageCountInput.value = maxValue;
    }
    numOutputImages = value; // Update global variable
    setLocalStorageItem('numOutputImages', numOutputImages);
}

function updateAspectRatio() {
    setLocalStorageItem('aspectRatio', aspectRatioSelect.value);
}

function updateImageSize() {
    // Only save if the feature is enabled (i.e., for Gemini 3 Pro)
    if (!imageSizeSelect.disabled) {
        setLocalStorageItem('imageSize', imageSizeSelect.value);
    }
}

function updateUseGoogleSearch() {
    // Only save if the feature is enabled (i.e., for Gemini 3 Pro)
    if (!useGoogleSearchInput.disabled) {
        setLocalStorageItem('useGoogleSearch', useGoogleSearchInput.checked);
    }
}

function updateUseBatchMode() {
    setLocalStorageItem('useBatchMode', useBatchModeInput.checked);
}

// Input Image Selection Functions
function renderSelectedImages() {
    selectedImagesList.innerHTML = '';
    
    if (selectedInputImages.length === 0) {
        selectedImageContainer.style.display = 'none';
        return;
    }

    selectedImageContainer.style.display = 'block';

    selectedInputImages.forEach((base64, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'selected-image-wrapper';
        
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${base64}`;
        img.alt = `Selected Input ${index + 1}`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'clear-image-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove this image';
        removeBtn.onclick = () => removeImageAtIndex(index);

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        selectedImagesList.appendChild(wrapper);
    });

    // Update localStorage whenever render is called
    setLocalStorageItem('selectedInputImages', JSON.stringify(selectedInputImages));
}

function addImageAsInput(base64) {
    selectedInputImages.push(base64);
    renderSelectedImages();
    statusMessage.textContent = 'Image added as input.';
    
    // Scroll up to show the selection if it was hidden
    selectedImageContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeImageAtIndex(index) {
    selectedInputImages.splice(index, 1);
    renderSelectedImages();
}

function clearAllInputImages() {
    selectedInputImages = [];
    renderSelectedImages();
}

// Function to save a generated image
function saveGeneratedImage(base64Image, prompt) {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Image}`;
    // Sanitize prompt for filename
    const filename = `gemini_image_${prompt.substring(0, 50).replace(/[^a-z0-9]/gi, '_') || 'generated'}_${Date.now()}.png`;
    link.download = filename;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link); // Clean up
    statusMessage.textContent = 'Image saved successfully!';
    setTimeout(() => statusMessage.textContent = '', 3000);
}

// Token and Price Calculation Logic
function calculateCost(modelId, inputTextTokens, inputImageCount, outputImageCount, imageOutputSize, useBatch = false) {
    let inputCost = 0;
    let outputCost = 0;
    let totalInputTokensCalculated = inputTextTokens; // Actual tokens contributing to input cost
    let totalOutputTokensCalculated = 0; // Actual tokens contributing to output cost

    const modelPricing = GEMINI_PRICING_CONFIG.IMAGE_GEN[modelId];
    if (!modelPricing) {
        console.warn(`Pricing info not found for model: ${modelId}`);
        return { inputCost: 0, outputCost: 0, totalCost: 0, inputTokens: 0, outputTokens: 0 };
    }

    const TOKENS_PER_MILLION = 1_000_000;

    // --- Input Cost Calculation ---
    if (modelId === 'gemini-3-pro-image-preview') {
        inputCost += (inputTextTokens / TOKENS_PER_MILLION) * modelPricing.input.text_per_m_tokens;
        if (inputImageCount > 0) {
            inputCost += inputImageCount * modelPricing.input.image_fixed_price;
        }
            } else if (modelId === 'gemini-2.5-flash-image') {
                if (inputImageCount > 0) {
                    totalInputTokensCalculated += inputImageCount * GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
                }
                inputCost += (totalInputTokensCalculated / TOKENS_PER_MILLION) * modelPricing.input.text_and_image_per_m_tokens;
            }
    
        // --- Output Cost Calculation ---
        if (outputImageCount > 0) {
            if (modelId === 'gemini-3-pro-image-preview') {
                if (imageOutputSize === '4K') {
                    outputCost += outputImageCount * modelPricing.output.image_4K_fixed_price;
                } else { // '1K' or '2K'
                    outputCost += outputImageCount * modelPricing.output.image_1K_2K_fixed_price;
                }
            } else if (modelId === 'gemini-2.5-flash-image') {
                // Use fixed per-image price for Flash as per table "equivalent to $0.0195 per image"
                outputCost += outputImageCount * modelPricing.output.image_1K_fixed_price;
                totalOutputTokensCalculated = outputImageCount * GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
            }
        }
    if (useBatch) {
        inputCost *= 0.5;
        outputCost *= 0.5;
    }

    return {
        inputCost: inputCost,
        outputCost: outputCost,
        totalCost: inputCost + outputCost,
        inputTokens: totalInputTokensCalculated,
        outputTokens: totalOutputTokensCalculated,
    };
}


// Debug functions
function updateDebugButtonText() {
    const count = allApiInteractions.length;
    showApiCallsButton.textContent = `Show ${count} API Call${count !== 1 ? 's' : ''}`;
}

function updateSummaryDisplay() {
    totalGenerationTimeSpan.textContent = `${(totalGenerationTime / 1000).toFixed(2)}s`;
    totalInputTokensSpan.textContent = totalInputTokens.toLocaleString();
    totalOutputTokensSpan.textContent = totalOutputTokens.toLocaleString();
    totalThoughtTokensSpan.textContent = totalThoughtTokens.toLocaleString();
    totalEstimatedCostSpan.textContent = `$${totalEstimatedCost.toFixed(6)}`;
}

// Modify logApiInteraction to store all relevant data
function logApiInteraction(url, request, response, durationMs, inputTokens, outputTokens, thoughtTokens, costDetails) {
    const interaction = {
        url,
        request,
        response,
        durationMs,
        inputTokens,
        outputTokens,
        thoughtTokens: thoughtTokens || 0, // Ensure it has a value
        costDetails, // {inputCost, outputCost, totalCost}
        timestamp: new Date().toISOString()
    };
    allApiInteractions.push(interaction);
    updateDebugButtonText();
    
    // Update global totals
    // Note: totalGenerationTime is now updated independently to reflect wall-clock time
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalThoughtTokens += (thoughtTokens || 0);
    totalEstimatedCost += costDetails.totalCost;
    updateSummaryDisplay(); // Update the main summary
    
    // If debug window is visible, append the new entry immediately
    if (debugInfo.style.display !== 'none') {
        const noCallsMsg = apiCallsContainer.querySelector('p');
        if (noCallsMsg && noCallsMsg.textContent.includes('No API calls')) {
            apiCallsContainer.innerHTML = '';
        }
        appendApiCallEntry(interaction, allApiInteractions.length - 1);
        apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
    }
}

function appendApiCallEntry(interaction, index) {
    const callDetails = document.createElement('details');
    callDetails.classList.add('api-call-entry');

    const summary = document.createElement('summary');
    const endpointName = interaction.url.split('/').pop().split('?')[0]; // Extract endpoint name
    summary.innerHTML = `<h4>API Call ${index + 1}: ${endpointName} (${(interaction.durationMs / 1000).toFixed(2)}s)</h4>`;
    callDetails.appendChild(summary);

    const metricsDiv = document.createElement('div');
    metricsDiv.classList.add('api-call-metrics');
    metricsDiv.innerHTML = `
        <div class="api-call-metric"><strong>Input Tokens:</strong> ${interaction.inputTokens.toLocaleString()}</div>
        <div class="api-call-metric"><strong>Output Tokens:</strong> ${interaction.outputTokens.toLocaleString()}</div>
        <div class="api-call-metric"><strong>Thought Tokens:</strong> ${interaction.thoughtTokens.toLocaleString()}</div>
        <div class="api-call-metric"><strong>Estimated Cost:</strong> $${interaction.costDetails.totalCost.toFixed(6)}</div>
    `;
    callDetails.appendChild(metricsDiv);

    const endpointDiv = document.createElement('div');
    endpointDiv.classList.add('debug-section');
    endpointDiv.innerHTML = `
        <h5>Endpoint</h5>
        <div class="debug-content">${interaction.url}</div>
    `;
    callDetails.appendChild(endpointDiv);

    const requestDiv = document.createElement('div');
    requestDiv.classList.add('debug-section');
    requestDiv.innerHTML = `
        <h5>Request Body</h5>
        <div class="debug-content">${JSON.stringify(interaction.request, null, 2)}</div>
    `;
    callDetails.appendChild(requestDiv);

    const responseDiv = document.createElement('div');
    responseDiv.classList.add('debug-section');
    responseDiv.innerHTML = `
        <h5>Response Body</h5>
        <div class="debug-content">${JSON.stringify(interaction.response, null, 2)}</div>
    `;
    callDetails.appendChild(responseDiv);

    apiCallsContainer.appendChild(callDetails);
}

function showApiCallsModal() {
    apiCallsContainer.innerHTML = ''; // Clear previous content

    if (allApiInteractions.length === 0) {
        apiCallsContainer.innerHTML = '<p>No API calls recorded yet.</p>';
        debugInfo.style.display = 'block';
        return;
    }

    allApiInteractions.forEach((interaction, index) => {
        appendApiCallEntry(interaction, index);
    });
    debugInfo.style.display = 'block';
    apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
}

function hideDebugModal() {
    debugInfo.style.display = 'none';
}

function updateExplanationNote() {
    const isGemini3Pro = (selectedModel === GEMINI_3_PRO_MODEL_ID);
    let noteText = `
        <strong>Instructions:</strong>
        Enter your Gemini API Key. Select options (Model, Aspect Ratio), type a prompt, and click "Generate". 
        <br><small>To use an image as input, click "Use as Input" on a generated result. You can also "Load Image as Input" from your device.</small>
    `;

    if (isGemini3Pro) {
        noteText += `<br><small><strong>Gemini 3 Pro Preview</strong> selected: Image Size and Google Search Tool are available.</small>`;
    } else {
        noteText += `<br><small><strong>Gemini 2.5 models</strong> selected: Image Size and Google Search Tool are disabled as they are only supported by Gemini 3 Pro Preview.</small>`;
    }
    explanationNote.innerHTML = noteText;
}

// Helper to process and display a single image response
function processAndDisplayImage(imageData, prompt) {
    let base64Image = null;
    
    // Check for standard inlineData (camelCase or snake_case)
    if (imageData.candidates && imageData.candidates[0] && imageData.candidates[0].content && imageData.candidates[0].content.parts) {
        for (const part of imageData.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                base64Image = part.inlineData.data;
                break;
            }
            if (part.inline_data && part.inline_data.data) {
                base64Image = part.inline_data.data;
                break;
            }
        }
    }

    if (base64Image) {
        const imgContainer = document.createElement('div');
        imgContainer.classList.add('image-item');
        
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${base64Image}`;
        img.alt = prompt;
        imgContainer.appendChild(img);

        const buttonGroup = document.createElement('div');
        buttonGroup.classList.add('image-item-buttons'); 

        const useInputBtn = document.createElement('button');
        useInputBtn.textContent = 'Use as Input';
        useInputBtn.classList.add('use-input-btn');
        useInputBtn.onclick = () => {
            addImageAsInput(base64Image); // Existing functionality
            
            // Post message to parent if inside iframe (for video gen integration)
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'imageGenerated', base64: base64Image }, '*');
            }
        };
        buttonGroup.appendChild(useInputBtn);

        const saveImageBtn = document.createElement('button');
        saveImageBtn.textContent = 'Save Image';
        saveImageBtn.classList.add('save-image-btn');
        saveImageBtn.onclick = () => saveGeneratedImage(base64Image, prompt);
        buttonGroup.appendChild(saveImageBtn);

        imgContainer.appendChild(buttonGroup); 
        imageGallery.appendChild(imgContainer); 
        return true;
    }
    return false;
}

// Main generation function dispatcher
async function generateImage() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        statusMessage.textContent = 'Please enter a prompt.';
        return;
    }
    if (!currentApiKey) {
        statusMessage.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    imageGallery.innerHTML = ''; 
    statusMessage.textContent = 'Starting process...';
    
    allApiInteractions = []; // Clear previous API interactions
    totalGenerationTime = 0; // Reset totals for new generation
    generationStartTime = performance.now(); // Capture start time
    totalInputTokens = 0;
    totalOutputTokens = 0;
    totalThoughtTokens = 0;
    totalEstimatedCost = 0;
    updateSummaryDisplay(); // Update summary to show zeros
    updateDebugButtonText();
    showApiCallsButton.style.display = 'inline-block'; // Show debug button immediately
    debugInfo.style.display = 'none'; // Ensure debug panel is closed initially

    abortController = new AbortController();
    generateImageButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';

    const numToGenerate = parseInt(imageCountInput.value, 10);
    // Validation is already handled by updateNumOutputImages mostly, but safe to check here
    if (isNaN(numToGenerate) || numToGenerate < 1) {
        statusMessage.textContent = 'Invalid number of images.';
        generateImageButton.disabled = false;
        return;
    }

    try {
        if (numToGenerate > 1) {
            if (useBatchModeInput.checked) {
                // Use Batch API for multiple images
                await generateBatchImages(prompt, numToGenerate);
            } else {
                 // Sequential generation
                 for (let i = 0; i < numToGenerate; i++) {
                     if (abortController.signal.aborted) {
                         throw new Error('Generation cancelled by user.');
                     }
                     statusMessage.textContent = `Generating image ${i + 1} of ${numToGenerate}...`;
                     try {
                         await generateSingleImage(prompt);
                     } catch (e) {
                         console.error(`Error generating image ${i+1}:`, e);
                         const errDiv = document.createElement('div');
                         errDiv.classList.add('image-error');
                         errDiv.textContent = `Image ${i+1} failed: ${e.message}`;
                         imageGallery.appendChild(errDiv);
                     }
                 }
                 if (abortController.signal.aborted) {
                     statusMessage.textContent = 'Generation cancelled.';
                 } else {
                     statusMessage.textContent = `Finished generating ${numToGenerate} images.`;
                 }
            }
        } else {
            // Use standard API for single image
            await generateSingleImage(prompt);
        }
    } catch (error) {
        if (error.name === 'AbortError' || abortController.signal.aborted) {
             statusMessage.textContent = 'Generation cancelled.';
        } else {
             console.error('Generation Error:', error);
             statusMessage.textContent = `Error: ${error.message}`;
             const errorDiv = document.createElement('div');
             errorDiv.classList.add('image-error');
             errorDiv.textContent = `Failed: ${error.message}`;
             imageGallery.appendChild(errorDiv);
        }
    } finally {
        generateImageButton.disabled = false;
        stopGenerationButton.style.display = 'none';
        abortController = null;
    }
}

// Function to generate a single image (Synchronous/Direct)
async function generateSingleImage(prompt) {
    statusMessage.textContent = 'Generating image...';

    const parts = [{ text: prompt }];
    const inputImageCount = selectedInputImages.length;
    
    if (inputImageCount > 0) {
        selectedInputImages.forEach(base64 => {
            parts.push({
                inline_data: { mime_type: "image/png", data: base64 }
            });
        });
    }

    const generationConfig = {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: aspectRatioSelect.value }
    };
    const imageOutputSize = imageSizeSelect.value;
    if (!imageSizeSelect.disabled) { // Only for Gemini 3 Pro
        generationConfig.imageConfig.imageSize = imageOutputSize;
    }

    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: generationConfig
    };

    if (!useGoogleSearchInput.disabled && useGoogleSearchInput.checked) {
        requestBody.tools = [{ google_search: {} }];
    }
    
    const imageEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

    const apiCallStartTime = performance.now();
    const inputTextTokens = Math.ceil(prompt.length / 4); // Estimate based on char count

    // Calculate cost for this API call (1 output image expected)
    const costResult = calculateCost(selectedModel, inputTextTokens, inputImageCount, 1, imageOutputSize, false);

    const response = await fetch(imageEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': currentApiKey
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
    });

    const data = await response.json();
    const apiCallEndTime = performance.now();
    const duration = apiCallEndTime - apiCallStartTime;

    let successfulOutputImages = 0;
    if (processAndDisplayImage(data, prompt)) {
        successfulOutputImages = 1;
    }

    // Update total generation time to reflect time until images are shown
    totalGenerationTime = performance.now() - generationStartTime;
    
    // Parse Usage Metadata
    let actualInputTokens = inputTextTokens; // Default to estimate
    let actualOutputTokens = (selectedModel === GEMINI_3_PRO_MODEL_ID) ? 0 : (successfulOutputImages * GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS);
    let actualThoughtTokens = 0;

    if (data.usageMetadata) {
        actualInputTokens = data.usageMetadata.promptTokenCount || 0;
        actualOutputTokens = data.usageMetadata.candidatesTokenCount || 0;
        actualThoughtTokens = data.usageMetadata.thoughtsTokenCount || 0;
    }

    // Recalculate cost based on actual successful outputs (Cost calculation logic remains based on image count for G3P as per pricing table)
    const finalCostResult = calculateCost(selectedModel, actualInputTokens, inputImageCount, successfulOutputImages, imageOutputSize, false);

    logApiInteraction(imageEndpoint, requestBody, data, duration, actualInputTokens, actualOutputTokens, actualThoughtTokens, finalCostResult);

    if (!response.ok) {
        throw new Error(data.error?.message || `API Error: ${response.statusText}`);
    }

    if (successfulOutputImages === 0) {
         throw new Error('No valid image data found in response.');
    }
    statusMessage.textContent = 'Image generated successfully!';
}

// Function to generate multiple images using Batch API
async function generateBatchImages(prompt, numToGenerate) {
    statusMessage.textContent = `Preparing batch job for ${numToGenerate} images...`;
    
    const requests = [];
    const inputImageCount = selectedInputImages.length;
    const imageOutputSizeForBatch = imageSizeSelect.value;

    for (let i = 0; i < numToGenerate; i++) {
        const parts = [{ text: prompt }];
        if (inputImageCount > 0) {
            selectedInputImages.forEach(base64 => {
                parts.push({
                    inline_data: { mime_type: "image/png", data: base64 }
                });
            });
        }

        const generationConfig = {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: aspectRatioSelect.value
            }
        };
        
        if (!imageSizeSelect.disabled) { // Only for Gemini 3 Pro
            generationConfig.imageConfig.imageSize = imageOutputSizeForBatch;
        }

        const requestReq = {
            contents: [{ parts: parts }],
            generationConfig: generationConfig
        };

        if (!useGoogleSearchInput.disabled && useGoogleSearchInput.checked) {
            requestReq.tools = [{ google_search: {} }];
        }

        requests.push({
            request: requestReq,
            metadata: { key: `req-${i}` }
        });
    }

    const batchRequestBody = {
        batch: {
            display_name: `img-gen-${Date.now()}`,
            input_config: {
                requests: {
                    requests: requests
                }
            }
        }
    };

    const batchEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:batchGenerateContent`;

    const batchSubmissionStartTime = performance.now();
    const totalInputTextTokens = Math.ceil(prompt.length / 4) * numToGenerate; // Sum of prompt tokens for all individual requests

    // Calculate input cost for the entire batch submission. Output tokens are 0 for the submission response.
    const batchSubmissionCostResult = calculateCost(
        selectedModel,
        totalInputTextTokens,
        inputImageCount,
        0, // No output images in submission response
        imageOutputSizeForBatch,
        true // useBatch = true
    );

    const response = await fetch(batchEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': currentApiKey
        },
        body: JSON.stringify(batchRequestBody),
        signal: abortController.signal
    });

    const data = await response.json(); // Data is the Operation object
    const batchSubmissionEndTime = performance.now();
    const batchSubmissionDuration = batchSubmissionEndTime - batchSubmissionStartTime;

    logApiInteraction(
        batchEndpoint,
        batchRequestBody,
        data,
        batchSubmissionDuration,
        batchSubmissionCostResult.inputTokens, // Total estimated input tokens for the batch
        0, // No output tokens for the submission API call itself
        0, // No thought tokens for submission
        batchSubmissionCostResult
    );

    if (!response.ok) {
        throw new Error(data.error?.message || `Batch creation failed: ${response.statusText}`);
    }

    const batchName = data.name;
    // Save for recovery
    setLocalStorageItem('geminiLastBatchName', batchName);
    recoverBatchButton.style.display = 'inline-block';
    recoverBatchButton.title = `Recover: ${batchName}`;

    statusMessage.textContent = `Batch job submitted. Waiting for results...`;

    // Polling Logic
    const getBatchState = (d) => {
        if (d.state) return d.state;
        if (d.metadata && d.metadata.state) return d.metadata.state;
        return undefined;
    };

    let jobState = getBatchState(data);
    let pollData = data;
    let finalPollInteractionIndex = -1; // To store index of the last poll interaction to update output cost

    while (jobState !== 'BATCH_STATE_SUCCEEDED' && jobState !== 'BATCH_STATE_FAILED' && jobState !== 'BATCH_STATE_CANCELLED') {
        if (abortController.signal.aborted) {
            throw new Error('Generation cancelled by user.');
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3 seconds
        
        const pollStartTime = performance.now();
        const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
        const pollResponse = await fetch(pollUrl, {
            headers: { 'X-Goog-Api-Key': currentApiKey },
            signal: abortController.signal
        });
        
        pollData = await pollResponse.json();
        const pollEndTime = performance.now();
        const pollDuration = pollEndTime - pollStartTime;

        // Polling queries incur 0 input/output tokens and 0 cost for themselves
        logApiInteraction(
            pollUrl,
            { method: 'GET (Poll Status)' },
            pollData,
            pollDuration,
            0, // Input tokens for poll request
            0, // Output tokens for poll response
            0, // Thought tokens for poll response
            { inputCost: 0, outputCost: 0, totalCost: 0 } // Cost for polling
        );
        finalPollInteractionIndex = allApiInteractions.length - 1; // Keep track of the last poll log entry
        
        jobState = getBatchState(pollData);
        
        // If state is undefined but 'response' exists, it means job succeeded and result is ready
        if (!jobState && pollData.response) {
            jobState = 'BATCH_STATE_SUCCEEDED';
        }
        
        statusMessage.textContent = `Batch Processing... State: ${jobState || 'Unknown'}`;
    }

    if (jobState === 'BATCH_STATE_SUCCEEDED') {
        // Extract results
        let results = null;
        if (pollData.response && pollData.response.inlinedResponses && pollData.response.inlinedResponses.inlinedResponses) {
            results = pollData.response.inlinedResponses.inlinedResponses;
        } else if (pollData.dest && pollData.dest.inlinedResponses) {
            results = pollData.dest.inlinedResponses;
        }
        
        if (!results || !Array.isArray(results)) {
            throw new Error('Job succeeded but result format is unexpected (no inlinedResponses).');
        }

        let successCount = 0;
        let batchOutputTokens = 0;
        let batchThoughtTokens = 0;

        for (const item of results) {
            // Check for error in individual item
            if (item.status && item.status.code && item.status.code !== 0) {
                 const errDiv = document.createElement('div');
                 errDiv.classList.add('image-error');
                 errDiv.textContent = `Image failed: ${item.status.message}`;
                 imageGallery.appendChild(errDiv);
                 continue;
            }

            // item.response contains the GenerateContentResponse, or the item itself is the response structure
            const resp = item.response || item;
            
            if (processAndDisplayImage(resp, prompt)) {
                successCount++;
            } else {
                 const errDiv = document.createElement('div');
                 errDiv.classList.add('image-error');
                 errDiv.textContent = `Image data missing in batch result.`;
                 imageGallery.appendChild(errDiv);
            }

            if (resp.usageMetadata) {
                batchOutputTokens += resp.usageMetadata.candidatesTokenCount || 0;
                batchThoughtTokens += resp.usageMetadata.thoughtsTokenCount || 0;
            } else {
                 if (selectedModel !== GEMINI_3_PRO_MODEL_ID) {
                     batchOutputTokens += GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
                 }
            }
        }
        
        // Update total generation time to reflect wall-clock time
        totalGenerationTime = performance.now() - generationStartTime;

        // Calculate the output cost for the successful images.
        // The input cost was already logged with the initial batch submission.
        const outputImageCostResult = calculateCost(
            selectedModel,
            0, // Input tokens for this "output-only" calculation are 0
            0, // No input image present for this output-only calculation
            successCount, // Only count successfully generated images for output cost
            imageOutputSizeForBatch,
            true // useBatch = true
        );

        // Update the last poll interaction entry with the output cost and tokens
        if (finalPollInteractionIndex !== -1 && allApiInteractions[finalPollInteractionIndex]) {
            const lastInteraction = allApiInteractions[finalPollInteractionIndex];
            
            // Subtract previous 0 cost from global total before adding updated cost
            totalEstimatedCost -= lastInteraction.costDetails.totalCost;
            totalOutputTokens -= lastInteraction.outputTokens; // Subtract previous 0 output tokens
            totalThoughtTokens -= (lastInteraction.thoughtTokens || 0);

            lastInteraction.outputTokens = batchOutputTokens;
            lastInteraction.thoughtTokens = batchThoughtTokens;
            lastInteraction.costDetails.outputCost += outputImageCostResult.outputCost;
            lastInteraction.costDetails.totalCost += outputImageCostResult.outputCost; // Add new output cost
            
            // Add updated values to global totals
            totalOutputTokens += lastInteraction.outputTokens;
            totalThoughtTokens += lastInteraction.thoughtTokens;
            totalEstimatedCost += lastInteraction.costDetails.totalCost;
            updateSummaryDisplay();
            
            // Re-render the last API call entry in debug modal if open
            if (debugInfo.style.display !== 'none') {
                // Remove and re-add the updated entry
                apiCallsContainer.innerHTML = ''; 
                allApiInteractions.forEach((interaction, idx) => appendApiCallEntry(interaction, idx));
                apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
            }
        } else {
            // Fallback: If for some reason finalPollInteractionIndex is invalid, just update global totals
            console.warn("Could not find suitable last API interaction to attach batch output cost. Updating global totals directly.");
            totalOutputTokens += batchOutputTokens;
            totalThoughtTokens += batchThoughtTokens;
            totalEstimatedCost += outputImageCostResult.outputCost;
            updateSummaryDisplay();
        }

        if (successCount === 0) {
            throw new Error('No valid images were extracted from the batch response.');
        }
        statusMessage.textContent = `Successfully generated ${successCount} images via Batch API.`;

    } else {
        throw new Error(`Batch job ended with state: ${jobState}`);
    }
}

async function recoverBatch() {
    const batchName = getLocalStorageItem('geminiLastBatchName');
    if (!batchName) {
        statusMessage.textContent = 'No batch job to recover.';
        return;
    }
    
    if (!currentApiKey) {
        statusMessage.textContent = 'Please set your API Key.';
        return;
    }

    generateImageButton.disabled = true;
    recoverBatchButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';
    statusMessage.textContent = `Recovering batch job: ${batchName}...`;
    
    abortController = new AbortController();
    const startTime = performance.now(); // Note: This resets timer, ideally we'd store start time too but simplified for now

    try {
        // ... Polling Logic (Reused from generateBatchImages essentially) ...
        const getBatchState = (d) => {
            if (d.state) return d.state;
            if (d.metadata && d.metadata.state) return d.metadata.state;
            return undefined;
        };

        let jobState = 'PROCESSING'; // Assume processing to start polling
        let pollData = null;
        let finalPollInteractionIndex = -1;

        while (jobState !== 'BATCH_STATE_SUCCEEDED' && jobState !== 'BATCH_STATE_FAILED' && jobState !== 'BATCH_STATE_CANCELLED') {
            if (abortController.signal.aborted) {
                throw new Error('Recovery cancelled by user.');
            }
            
            const pollStartTime = performance.now();
            const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
            const pollResponse = await fetch(pollUrl, {
                headers: { 'X-Goog-Api-Key': currentApiKey },
                signal: abortController.signal
            });
            
            pollData = await pollResponse.json();
            const pollEndTime = performance.now();
            const pollDuration = pollEndTime - pollStartTime;

            logApiInteraction(
                pollUrl,
                { method: 'GET (Recover Poll Status)' },
                pollData,
                pollDuration,
                0, 0, 0,
                { inputCost: 0, outputCost: 0, totalCost: 0 }
            );
            finalPollInteractionIndex = allApiInteractions.length - 1;
            
            jobState = getBatchState(pollData);
            if (!jobState && pollData.response) {
                jobState = 'BATCH_STATE_SUCCEEDED';
            }
            
            statusMessage.textContent = `Batch Processing (Recovery)... State: ${jobState || 'Unknown'}`;
            
            if (jobState !== 'BATCH_STATE_SUCCEEDED' && jobState !== 'BATCH_STATE_FAILED') {
                 await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        if (jobState === 'BATCH_STATE_SUCCEEDED') {
            // Extract results
            let results = null;
            if (pollData.response && pollData.response.inlinedResponses && pollData.response.inlinedResponses.inlinedResponses) {
                results = pollData.response.inlinedResponses.inlinedResponses;
            } else if (pollData.dest && pollData.dest.inlinedResponses) {
                results = pollData.dest.inlinedResponses;
            }
            
            if (!results || !Array.isArray(results)) {
                throw new Error('Job succeeded but result format is unexpected (no inlinedResponses).');
            }

            let successCount = 0;
            let batchOutputTokens = 0;
            let batchThoughtTokens = 0;
            
            // Re-used result processing logic
            const prompt = getLocalStorageItem('promptInput') || 'Recovered Batch';

            for (const item of results) {
                if (item.status && item.status.code && item.status.code !== 0) {
                     const errDiv = document.createElement('div');
                     errDiv.classList.add('image-error');
                     errDiv.textContent = `Image failed: ${item.status.message}`;
                     imageGallery.appendChild(errDiv);
                     continue;
                }

                const resp = item.response || item;
                if (processAndDisplayImage(resp, prompt)) {
                    successCount++;
                } else {
                     const errDiv = document.createElement('div');
                     errDiv.classList.add('image-error');
                     errDiv.textContent = `Image data missing in batch result.`;
                     imageGallery.appendChild(errDiv);
                }

                if (resp.usageMetadata) {
                    batchOutputTokens += resp.usageMetadata.candidatesTokenCount || 0;
                    batchThoughtTokens += resp.usageMetadata.thoughtsTokenCount || 0;
                } else {
                     if (selectedModel !== GEMINI_3_PRO_MODEL_ID) {
                         batchOutputTokens += GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
                     }
                }
            }
            
            // Calculate output cost
            // Note: We don't have exact input tokens here easily without re-calculation or storage, 
            // so we skip input cost for recovery (it was paid at submission).
            const imageOutputSizeForBatch = getLocalStorageItem('imageSize') || '1K';
            
            const outputImageCostResult = calculateCost(
                selectedModel,
                0, 
                0, 
                successCount, 
                imageOutputSizeForBatch,
                true 
            );

            // Update log
            if (finalPollInteractionIndex !== -1 && allApiInteractions[finalPollInteractionIndex]) {
                const lastInteraction = allApiInteractions[finalPollInteractionIndex];
                totalEstimatedCost -= lastInteraction.costDetails.totalCost;
                totalOutputTokens -= lastInteraction.outputTokens; 
                totalThoughtTokens -= (lastInteraction.thoughtTokens || 0);

                lastInteraction.outputTokens = batchOutputTokens;
                lastInteraction.thoughtTokens = batchThoughtTokens;
                lastInteraction.costDetails.outputCost += outputImageCostResult.outputCost;
                lastInteraction.costDetails.totalCost += outputImageCostResult.outputCost; 
                
                totalOutputTokens += lastInteraction.outputTokens;
                totalThoughtTokens += lastInteraction.thoughtTokens;
                totalEstimatedCost += lastInteraction.costDetails.totalCost;
                updateSummaryDisplay();
                
                if (debugInfo.style.display !== 'none') {
                    apiCallsContainer.innerHTML = ''; 
                    allApiInteractions.forEach((interaction, idx) => appendApiCallEntry(interaction, idx));
                    apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
                }
            }

            statusMessage.textContent = `Successfully recovered ${successCount} images.`;

        } else {
            throw new Error(`Batch job ended with state: ${jobState}`);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            statusMessage.textContent = 'Recovery cancelled.';
        } else {
            console.error(e);
            statusMessage.textContent = `Recovery failed: ${e.message}`;
        }
    } finally {
        generateImageButton.disabled = false;
        recoverBatchButton.disabled = false;
        stopGenerationButton.style.display = 'none';
        abortController = null;
    }
}

// Function to stop image generation
function stopGeneration() {
    if (abortController) {
        abortController.abort();
        statusMessage.textContent = 'Image generation cancelled by user.';
        generateImageButton.disabled = false;
        stopGenerationButton.style.display = 'none';
        abortController = null; // Reset abortController
    }
}


// Event Listeners
setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', updateSelectedModel);
imageCountInput.addEventListener('change', updateNumOutputImages); 
imageCountInput.addEventListener('input', updateNumOutputImages);
aspectRatioSelect.addEventListener('change', updateAspectRatio);
imageSizeSelect.addEventListener('change', updateImageSize);
useGoogleSearchInput.addEventListener('change', updateUseGoogleSearch);
useBatchModeInput.addEventListener('change', updateUseBatchMode); // Add Batch Mode listener
clearAllImagesButton.addEventListener('click', clearAllInputImages);
promptInput.addEventListener('input', () => {
    setLocalStorageItem('promptInput', promptInput.value);
});


// Event listener for Load Image button
loadImageButton.addEventListener('click', () => {
    imageFileInput.click(); // Trigger the hidden file input click
});

// Event listener for hidden file input change (supports multiple files)
imageFileInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            statusMessage.textContent = `Skipped non-image file: ${file.name}`;
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(',')[1]; // Extract the base64 part
            addImageAsInput(base64);
        };
        reader.onerror = (error) => {
            statusMessage.textContent = `Error loading image ${file.name}: ${error}`;
            console.error(`Error loading image ${file.name}:`, error);
        };
        reader.readAsDataURL(file);
    });
    
    // Clear the input so same files can be loaded again if needed (though UI allows duplicate additions)
    imageFileInput.value = '';
});


generateImageButton.addEventListener('click', generateImage);
stopGenerationButton.addEventListener('click', stopGeneration); // New event listener for stop button
recoverBatchButton.addEventListener('click', recoverBatch); // Added listener
promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        generateImage();
    }
});
showApiCallsButton.addEventListener('click', showApiCallsModal); // Use renamed button and modal function
closeDebugButton.addEventListener('click', hideDebugModal);

// Initial setup on page load
document.addEventListener('DOMContentLoaded', () => {
    populateModelSelect();
    loadSettingsFromLocalStorage(); 
    
    // Now toggle features based on the loaded (or default) model
    toggleModelDependentFeatures();

    // Initialize summary display
    updateSummaryDisplay();
});