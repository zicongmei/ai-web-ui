// video.js

let currentApiKey = '';
let selectedModel = 'gemini-2.5-flash'; // Default model
let abortController = null; // To manage ongoing fetch requests
let allApiInteractions = []; // To store all API calls for debug info

let uploadedFileUri = null; // Store the URI of the uploaded file
let currentVideoDuration = 0; // Store duration for token estimation

// Global totals
let totalGenerationTime = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalEstimatedCost = 0;

// Gemini Models suitable for Video Analysis
const GEMINI_VIDEO_MODELS = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
    'gemini-3-pro-preview': 'Gemini 3.0 Pro Preview'
};

// New: Variables for cost calculation
const MODEL_PRICES = {
    'gemini-2.5-flash': { 
        getPricing: (promptTokenCount) => ({
            inputRate: 0.30 / 1_000_000,
            outputRate: 2.50 / 1_000_000
        })
    },
    'gemini-2.5-pro': { 
        getPricing: (promptTokenCount) => ({
            inputRate: 1.25 / 1_000_000,
            outputRate: 10.00 / 1_000_000
        })
    },
    'gemini-2.5-flash-lite': { 
        getPricing: (promptTokenCount) => ({
            inputRate: 0.10 / 1_000_000,
            outputRate: 0.40 / 1_000_000
        })
    },
    'gemini-3-pro-preview': {
        getPricing: (promptTokenCount) => {
            const PROMPT_THRESHOLD_TOKENS = 200_000; // 200k tokens
            let inputRate, outputRate;

            if (promptTokenCount <= PROMPT_THRESHOLD_TOKENS) {
                inputRate = 2.00 / 1_000_000;  // $2.00 per 1M tokens
                outputRate = 12.00 / 1_000_000; // $12.00 per 1M tokens
            } else {
                inputRate = 4.00 / 1_000_000;  // $4.00 per 1M tokens
                outputRate = 18.00 / 1_000_000; // $18.00 per 1M tokens
            }
            return { inputRate, outputRate };
        }
    }
};

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const videoFileInput = document.getElementById('videoFileInput');
const videoPreviewContainer = document.getElementById('videoPreviewContainer');
const videoPreview = document.getElementById('videoPreview');
const videoDurationSpan = document.getElementById('videoDuration');
const videoTokenEstimateSpan = document.getElementById('videoTokenEstimate');
const uploadStatusContainer = document.getElementById('uploadStatusContainer');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatusText = document.getElementById('uploadStatusText');
const promptInput = document.getElementById('promptInput');
const generateButton = document.getElementById('generateButton');
const stopGenerationButton = document.getElementById('stopGenerationButton');
const statusMessage = document.getElementById('statusMessage');
const textOutput = document.getElementById('textOutput');
const useGoogleSearchInput = document.getElementById('useGoogleSearch');

// Debug & Summary Elements
const showApiCallsButton = document.getElementById('showApiCallsButton');
const debugInfo = document.getElementById('debugInfo');
const apiCallsContainer = document.getElementById('apiCallsContainer');
const closeDebugButton = document.getElementById('closeDebugButton');
const totalGenerationTimeSpan = document.getElementById('totalGenerationTime');
const totalInputTokensSpan = document.getElementById('totalInputTokens');
const totalOutputTokensSpan = document.getElementById('totalOutputTokens');
const totalEstimatedCostSpan = document.getElementById('totalEstimatedCost');

// --- Initialization & Local Storage ---

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
    if (storedModel && GEMINI_VIDEO_MODELS[storedModel]) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
    }
}

function populateModelSelect() {
    geminiModelSelect.innerHTML = '';
    for (const modelId in GEMINI_VIDEO_MODELS) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = GEMINI_VIDEO_MODELS[modelId];
        geminiModelSelect.appendChild(option);
    }
    geminiModelSelect.value = selectedModel;
}

// --- Video Handling & Upload Logic ---

videoFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentApiKey) {
        alert("Please set your API Key before uploading.");
        videoFileInput.value = '';
        return;
    }

    // Reset UI
    uploadedFileUri = null;
    generateButton.disabled = true;
    textOutput.textContent = '';
    statusMessage.textContent = '';
    
    // Show Preview
    const url = URL.createObjectURL(file);
    videoPreview.src = url;
    videoPreviewContainer.style.display = 'block';
    
    // Get Duration for token estimate
    videoPreview.onloadedmetadata = () => {
        currentVideoDuration = videoPreview.duration;
        videoDurationSpan.textContent = `${currentVideoDuration.toFixed(1)}s`;
        const estTokens = Math.ceil(currentVideoDuration * 263);
        videoTokenEstimateSpan.textContent = `~${estTokens.toLocaleString()}`;
    };

    // Start Upload Process
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

    // 1. Initial Resumable Upload Request
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

    if (!initResponse.ok) throw new Error(`Init upload failed: ${initResponse.statusText}`);
    
    const uploadUrl = initResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("No upload URL returned.");

    logApiInteraction(initUrl, initBody, {header_url: uploadUrl}, performance.now() - startTime, 0, 0, 0);

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
        body: file // Send the file object directly
    });
    
    const uploadData = await uploadResponse.json();
    logApiInteraction("UPLOAD_BYTES_ENDPOINT", "[Binary Data]", uploadData, performance.now() - uploadStartTime, 0, 0, 0);

    if (!uploadResponse.ok) throw new Error(`File upload failed: ${uploadData.error?.message || uploadResponse.statusText}`);

    const fileUri = uploadData.file.uri;
    const fileName = uploadData.file.name; // Resource name: files/...

    uploadProgressBar.style.width = '100%';
    uploadStatusText.textContent = "Processing video...";

    // 3. Poll for Active State
    await pollFileState(fileName);

    uploadedFileUri = fileUri;
    uploadStatusText.textContent = "Video ready for analysis.";
    generateButton.disabled = false;
    statusMessage.textContent = "Video uploaded and processed. You can now analyze it.";
}

async function pollFileState(resourceName) {
    let state = 'PROCESSING';
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${resourceName}?key=${currentApiKey}`;

    while (state === 'PROCESSING') {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s
        const resp = await fetch(pollUrl);
        const data = await resp.json();
        state = data.state;
        
        if (state === 'FAILED') throw new Error("Video processing failed on server.");
        // Log poll silently or verbosely
        // logApiInteraction(pollUrl, "GET", data, 0, 0, 0, 0); 
    }
}


// --- Analysis (Generation) Logic ---

async function generateAnalysis() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        statusMessage.textContent = 'Please enter a prompt.';
        return;
    }
    if (!uploadedFileUri) {
        statusMessage.textContent = 'Please upload a video first.';
        return;
    }

    textOutput.textContent = 'Analyzing...';
    generateButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';
    statusMessage.textContent = 'Sending request...';

    abortController = new AbortController();
    const startTime = performance.now();

    try {
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    { 
                        fileData: { 
                            mimeType: videoFileInput.files[0].type, 
                            fileUri: uploadedFileUri 
                        } 
                    }
                ]
            }]
        };

        // Add tools if selected
        if (useGoogleSearchInput.checked) {
            requestBody.tools = [{ google_search: {} }];
        }

        const model = geminiModelSelect.value;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;
        
        // Estimate tokens
        const estimatedVideoTokens = Math.ceil(currentVideoDuration * 263);
        const estimatedPromptTokens = Math.ceil(prompt.length / 4);
        const totalEstInputTokens = estimatedVideoTokens + estimatedPromptTokens;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        const data = await response.json();
        const duration = performance.now() - startTime;

        if (!response.ok) throw new Error(data.error?.message || response.statusText);

        // Process Response
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || 'No text response.';
        textOutput.textContent = text;

        // Stats & Cost
        let inputTokens = data.usageMetadata?.promptTokenCount || totalEstInputTokens;
        let outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
        
        const cost = calculateCost(model, inputTokens, outputTokens);

        logApiInteraction(endpoint, requestBody, data, duration, inputTokens, outputTokens, cost);
        statusMessage.textContent = 'Analysis complete.';

    } catch (e) {
        if (e.name === 'AbortError') {
            statusMessage.textContent = 'Analysis cancelled.';
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
    if (abortController) {
        abortController.abort();
    }
}

// --- Helper Functions ---

function calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = MODEL_PRICES[modelId];
    if (!pricing) return 0;
    const { inputRate, outputRate } = pricing.getPricing(inputTokens);
    const inputCost = inputTokens * inputRate;
    const outputCost = outputTokens * outputRate;
    return inputCost + outputCost;
}

function logApiInteraction(url, request, response, durationMs, inputTokens, outputTokens, cost) {
    const interaction = {
        url, request, response, durationMs, inputTokens, outputTokens, cost,
        timestamp: new Date().toISOString()
    };
    allApiInteractions.push(interaction);
    
    totalGenerationTime += durationMs;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalEstimatedCost += cost;

    updateSummaryDisplay();
    updateDebugButtonText();
    
    if (debugInfo.style.display !== 'none') {
        appendApiCallEntry(interaction, allApiInteractions.length - 1);
        apiCallsContainer.scrollTop = apiCallsContainer.scrollHeight;
    }
}

function updateSummaryDisplay() {
    totalGenerationTimeSpan.textContent = `${(totalGenerationTime / 1000).toFixed(2)}s`;
    totalInputTokensSpan.textContent = totalInputTokens.toLocaleString();
    totalOutputTokensSpan.textContent = totalOutputTokens.toLocaleString();
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

    const metrics = document.createElement('div');
    metrics.className = 'api-call-metrics';
    metrics.innerHTML = `
        <div class="api-call-metric"><strong>In Tokens:</strong> ${interaction.inputTokens}</div>
        <div class="api-call-metric"><strong>Out Tokens:</strong> ${interaction.outputTokens}</div>
        <div class="api-call-metric"><strong>Cost:</strong> $${interaction.cost.toFixed(6)}</div>
    `;
    details.appendChild(metrics);

    const resDiv = document.createElement('div');
    resDiv.className = 'debug-section';
    resDiv.innerHTML = `<h5>URL</h5><div class="debug-content">${interaction.url}</div>`;
    details.appendChild(resDiv);

    const reqDiv = document.createElement('div');
    reqDiv.className = 'debug-section';
    reqDiv.innerHTML = `<h5>Request</h5><div class="debug-content">${JSON.stringify(interaction.request, null, 2)}</div>`;
    details.appendChild(reqDiv);

    const resDiv2 = document.createElement('div');
    resDiv2.className = 'debug-section';
    resDiv2.innerHTML = `<h5>Response</h5><div class="debug-content">${JSON.stringify(interaction.response, null, 2)}</div>`;
    details.appendChild(resDiv2);

    apiCallsContainer.appendChild(details);
}

// --- Event Listeners ---

setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', () => {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedVideoModel', selectedModel);
});
generateButton.addEventListener('click', generateAnalysis);
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
        generateAnalysis();
    }
});

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    populateModelSelect();
    updateSummaryDisplay();
});