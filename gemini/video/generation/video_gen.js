// video_gen.js - Implements Gemini Video Understanding (Multimodal)

let currentApiKey = '';
let selectedModel = 'veo-3.1';
let abortController = null;
let allApiInteractions = [];

// Global totals
let totalGenerationTime = 0;
let totalEstimatedCost = 0;

const GEMINI_MODELS = {
    'veo-3.1-generate-preview': 'Veo 3.1',
    'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast',
    'veo-3.0-generate-001': 'Veo 3',
    'veo-3.0-fast-generate-001': 'Veo 3 Fast',
    'veo-2.0-generate-001': 'Veo 2'
};

const PRICING_TABLE = {
    'veo-3.1-generate-preview': { input: 0, output: 0 },
    'veo-3.1-fast-generate-preview': { input: 0, output: 0 },
    'veo-3.0-generate-001': { input: 0, output: 0 },
    'veo-3.0-fast-generate-001': { input: 0, output: 0 },
    'veo-2.0-generate-001': { input: 0, output: 0 }
};

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const promptInput = document.getElementById('promptInput');
const generateButton = document.getElementById('generateButton');
const stopGenerationButton = document.getElementById('stopGenerationButton');
const statusMessage = document.getElementById('statusMessage');
const textOutput = document.getElementById('textOutput');

// Debug & Summary Elements
const showApiCallsButton = document.getElementById('showApiCallsButton');
const debugInfo = document.getElementById('debugInfo');
const apiCallsContainer = document.getElementById('apiCallsContainer');
const closeDebugButton = document.getElementById('closeDebugButton');
const totalGenerationTimeSpan = document.getElementById('totalGenerationTime');
const totalEstimatedCostSpan = document.getElementById('totalEstimatedCost');

// --- Initialization ---

function setLocalStorageItem(name, value) {
    try { localStorage.setItem(name, value); } catch (e) { console.error(e); }
}

function getLocalStorageItem(name) {
    try { return localStorage.getItem(name); } catch (e) { return null; }
}

function setApiKey() {
    const apiKey = geminiApiKeyInput.value.trim();
    if (!apiKey) {
        statusMessage.textContent = 'Please enter your Gemini API Key.';
        return false;
    }
    currentApiKey = apiKey;
    setLocalStorageItem('geminiApiKey', apiKey);
    statusMessage.textContent = 'API Key set successfully!';
    setTimeout(() => statusMessage.textContent = '', 3000);
    return true;
}

function loadSettings() {
    const apiKey = getLocalStorageItem('geminiApiKey');
    if (apiKey) {
        geminiApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
    }
    const storedModel = getLocalStorageItem('selectedVideoModel');
    if (storedModel && GEMINI_MODELS[storedModel]) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
    }
}

function populateModelSelect() {
    geminiModelSelect.innerHTML = '';
    for (const modelId in GEMINI_MODELS) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = GEMINI_MODELS[modelId];
        geminiModelSelect.appendChild(option);
    }
    geminiModelSelect.value = selectedModel;
}

// --- Generation Logic (generateContent) ---

async function generateContent() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        statusMessage.textContent = 'Please enter a prompt.';
        return;
    }
    
    if (!currentApiKey) {
        statusMessage.textContent = 'Please set your API Key.';
        return;
    }

    textOutput.textContent = 'Generating...';
    generateButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';
    statusMessage.textContent = 'Sending request...';

    abortController = new AbortController();
    const startTime = performance.now();

    try {
        const model = geminiModelSelect.value;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt }
                ]
            }]
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        const data = await response.json();
        const duration = performance.now() - startTime;

        if (!response.ok) throw new Error(data.error?.message || response.statusText);

        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || 'No output.';
        textOutput.textContent = text;

        const inputTokens = data.usageMetadata?.promptTokenCount || 0;
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
        const cost = calculateCost(model, inputTokens, outputTokens);

        logApiInteraction(endpoint, requestBody, data, duration, cost);
        statusMessage.textContent = 'Generation complete.';

    } catch (e) {
        if (e.name === 'AbortError') {
            statusMessage.textContent = 'Cancelled.';
        } else {
            console.error(e);
            statusMessage.textContent = `Error: ${e.message}`;
            textOutput.textContent = `Error: ${e.message}`;
        }
    } finally {
        generateButton.disabled = false;
        stopGenerationButton.style.display = 'none';
        abortController = null;
    }
}

function stopGeneration() {
    if (abortController) abortController.abort();
}

// --- Helper Functions ---

function calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = PRICING_TABLE[modelId];
    if (!pricing) return 0;
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

function logApiInteraction(url, request, response, durationMs, cost) {
    const interaction = { url, request, response, durationMs, cost, timestamp: new Date().toISOString() };
    allApiInteractions.push(interaction);
    totalGenerationTime += durationMs;
    totalEstimatedCost += cost;
    updateSummaryDisplay();
    updateDebugButtonText();
    if (debugInfo.style.display !== 'none') {
        appendApiCallEntry(interaction, allApiInteractions.length - 1);
    }
}

function updateSummaryDisplay() {
    totalGenerationTimeSpan.textContent = `${(totalGenerationTime / 1000).toFixed(2)}s`;
    totalEstimatedCostSpan.textContent = `$${totalEstimatedCost.toFixed(6)}`;
}

function updateDebugButtonText() {
    const count = allApiInteractions.length;
    showApiCallsButton.style.display = 'inline-block';
    showApiCallsButton.textContent = `Show ${count} API Call${count !== 1 ? 's' : ''}`;
}

function appendApiCallEntry(interaction, index) {
    const details = document.createElement('details');
    details.className = 'api-call-entry';
    const summary = document.createElement('summary');
    const endpointName = interaction.url.includes('upload') ? 'UPLOAD' : interaction.url.split('models/')[1]?.split(':')[0] || 'API Call';
    summary.innerHTML = `<h4>#${index + 1} ${endpointName} (${(interaction.durationMs/1000).toFixed(2)}s)</h4>`;
    details.appendChild(summary);
    
    const reqDiv = document.createElement('div');
    reqDiv.className = 'debug-section';
    reqDiv.innerHTML = `<h5>Request</h5><div class="debug-content">${JSON.stringify(interaction.request, null, 2)}</div>`;
    details.appendChild(reqDiv);
    
    const resDiv = document.createElement('div');
    resDiv.className = 'debug-section';
    resDiv.innerHTML = `<h5>Response</h5><div class="debug-content">${JSON.stringify(interaction.response, null, 2)}</div>`;
    details.appendChild(resDiv);
    
    apiCallsContainer.appendChild(details);
}

// --- Event Listeners ---

setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', () => {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedVideoModel', selectedModel);
});
generateButton.addEventListener('click', generateContent);
stopGenerationButton.addEventListener('click', stopGeneration);
showApiCallsButton.addEventListener('click', () => {
    apiCallsContainer.innerHTML = '';
    allApiInteractions.forEach((ia, idx) => appendApiCallEntry(ia, idx));
    debugInfo.style.display = 'block';
});
closeDebugButton.addEventListener('click', () => debugInfo.style.display = 'none');
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateContent();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    populateModelSelect();
    updateSummaryDisplay();
});