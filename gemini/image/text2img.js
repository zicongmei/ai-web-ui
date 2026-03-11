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

// --- IndexedDB for Persistent History (bypassing localStorage 5MB limit) ---
const DB_NAME = 'GeminiImageHistoryDB';
const DB_VERSION = 1;
const HISTORY_STORE = 'history';
const SETTINGS_STORE = 'settings';

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                db.createObjectStore(HISTORY_STORE);
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveToDB(storeName, key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error saving to IndexedDB [${storeName}:${key}]:`, e);
    }
}

async function getFromDB(storeName, key) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error reading from IndexedDB [${storeName}:${key}]:`, e);
        return null;
    }
}

// Model names and labels for image generation
const GEMINI_IMAGE_MODELS = {
    'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
    'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash Image Preview',
    'gemini-3-pro-image-preview': 'Gemini 3 Pro Preview Image',
    'imagen-4.0-fast-generate-001': 'Imagen 4 Fast',
    'imagen-4.0-generate-001': 'Imagen 4 Standard',
    'imagen-4.0-ultra-generate-001': 'Imagen 4 Ultra',
    'imagen-4': 'Imagen 4 (Alias)'
};

const GEMINI_3_PRO_MODEL_ID = 'gemini-3-pro-image-preview'; // Define the Gemini 3 model ID

const IMAGEN_STANDARD_RATIOS = [
    { ratio: '1:1', res: '1024x1024', tokens: 1000 },
    { ratio: '3:4', res: '768x1024', tokens: 1000 },
    { ratio: '4:3', res: '1024x768', tokens: 1000 },
    { ratio: '9:16', res: '576x1024', tokens: 1000 },
    { ratio: '16:9', res: '1024x576', tokens: 1000 }
];

const IMAGE_RESOLUTION_DATA = {
    'gemini-2.5-flash-image': [
        { ratio: '1:1', res: '1024x1024', tokens: 1290 },
        { ratio: '2:3', res: '832x1248', tokens: 1290 },
        { ratio: '3:2', res: '1248x832', tokens: 1290 },
        { ratio: '3:4', res: '864x1184', tokens: 1290 },
        { ratio: '4:3', res: '1184x864', tokens: 1290 },
        { ratio: '4:5', res: '896x1152', tokens: 1290 },
        { ratio: '5:4', res: '1152x896', tokens: 1290 },
        { ratio: '9:16', res: '768x1344', tokens: 1290 },
        { ratio: '16:9', res: '1344x768', tokens: 1290 },
        { ratio: '21:9', res: '1536x672', tokens: 1290 }
    ],
    'gemini-3.1-flash-image-preview': [
        { ratio: '1:1', res: { '0.5K': '512x512', '1K': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '2:3', res: { '0.5K': '424x632', '1K': '848x1264', '2K': '1696x2528', '4K': '3392x5056' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '3:2', res: { '0.5K': '632x424', '1K': '1264x848', '2K': '2528x1696', '4K': '5056x3392' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '3:4', res: { '0.5K': '448x600', '1K': '896x1200', '2K': '1792x2400', '4K': '3584x4800' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '4:3', res: { '0.5K': '600x448', '1K': '1200x896', '2K': '2400x1792', '4K': '4800x3584' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '4:5', res: { '0.5K': '464x576', '1K': '928x1152', '2K': '1856x2304', '4K': '3712x4608' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '5:4', res: { '0.5K': '576x464', '1K': '1152x928', '2K': '2304x1856', '4K': '4608x3712' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '9:16', res: { '0.5K': '384x688', '1K': '768x1376', '2K': '1536x2752', '4K': '3072x5504' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '16:9', res: { '0.5K': '688x384', '1K': '1376x768', '2K': '2752x1536', '4K': '5504x3072' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '21:9', res: { '0.5K': '792x336', '1K': '1584x672', '2K': '3168x1344', '4K': '6336x2688' }, tokens: { '0.5K': 500, '1K': 1120, '2K': 1120, '4K': 2000 } }
    ],
    'gemini-3-pro-image-preview': [
        { ratio: '1:1', res: { '1K': '1024x1024', '2K': '2048x2048', '4K': '4096x4096' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '2:3', res: { '1K': '848x1264', '2K': '1696x2528', '4K': '3392x5056' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '3:2', res: { '1K': '1264x848', '2K': '2528x1696', '4K': '5056x3392' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '3:4', res: { '1K': '896x1200', '2K': '1792x2400', '4K': '3584x4800' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '4:3', res: { '1K': '1200x896', '2K': '2400x1792', '4K': '4800x3584' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '4:5', res: { '1K': '928x1152', '2K': '1856x2304', '4K': '3712x4608' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '5:4', res: { '1K': '1152x928', '2K': '2304x1856', '4K': '4608x3712' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '9:16', res: { '1K': '768x1376', '2K': '1536x2752', '4K': '3072x5504' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '16:9', res: { '1K': '1376x768', '2K': '2752x1536', '4K': '5504x3072' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } },
        { ratio: '21:9', res: { '1K': '1584x672', '2K': '3168x1344', '4K': '6336x2688' }, tokens: { '1K': 1120, '2K': 1120, '4K': 2000 } }
    ],
    'imagen-4.0-fast-generate-001': IMAGEN_STANDARD_RATIOS,
    'imagen-4.0-generate-001': IMAGEN_STANDARD_RATIOS,
    'imagen-4.0-ultra-generate-001': IMAGEN_STANDARD_RATIOS,
    'imagen-4': IMAGEN_STANDARD_RATIOS
};

// Get DOM elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const candidateCountInput = document.getElementById('candidateCountInput');
const apiCallCountInput = document.getElementById('apiCallCountInput');
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
const batchRecoveryContainer = document.getElementById('batchRecoveryContainer');
const batchSelect = document.getElementById('batchSelect');

// Selected Image Elements
const selectedImageContainer = document.getElementById('selectedImageContainer');
const selectedImagesList = document.getElementById('selectedImagesList');
const clearAllImagesButton = document.getElementById('clearAllImagesButton');

// New elements for Load Image
const loadImageButton = document.getElementById('loadImageButton');
const imageFileInput = document.getElementById('imageFileInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const addUrlButton = document.getElementById('addUrlButton');

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

// Batch History Management
let batchHistory = [];

async function saveBatchToHistory(batchName, prompt) {
    const batchItem = {
        name: batchName,
        prompt: prompt,
        timestamp: new Date().toISOString()
    };
    batchHistory.unshift(batchItem);
    // Keep only last 20 batches
    if (batchHistory.length > 20) batchHistory = batchHistory.slice(0, 20);
    await saveToDB(SETTINGS_STORE, 'geminiBatchHistory', JSON.stringify(batchHistory));
    renderBatchSelect();
}

async function loadBatchHistory() {
    const stored = await getFromDB(SETTINGS_STORE, 'geminiBatchHistory');
    if (stored) {
        try {
            batchHistory = JSON.parse(stored);
        } catch (e) {
            console.error("Failed to parse batch history:", e);
            batchHistory = [];
        }
    } else {
        // Fallback to old single last batch if available
        const lastBatch = getLocalStorageItem('geminiLastBatchName');
        if (lastBatch) {
            batchHistory = [{ name: lastBatch, prompt: 'Recovered Last Batch', timestamp: new Date().toISOString() }];
            localStorage.removeItem('geminiLastBatchName');
            await saveToDB(SETTINGS_STORE, 'geminiBatchHistory', JSON.stringify(batchHistory));
        }
    }
    renderBatchSelect();
}

function renderBatchSelect() {
    if (!batchSelect || !batchRecoveryContainer) return;
    
    if (batchHistory.length === 0) {
        batchRecoveryContainer.style.display = 'none';
        return;
    }

    batchRecoveryContainer.style.display = 'block';
    batchSelect.innerHTML = '';
    batchHistory.forEach(batch => {
        const option = document.createElement('option');
        option.value = batch.name;
        const words = batch.prompt.split(/\s+/).slice(0, 10).join(' ');
        const truncatedPrompt = words.length < batch.prompt.length ? words + '...' : words;
        option.textContent = `${truncatedPrompt} (Length: ${batch.prompt.length})`;
        batchSelect.appendChild(option);
    });
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

// Function to update Aspect Ratio options based on model and size
function updateAspectRatioOptions() {
    const model = geminiModelSelect.value;
    const size = imageSizeSelect.value;
    const data = IMAGE_RESOLUTION_DATA[model];
    
    if (!data) return;

    const currentVal = aspectRatioSelect.value;
    aspectRatioSelect.innerHTML = '';

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item.ratio;
        
        let resolution, tokens;
        if (model.startsWith('gemini-3')) {
            resolution = item.res[size];
            tokens = item.tokens[size];
        } else {
            resolution = item.res;
            tokens = item.tokens;
        }
        
        option.textContent = `${item.ratio} (${resolution}, ${tokens} tokens)`;
        aspectRatioSelect.appendChild(option);
    });

    // Try to restore previous value
    if (currentVal && Array.from(aspectRatioSelect.options).some(opt => opt.value === currentVal)) {
        aspectRatioSelect.value = currentVal;
    }
}

// Function to load values from localStorage (excluding model-dependent features for initial setup)
async function loadSettingsFromLocalStorage() {
    // API Key
    const apiKey = getLocalStorageItem('geminiApiKey');
    if (apiKey) {
        geminiApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
        statusMessage.textContent = 'Settings loaded from local storage!';
        setTimeout(() => statusMessage.textContent = '', 3000);
    }

    // Number of Images per call
    const storedCandidateCount = getLocalStorageItem('candidateCount');
    if (storedCandidateCount !== null) {
        candidateCountInput.value = storedCandidateCount;
    }

    // Number of API calls
    const storedApiCallCount = getLocalStorageItem('apiCallCount');
    if (storedApiCallCount !== null) {
        apiCallCountInput.value = storedApiCallCount;
    }

    // Populate aspect ratio options first
    updateAspectRatioOptions();

    // Aspect Ratio
    const storedAspectRatio = getLocalStorageItem('aspectRatio');
    if (storedAspectRatio && Array.from(aspectRatioSelect.options).some(opt => opt.value === storedAspectRatio)) {
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

    // Load Selected Input Images from IndexedDB
    const storedInputImages = await getFromDB(SETTINGS_STORE, 'selectedInputImages');
    if (storedInputImages) {
        try {
            selectedInputImages = JSON.parse(storedInputImages);
        } catch (e) {
            console.error("Failed to parse stored images:", e);
            selectedInputImages = [];
        }
    } else {
        // Fallback for backward compatibility with localStorage
        const oldStoredInputImages = getLocalStorageItem('selectedInputImages');
        if (oldStoredInputImages) {
            try {
                selectedInputImages = JSON.parse(oldStoredInputImages);
                // Migrate to DB
                await saveToDB(SETTINGS_STORE, 'selectedInputImages', oldStoredInputImages);
                // localStorage.removeItem('selectedInputImages'); // Keep for now just in case
            } catch (e) {
                console.error("Failed to migrate stored images:", e);
            }
        } else {
            // Further fallback
            const oldSingleImage = getLocalStorageItem('selectedInputImageBase64');
            if (oldSingleImage) {
                selectedInputImages = [oldSingleImage];
                localStorage.removeItem('selectedInputImageBase64');
            }
        }
    }
    renderSelectedImages();

    // Check for recoverable batch job
    await loadBatchHistory();
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
    const isGemini3 = selectedModel.startsWith('gemini-3');

    // Toggle Image Size
    if (isGemini3) {
        imageSizeSelect.disabled = false;
        imageSizeOptionGroup.classList.remove('feature-disabled-by-model');
        const storedImageSize = getLocalStorageItem('imageSize');
        if (storedImageSize && Array.from(imageSizeSelect.options).some(opt => opt.value === storedImageSize)) {
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
    if (isGemini3) {
        useGoogleSearchInput.disabled = false;
        googleSearchOptionGroup.classList.remove('feature-disabled-by-model');
        const storedUseSearch = getLocalStorageItem('useGoogleSearch');
        useGoogleSearchInput.checked = (storedUseSearch === 'true');
    } else {
        useGoogleSearchInput.disabled = true;
        useGoogleSearchInput.checked = false; // Force unchecked for 2.5 models
        googleSearchOptionGroup.classList.add('feature-disabled-by-model');
    }

    // Update Aspect Ratio options based on newly selected model/size
    updateAspectRatioOptions();

    // Update explanation note to reflect feature status
    updateExplanationNote();
}


// Function to update the selected model
function updateSelectedModel() {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedModel', selectedModel);
    toggleModelDependentFeatures(); // Update feature availability based on new model
}

// Function to update the counts
function updateCounts() {
    setLocalStorageItem('candidateCount', candidateCountInput.value);
    setLocalStorageItem('apiCallCount', apiCallCountInput.value);
}

function updateAspectRatio() {
    setLocalStorageItem('aspectRatio', aspectRatioSelect.value);
}

function updateImageSize() {
    // Only save if the feature is enabled (i.e., for Gemini 3 Pro)
    if (!imageSizeSelect.disabled) {
        setLocalStorageItem('imageSize', imageSizeSelect.value);
        updateAspectRatioOptions(); // Update options when size changes
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
        saveToDB(SETTINGS_STORE, 'selectedInputImages', JSON.stringify([]));
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

    // Update IndexedDB whenever render is called
    saveToDB(SETTINGS_STORE, 'selectedInputImages', JSON.stringify(selectedInputImages));
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
    const filename = `gemini_image_${prompt.substring(0, 50).replace(/[\\/:*?"<>|]/g, '_') || 'generated'}_${Date.now()}.png`;
    link.download = filename;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link); // Clean up
    statusMessage.textContent = 'Image saved successfully!';
    setTimeout(() => statusMessage.textContent = '', 3000);
}

// Token and Price Calculation Logic
function calculateCost(modelId, inputTextTokens, inputImageCount, outputImageCount, imageOutputSize, selectedAspectRatio, useBatch = false) {
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
    } else if (modelId.startsWith('gemini-2.5-flash-image') || modelId.startsWith('gemini-2.0-flash') || modelId === 'gemini-3.1-flash-image-preview') {
        if (inputImageCount > 0) {
            totalInputTokensCalculated += inputImageCount * GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
        }
        inputCost += (totalInputTokensCalculated / TOKENS_PER_MILLION) * modelPricing.input.text_and_image_per_m_tokens;
    } else if (modelId.startsWith('imagen-')) {
        // Imagen models typically don't charge for input tokens in this API tier, or have fixed per-image pricing on output
        inputCost = 0;
    }

    // --- Output Cost Calculation ---
    if (outputImageCount > 0) {
        if (modelId === 'gemini-3-pro-image-preview') {
            if (imageOutputSize === '4K') {
                outputCost += outputImageCount * modelPricing.output.image_4K_fixed_price;
            } else { // '1K' or '2K'
                outputCost += outputImageCount * modelPricing.output.image_1K_2K_fixed_price;
            }
            
            // Update totalOutputTokensCalculated based on data table
            const data = IMAGE_RESOLUTION_DATA[modelId];
            const item = data.find(i => i.ratio === selectedAspectRatio);
            if (item) {
                totalOutputTokensCalculated = outputImageCount * item.tokens[imageOutputSize];
            }
        } else if (modelId === 'gemini-3.1-flash-image-preview') {
            if (imageOutputSize === '4K') {
                outputCost += outputImageCount * modelPricing.output.image_4K_fixed_price;
            } else if (imageOutputSize === '2K') {
                outputCost += outputImageCount * modelPricing.output.image_2K_fixed_price;
            } else if (imageOutputSize === '1K') {
                outputCost += outputImageCount * modelPricing.output.image_1K_fixed_price;
            } else if (imageOutputSize === '0.5K') {
                outputCost += outputImageCount * modelPricing.output.image_0_5K_fixed_price;
            }
            
            const data = IMAGE_RESOLUTION_DATA[modelId];
            const item = data.find(i => i.ratio === selectedAspectRatio);
            if (item) {
                totalOutputTokensCalculated = outputImageCount * item.tokens[imageOutputSize];
            }
        } else if (modelId.startsWith('gemini-2.5-flash-image') || modelId.startsWith('gemini-2.0-flash')) {
            outputCost += outputImageCount * modelPricing.output.image_1K_fixed_price;
            
            const data = IMAGE_RESOLUTION_DATA[modelId];
            const item = data.find(i => i.ratio === selectedAspectRatio);
            if (item) {
                totalOutputTokensCalculated = outputImageCount * item.tokens;
            } else {
                totalOutputTokensCalculated = outputImageCount * GEMINI_PRICING_CONFIG.TOKEN_EQUIVALENTS.IMAGE_DEFAULT_1K_TOKENS;
            }
        } else if (modelId.startsWith('imagen-')) {
            outputCost += outputImageCount * modelPricing.output.image_fixed_price;
            const data = IMAGE_RESOLUTION_DATA[modelId];
            const item = data.find(i => i.ratio === selectedAspectRatio);
            totalOutputTokensCalculated = outputImageCount * (item ? item.tokens : 1000);
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
    const isGemini3 = selectedModel.startsWith('gemini-3');
    let noteText = `
        <strong>Instructions:</strong>
        Enter your Gemini API Key. Select options (Model, Aspect Ratio), type a prompt, and click "Generate". 
        <br><small>To use an image as input, select it from the <strong>Generation History</strong> sidebar. You can also "Load Image as Input" from your device.</small>
    `;

    if (isGemini3) {
        noteText += `<br><small><strong>Gemini 3 models</strong> selected: Image Size and Google Search Tool are available.</small>`;
    } else {
        noteText += `<br><small><strong>Gemini 2.5 models</strong> selected: Image Size and Google Search Tool are disabled as they are only supported by Gemini 3 models.</small>`;
    }
    explanationNote.innerHTML = noteText;
}

// Helper to process and display a single image response
function processAndDisplayImage(imageData, prompt) {
    let successfulCount = 0;
    
    // 1. Handle standard generateContent response (Gemini models)
    if (imageData.candidates && Array.isArray(imageData.candidates)) {
        for (const candidate of imageData.candidates) {
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    const base64 = part.inlineData?.data || part.inline_data?.data;
                    if (base64) {
                        displaySingleImage(base64, prompt);
                        successfulCount++;
                    }
                }
            }
        }
    }

    // 2. Handle predict response (Imagen models)
    if (imageData.predictions && Array.isArray(imageData.predictions)) {
        for (const prediction of imageData.predictions) {
            const base64 = prediction.bytesBase64Encoded || prediction.data;
            if (base64) {
                displaySingleImage(base64, prompt);
                successfulCount++;
            }
        }
    }

    return successfulCount > 0;
}

// Sidebar elements
const sidebar = document.getElementById('sidebar');
const sidebarHistory = document.getElementById('sidebarHistory');
const sidebarToggle = document.getElementById('sidebarToggle');

let generationHistory = [];

// Function to load history from IndexedDB
async function loadHistory() {
    const storedHistory = await getFromDB(HISTORY_STORE, 'geminiGenerationHistory');
    if (storedHistory) {
        if (typeof storedHistory === 'string') {
            try {
                generationHistory = JSON.parse(storedHistory);
                // Migrate to raw object storage
                await saveHistory();
            } catch (e) {
                console.error("Failed to parse history from DB:", e);
                generationHistory = [];
            }
        } else {
            generationHistory = storedHistory;
        }
        renderHistory();
    } else {
        // Fallback for migration from localStorage
        const oldHistory = getLocalStorageItem('geminiGenerationHistory');
        if (oldHistory) {
            try {
                generationHistory = JSON.parse(oldHistory);
                await saveHistory(); // Save to DB
                renderHistory();
            } catch (e) {
                console.error("Failed to migrate history from localStorage:", e);
            }
        }
    }
}

// Function to save history to IndexedDB
async function saveHistory() {
    // Store the raw array (IndexedDB handles Blobs and other complex objects)
    await saveToDB(HISTORY_STORE, 'geminiGenerationHistory', generationHistory);
}

// Function to add an item to history
async function addToHistory(item) {
    generationHistory.unshift(item); // Add to the beginning
    await saveHistory();
    renderHistory();
}

// Function to remove an item from history
async function removeFromHistory(index) {
    const item = generationHistory[index];
    // If it's a video, we might want to revoke the URL if we created one
    // But since we recreate them on render, we just need to manage memory
    generationHistory.splice(index, 1);
    await saveHistory();
    renderHistory();
}

// Lightbox Elements
const imageLightbox = document.getElementById('imageLightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxClose = document.querySelector('.lightbox-close');

function openLightbox(base64, caption = '') {
    if (!imageLightbox || !lightboxImage) return;
    lightboxImage.src = `data:image/png;base64,${base64}`;
    if (lightboxCaption) lightboxCaption.textContent = caption;
    imageLightbox.style.display = 'block';
}

// Function to render the history sidebar
function renderHistory() {
    if (!sidebarHistory) return;
    sidebarHistory.innerHTML = '';
    
    // Check if we are on the video page (via existence of assignedImagesContainer)
    const isVideoPage = !!document.getElementById('assignedImagesContainer');

    generationHistory.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.style.border = '1px solid #ddd';
        historyItem.style.padding = '8px';
        historyItem.style.marginBottom = '10px';
        historyItem.style.borderRadius = '4px';
        historyItem.style.backgroundColor = '#fefefe';
        
        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${item.data}`;
            img.alt = item.prompt || 'Generated Image';
            img.title = item.prompt || 'Click to view full size';
            img.onclick = () => {
                openLightbox(item.data, item.prompt);
            };
            historyItem.appendChild(img);
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            if (item.data instanceof Blob) {
                video.src = URL.createObjectURL(item.data);
            } else {
                video.src = item.url;
            }
            video.controls = true;
            historyItem.appendChild(video);
        } else if (item.type === 'batch' || item.type === 'operation') {
            const info = document.createElement('div');
            info.style.fontSize = '0.85em';
            info.innerHTML = `
                <div style="font-weight:bold; color:#d93025; margin-bottom:5px;">Pending ${item.type === 'batch' ? 'Batch' : 'Video'}</div>
                <div style="margin-bottom:3px;"><strong>Model:</strong> ${item.model || 'Unknown'}</div>
                <div style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis;" title="${item.prompt}"><strong>Prompt:</strong> ${item.prompt}</div>
                <div style="font-size:0.75em; color:#666; margin-top:5px;">ID: ${item.name}</div>
            `;
            historyItem.appendChild(info);
            
            const retrieveBtn = document.createElement('button');
            retrieveBtn.textContent = 'Retrieve Results';
            retrieveBtn.className = 'btn-use-input';
            retrieveBtn.style.width = '100%';
            retrieveBtn.style.marginTop = '8px';
            retrieveBtn.onclick = () => {
                if (item.type === 'batch') {
                    if (typeof recoverBatchByName === 'function') {
                        recoverBatchByName(item.name, item.prompt);
                    } else {
                        // Fallback if the named function isn't globally available or defined yet
                        alert('Retrieval logic not initialized.');
                    }
                } else if (item.type === 'operation') {
                    if (typeof recoverVideoOperationByName === 'function') {
                        recoverVideoOperationByName(item.name);
                    } else {
                        alert('Video retrieval logic not initialized.');
                    }
                }
            };
            historyItem.appendChild(retrieveBtn);
        }
        
        const actions = document.createElement('div');
        actions.className = 'history-item-actions';
        actions.style.flexWrap = 'wrap'; 
        actions.style.marginTop = '5px';
        
        if (item.type === 'image') {
            if (isVideoPage) {
                const btnConfigs = [
                    { label: 'Start', role: 'image' },
                    { label: 'End', role: 'lastFrame' },
                    { label: 'Ref', role: 'referenceImage' }
                ];
                
                btnConfigs.forEach(cfg => {
                    const btn = document.createElement('button');
                    btn.textContent = cfg.label;
                    btn.className = 'btn-use-input';
                    btn.style.fontSize = '0.7em';
                    btn.style.padding = '3px';
                    btn.onclick = () => {
                        if (typeof addAssignedImage === 'function') {
                            addAssignedImage(item.data, 'image/png');
                            if (assignedImages.length > 0) {
                                assignedImages[assignedImages.length - 1].role = cfg.role;
                                if (typeof renderAssignedImages === 'function') renderAssignedImages();
                            }
                        }
                        if (window.innerWidth <= 992) sidebar.classList.remove('active');
                    };
                    actions.appendChild(btn);
                });
            } else {
                const useBtn = document.createElement('button');
                useBtn.textContent = 'Input';
                useBtn.className = 'btn-use-input';
                useBtn.onclick = () => {
                    addImageAsInput(item.data);
                    if (window.innerWidth <= 992) sidebar.classList.remove('active');
                };
                actions.appendChild(useBtn);
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.className = 'btn-download'; 
            saveBtn.onclick = () => saveGeneratedImage(item.data, item.prompt || '');
            actions.appendChild(saveBtn);
        } else if (item.type === 'video') {
            const downloadLink = document.createElement('a');
            if (item.data instanceof Blob) {
                downloadLink.href = URL.createObjectURL(item.data);
            } else {
                downloadLink.href = item.url;
            }
            downloadLink.download = item.filename || 'video.mp4';
            downloadLink.textContent = 'Save';
            downloadLink.className = 'btn-download';
            actions.appendChild(downloadLink);
        }
        
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Delete';
        removeBtn.className = 'btn-remove';
        removeBtn.onclick = () => removeFromHistory(index);
        actions.appendChild(removeBtn);
        
        historyItem.appendChild(actions);
        sidebarHistory.appendChild(historyItem);
    });
}

// Sidebar toggle logic
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

async function clearAllHistory() {
    if (confirm('Are you sure you want to clear all generation history? This cannot be undone.')) {
        generationHistory = [];
        await saveHistory();
        renderHistory();
    }
}

async function saveAllHistory() {
    if (generationHistory.length === 0) {
        statusMessage.textContent = 'No history to save.';
        return;
    }
    
    statusMessage.textContent = `Saving ${generationHistory.length} items...`;
    
    for (const item of generationHistory) {
        if (item.type === 'image') {
            saveGeneratedImage(item.data, item.prompt || '');
        } else if (item.type === 'video') {
            const link = document.createElement('a');
            if (item.data instanceof Blob) {
                link.href = URL.createObjectURL(item.data);
            } else {
                link.href = item.url;
            }
            link.download = item.filename || 'video.mp4';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        // Small delay to prevent browser from blocking multiple downloads
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    statusMessage.textContent = 'All items saved.';
}

const saveAllHistoryButton = document.getElementById('saveAllHistoryButton');
const clearAllHistoryButton = document.getElementById('clearAllHistoryButton');

if (saveAllHistoryButton) saveAllHistoryButton.addEventListener('click', saveAllHistory);
if (clearAllHistoryButton) clearAllHistoryButton.addEventListener('click', clearAllHistory);

function displaySingleImage(base64Image, prompt) {
    const imgContainer = document.createElement('div');
    imgContainer.classList.add('image-item');
    
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${base64Image}`;
    img.alt = prompt;
    imgContainer.appendChild(img);

    const buttonGroup = document.createElement('div');
    buttonGroup.classList.add('image-item-buttons'); 

    // Removed Use as Input button from gallery as per requirement
    
    const saveImageBtn = document.createElement('button');
    saveImageBtn.textContent = 'Save Image';
    saveImageBtn.classList.add('save-image-btn');
    saveImageBtn.onclick = () => saveGeneratedImage(base64Image, prompt);
    buttonGroup.appendChild(saveImageBtn);

    imgContainer.appendChild(buttonGroup); 
    imageGallery.appendChild(imgContainer);

    // Add to history
    addToHistory({
        type: 'image',
        data: base64Image,
        prompt: prompt,
        timestamp: new Date().toISOString()
    });
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

    const candidatesPerCall = parseInt(candidateCountInput.value, 10) || 1;
    const numApiCalls = parseInt(apiCallCountInput.value, 10) || 1;

    try {
        for (let i = 0; i < numApiCalls; i++) {
            if (abortController.signal.aborted) {
                throw new Error('Generation cancelled by user.');
            }
            
            if (numApiCalls > 1) {
                statusMessage.textContent = `API Call ${i + 1} of ${numApiCalls}...`;
            }

            if (candidatesPerCall > 1 && useBatchModeInput.checked && !selectedModel.startsWith('imagen-')) {
                // Use Batch API for multiple images (Gemini only)
                await generateBatchImages(prompt, candidatesPerCall);
            } else {
                // Use standard API (supports multiple candidates/samples natively, including Imagen :predict)
                await generateSingleImage(prompt, candidatesPerCall);
            }
        }
        
        if (numApiCalls > 1) {
            statusMessage.textContent = `Finished ${numApiCalls} API calls.`;
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
// Function to generate image(s) (Synchronous/Direct)
async function generateSingleImage(prompt, count = 1) {
    statusMessage.textContent = count > 1 ? `Generating ${count} images...` : 'Generating image...';

    const inputImageCount = selectedInputImages.length;
    const imageOutputSize = imageSizeSelect.value;
    const selectedAspectRatio = aspectRatioSelect.value;
    
    let requestBody;
    let endpoint;
    const isImagen = selectedModel.startsWith('imagen-');

    if (isImagen) {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predict`;
        requestBody = {
            instances: [{ prompt: prompt }],
            parameters: {
                sampleCount: count,
                aspectRatio: selectedAspectRatio
            }
        };
        // Add imageSize if not fast model (Standard/Ultra support 1K/2K)
        if (!selectedModel.includes('fast')) {
            requestBody.parameters.imageSize = imageOutputSize;
        }
    } else {
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
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
            imageConfig: { aspectRatio: selectedAspectRatio }
        };
        if (!imageSizeSelect.disabled) {
            generationConfig.imageConfig.imageSize = imageOutputSize;
        }
        // candidateCount might not be supported for image modalities in all versions, 
        // but can be included if user wants multiple candidates.
        if (count > 1) {
            generationConfig.candidateCount = count;
        }

        requestBody = {
            contents: [{ parts: parts }],
            generationConfig: generationConfig
        };
        if (!useGoogleSearchInput.disabled && useGoogleSearchInput.checked) {
            requestBody.tools = [{ google_search: {} }];
        }
    }

    const apiCallStartTime = performance.now();
    const inputTextTokens = Math.ceil(prompt.length / 4);

    // Calculate cost for this API call
    const costResult = calculateCost(selectedModel, inputTextTokens, inputImageCount, count, imageOutputSize, selectedAspectRatio, false);

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
        throw new Error(data.error?.message || `API Error: ${response.statusText}`);
    }

    let successfulOutputImages = 0;
    
    // processAndDisplayImage handles both formats
    if (processAndDisplayImage(data, prompt)) {
        // Count images from response
        if (isImagen && data.predictions) {
            successfulOutputImages = data.predictions.length;
        } else if (data.candidates) {
            data.candidates.forEach(c => {
                if (c.content && c.content.parts) {
                    c.content.parts.forEach(p => {
                        if (p.inlineData || p.inline_data) successfulOutputImages++;
                    });
                }
            });
        }
    }

    totalGenerationTime = performance.now() - generationStartTime;
    
    let actualInputTokens = inputTextTokens;
    let actualOutputTokens = 0;
    let actualThoughtTokens = 0;

    if (data.usageMetadata) {
        actualInputTokens = data.usageMetadata.promptTokenCount || 0;
        actualOutputTokens = data.usageMetadata.candidatesTokenCount || 0;
        actualThoughtTokens = data.usageMetadata.thoughtsTokenCount || 0;
    }

    const finalCostResult = calculateCost(selectedModel, actualInputTokens, inputImageCount, successfulOutputImages, imageOutputSize, selectedAspectRatio, false);

    if (actualOutputTokens === 0 && successfulOutputImages > 0) {
        actualOutputTokens = finalCostResult.outputTokens;
    }

    logApiInteraction(endpoint, requestBody, data, duration, actualInputTokens, actualOutputTokens, actualThoughtTokens, finalCostResult);

    if (successfulOutputImages === 0) {
         throw new Error('No valid image data found in response.');
    }
    statusMessage.textContent = 'Image(s) generated successfully!';
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
        aspectRatioSelect.value,
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
    // Save to history
    await saveBatchToHistory(batchName, prompt);
    
    // Add to history sidebar
    addToHistory({
        type: 'batch',
        name: batchName,
        prompt: prompt,
        model: selectedModel,
        timestamp: new Date().toISOString()
    });

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
            aspectRatioSelect.value,
            true // useBatch = true
        );

        // If usageMetadata didn't provide enough tokens, fallback to calculated ones
        if (batchOutputTokens === 0 && successCount > 0) {
            batchOutputTokens = outputImageCostResult.outputTokens;
        }

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

// Function to recover a batch by its name (ID)
async function recoverBatchByName(name, originalPrompt) {
    // We can't easily populate the dropdown from here without more state, 
    // but we can set the input and trigger the recovery logic directly.
    
    // Check if we are on the image page (via existence of promptInput)
    const isImagePage = !!document.getElementById('promptInput');
    if (!isImagePage) {
        alert('Please go to the Image Generation page to retrieve this batch.');
        return;
    }

    if (!currentApiKey) {
        alert('Please set your Gemini API Key first.');
        return;
    }

    // Set the prompt if available
    if (originalPrompt) promptInput.value = originalPrompt;
    
    // We'll temporarily override the dropdown value or just call the logic with the name
    // Since recoverBatch uses batchSelect.value, we'll try to find it or inject it
    let found = false;
    for (let i = 0; i < batchSelect.options.length; i++) {
        if (batchSelect.options[i].value === name) {
            batchSelect.selectedIndex = i;
            found = true;
            break;
        }
    }
    
    if (!found) {
        // Inject a temporary option if not in the dropdown
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `Sidebar Retrieval: ${name}`;
        batchSelect.appendChild(option);
        batchSelect.value = name;
    }

    // Trigger recovery
    recoverBatch();
}

// Make it global for sidebar buttons
window.recoverBatchByName = recoverBatchByName;

async function recoverBatch() {
    const batchName = batchSelect.value;
    if (!batchName) {
        statusMessage.textContent = 'No batch job selected.';
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
                aspectRatioSelect.value,
                true 
            );

            // If usageMetadata didn't provide enough tokens, fallback to calculated ones
            if (batchOutputTokens === 0 && successCount > 0) {
                batchOutputTokens = outputImageCostResult.outputTokens;
            }

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
candidateCountInput.addEventListener('change', updateCounts); 
candidateCountInput.addEventListener('input', updateCounts);
apiCallCountInput.addEventListener('change', updateCounts);
apiCallCountInput.addEventListener('input', updateCounts);
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

async function addImageFromUrl() {
    const url = imageUrlInput.value.trim();
    if (!url) return;

    statusMessage.textContent = 'Fetching image from URL...';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('URL does not point to a valid image.');
        }

        const base64Data = await blobToBase64(blob);
        const base64 = base64Data.split(',')[1];
        addImageAsInput(base64);
        imageUrlInput.value = '';
        statusMessage.textContent = 'Image added from URL.';
        setTimeout(() => {
            if (statusMessage.textContent === 'Image added from URL.') {
                statusMessage.textContent = '';
            }
        }, 3000);
    } catch (error) {
        console.error('Error adding image from URL:', error);
        statusMessage.textContent = `Error: ${error.message} (CORS might block some URLs)`;
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

addUrlButton.addEventListener('click', addImageFromUrl);


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

// Lightbox closing event listeners
if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
        imageLightbox.style.display = 'none';
    });
}

if (imageLightbox) {
    imageLightbox.addEventListener('click', (event) => {
        if (event.target === imageLightbox) {
            imageLightbox.style.display = 'none';
        }
    });
}

// Initial setup on page load
document.addEventListener('DOMContentLoaded', async () => {
    populateModelSelect();
    await loadSettingsFromLocalStorage(); 
    await loadHistory();
    
    // Now toggle features based on the loaded (or default) model
    toggleModelDependentFeatures();

    // Initialize summary display
    updateSummaryDisplay();
});
