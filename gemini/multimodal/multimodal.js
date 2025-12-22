// multimodal.js

let currentApiKey = '';
let selectedModel = 'gemini-2.0-flash';
let selectedImages = []; // Array of { file, base64, mimeType }
let abortController = null;

// Global totals
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCost = 0;

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const promptInput = document.getElementById('promptInput');
const imageFileInput = document.getElementById('imageFileInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const addUrlButton = document.getElementById('addUrlButton');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const submitButton = document.getElementById('submitButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const errorMessage = document.getElementById('errorMessage');
const textOutput = document.getElementById('textOutput');
const currentTokenStats = document.getElementById('currentTokenStats');
const currentCostStats = document.getElementById('currentCostStats');
const totalTokenStats = document.getElementById('totalTokenStats');
const totalCostStats = document.getElementById('totalCostStats');
const toggleDebugButton = document.getElementById('toggleDebugButton');
const debugContent = document.getElementById('debugContent');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');

// --- Initialization ---

function init() {
    loadSettings();
    addEventListeners();
}

function loadSettings() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (apiKey) {
        currentApiKey = apiKey;
        geminiApiKeyInput.value = apiKey;
    }
    const storedModel = localStorage.getItem('selectedMultimodalModel');
    if (storedModel) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
    }
}

function addEventListeners() {
    setApiKeyButton.addEventListener('click', () => {
        const apiKey = geminiApiKeyInput.value.trim();
        if (apiKey) {
            currentApiKey = apiKey;
            localStorage.setItem('geminiApiKey', apiKey);
            statusMessage.textContent = 'API Key set successfully!';
            setTimeout(() => statusMessage.textContent = '', 3000);
        }
    });

    geminiModelSelect.addEventListener('change', () => {
        selectedModel = geminiModelSelect.value;
        localStorage.setItem('selectedMultimodalModel', selectedModel);
    });

    imageFileInput.addEventListener('change', handleImageSelection);

    addUrlButton.addEventListener('click', addImageFromUrl);

    submitButton.addEventListener('click', analyzeImages);

    stopButton.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            statusMessage.textContent = 'Request stopped.';
            resetUIState();
        }
    });

    toggleDebugButton.addEventListener('click', () => {
        debugContent.classList.toggle('hidden');
    });
}

// --- Image Handling ---

async function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;

        try {
            const base64Data = await fileToBase64(file);
            const imageInfo = {
                id: Date.now() + Math.random(),
                file: file,
                base64: base64Data.split(',')[1],
                mimeType: file.type,
                previewUrl: base64Data
            };
            selectedImages.push(imageInfo);
            renderPreview(imageInfo);
        } catch (error) {
            console.error('Error processing image:', error);
            errorMessage.textContent = 'Error processing some images.';
        }
    }
    imageFileInput.value = ''; // Reset input so same file can be selected again
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function addImageFromUrl() {
    const url = imageUrlInput.value.trim();
    if (!url) return;

    statusMessage.textContent = 'Fetching image from URL...';
    errorMessage.textContent = '';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('URL does not point to a valid image.');
        }

        const base64Data = await blobToBase64(blob);
        const imageInfo = {
            id: Date.now() + Math.random(),
            base64: base64Data.split(',')[1],
            mimeType: blob.type,
            previewUrl: base64Data
        };
        selectedImages.push(imageInfo);
        renderPreview(imageInfo);
        imageUrlInput.value = '';
        statusMessage.textContent = 'Image added successfully.';
        setTimeout(() => statusMessage.textContent = '', 3000);
    } catch (error) {
        console.error('Error adding image from URL:', error);
        errorMessage.textContent = `Error: ${error.message} (Note: CORS may block some external URLs)`;
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

function renderPreview(imageInfo) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.dataset.id = imageInfo.id;
    
    const img = document.createElement('img');
    img.src = imageInfo.previewUrl;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
        selectedImages = selectedImages.filter(img => img.id !== imageInfo.id);
        div.remove();
    };
    
    div.appendChild(img);
    div.appendChild(removeBtn);
    imagePreviewContainer.appendChild(div);
}

// --- API Request ---

async function analyzeImages() {
    const prompt = promptInput.value.trim();
    if (!prompt && selectedImages.length === 0) {
        errorMessage.textContent = 'Please provide a prompt or at least one image.';
        return;
    }

    if (!currentApiKey) {
        errorMessage.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    errorMessage.textContent = '';
    statusMessage.textContent = 'Analyzing...';
    textOutput.textContent = '';
    submitButton.disabled = true;
    stopButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

        // Construct parts
        const parts = [];
        if (prompt) {
            parts.push({ text: prompt });
        }
        for (const img of selectedImages) {
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64
                }
            });
        }

        const requestBody = {
            contents: [{ role: 'user', parts: parts }]
        };

        apiRequestBody.textContent = JSON.stringify(requestBody, null, 2);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': currentApiKey
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        if (!response.ok) {
            const errorData = await response.json();
            apiResponseBody.textContent = JSON.stringify(errorData, null, 2);
            throw new Error(errorData.error?.message || response.statusText);
        }

        const data = await response.json();
        apiResponseBody.textContent = JSON.stringify(data, null, 2);

        if (data.candidates && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            textOutput.textContent = text;
        } else {
            textOutput.textContent = 'No text response received.';
        }

        updateStats(data);
        statusMessage.textContent = 'Analysis complete.';

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            console.error('API Error:', error);
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        resetUIState();
    }
}

function resetUIState() {
    submitButton.disabled = false;
    stopButton.classList.add('hidden');
    abortController = null;
}

function updateStats(data) {
    if (data.usageMetadata) {
        const inputTokens = data.usageMetadata.promptTokenCount || 0;
        const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        
        currentTokenStats.textContent = `Tokens: In ${inputTokens}, Out ${outputTokens}`;
        totalTokenStats.textContent = `Tokens: In ${totalInputTokens}, Out ${totalOutputTokens}`;
        
        // Calculate cost using GEMINI_PRICING_CONFIG if available
        if (typeof GEMINI_PRICING_CONFIG !== 'undefined') {
            const pricing = GEMINI_PRICING_CONFIG.TEXT[selectedModel];
            if (pricing && pricing.getPricing) {
                const { inputRate, outputRate } = pricing.getPricing(inputTokens);
                const currentCost = (inputTokens * inputRate) + (outputTokens * outputRate);
                totalCost += currentCost;
                
                currentCostStats.textContent = `Cost: $${currentCost.toFixed(6)}`;
                totalCostStats.textContent = `Total Cost: $${totalCost.toFixed(6)}`;
            } else {
                currentCostStats.textContent = `Cost: (Pricing N/A)`;
                totalCostStats.textContent = `Total Cost: $${totalCost.toFixed(6)} (approx)`;
            }
        }
    }
}

init();
