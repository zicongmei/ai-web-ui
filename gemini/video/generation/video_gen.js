// video_gen.js - Implements Gemini Video Understanding (Multimodal)

let currentApiKey = '';
let selectedModel = 'gemini-1.5-flash';
let abortController = null;
let allApiInteractions = [];
let uploadedFileUri = null;
let currentVideoDuration = 0;

// Global totals
let totalGenerationTime = 0;
let totalEstimatedCost = 0;

const GEMINI_MODELS = {
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-2.0-flash-exp': 'Gemini 2.0 Flash (Experimental)'
};

const PRICING_TABLE = {
    'gemini-1.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
    'gemini-1.5-pro': { input: 3.50 / 1000000, output: 10.50 / 1000000 },
    'gemini-2.0-flash-exp': { input: 0, output: 0 }
};

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const videoFileInput = document.getElementById('videoFileInput');
const videoPreviewContainer = document.getElementById('videoPreviewContainer');
const videoPreview = document.getElementById('videoPreview');
const videoDurationSpan = document.getElementById('videoDuration');
const uploadStatusContainer = document.getElementById('uploadStatusContainer');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatusText = document.getElementById('uploadStatusText');
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

// --- Upload Logic (File API) ---

videoFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentApiKey) {
        alert("Please set your API Key before uploading.");
        videoFileInput.value = '';
        return;
    }

    uploadedFileUri = null;
    generateButton.disabled = true;
    textOutput.textContent = '';
    statusMessage.textContent = '';
    
    // Preview
    const url = URL.createObjectURL(file);
    videoPreview.src = url;
    videoPreviewContainer.style.display = 'block';
    
    videoPreview.onloadedmetadata = () => {
        currentVideoDuration = videoPreview.duration;
        videoDurationSpan.textContent = `Duration: ${currentVideoDuration.toFixed(1)}s`;
    };

    try {
        await uploadVideoFile(file);
    } catch (e) {
        console.error("Upload failed:", e);
        statusMessage.textContent = `Upload failed: ${e.message}`;
        uploadStatusText.textContent = "Upload failed.";
        uploadProgressBar.style.width = '0%';
        uploadProgressBar.style.backgroundColor = '#dc3545';
    }
});

async function uploadVideoFile(file) {
    uploadStatusContainer.style.display = 'block';
    uploadStatusText.textContent = "Initializing upload...";
    uploadProgressBar.style.width = '0%';
    uploadProgressBar.style.backgroundColor = '#007bff';

    const numBytes = file.size;
    const displayName = file.name;

    // 1. Start Resumable Upload
    const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${currentApiKey}`;
    const initHeaders = {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': numBytes.toString(),
        'X-Goog-Upload-Header-Content-Type': file.type,
        'Content-Type': 'application/json'
    };
    const initBody = JSON.stringify({ file: { display_name: displayName } });

    const startTime = performance.now();
    const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: initHeaders,
        body: initBody
    });

    if (!initResponse.ok) throw new Error(`Init failed: ${initResponse.statusText}`);
    
    const uploadUrl = initResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL returned.");

    logApiInteraction(initUrl, initBody, {header_url: uploadUrl}, performance.now() - startTime, 0);

    // 2. Upload Bytes
    uploadStatusText.textContent = "Uploading video data...";
    const uploadHeaders = {
        'Content-Length': numBytes.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
    };

    const uploadStartTime = performance.now();
    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: uploadHeaders,
        body: file
    });
    
    const uploadData = await uploadResponse.json();
    logApiInteraction("UPLOAD_BYTES", "[Binary Data]", uploadData, performance.now() - uploadStartTime, 0);

    if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadData.error?.message || uploadResponse.statusText}`);

    const fileUri = uploadData.file.uri;
    const fileName = uploadData.file.name;

    uploadProgressBar.style.width = '100%';
    uploadStatusText.textContent = "Processing video...";

    // 3. Poll for Active State
    await pollFileState(fileName);

    uploadedFileUri = fileUri;
    uploadStatusText.textContent = "Video ready.";
    generateButton.disabled = false;
    statusMessage.textContent = "Video uploaded. Ready to generate.";
}

async function pollFileState(resourceName) {
    let state = 'PROCESSING';
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${resourceName}?key=${currentApiKey}`;

    while (state === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 2000));
        const resp = await fetch(pollUrl);
        const data = await resp.json();
        state = data.state;
        
        if (state === 'FAILED') throw new Error("Video processing failed.");
    }
}

// --- Generation Logic (generateContent) ---

async function generateContent() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        statusMessage.textContent = 'Please enter a prompt.';
        return;
    }
    if (!uploadedFileUri) {
        statusMessage.textContent = 'Please upload a video first.';
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
                    { text: prompt },
                    { fileData: { mimeType: videoFileInput.files[0].type, fileUri: uploadedFileUri } }
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