// video_gen.js - Implements Gemini Video Generation using Veo models

let currentApiKey = '';
let selectedModel = 'veo-3.1';
let abortController = null;
let allApiInteractions = [];

// Global totals
let totalGenerationTime = 0;
let totalEstimatedCost = 0;

const GEMINI_MODELS = {
    'veo-2.0-generate-001': 'Veo 2',
    'veo-3.0-generate-001': 'Veo 3',
    'veo-3.0-fast-generate-001': 'Veo 3 Fast',
    'veo-3.1-generate-preview': 'Veo 3.1',
    'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast'
};

const PRICING_TABLE = {
    // Video generation pricing varies; set placeholders for now.
    'veo-2.0-generate-001': { input: 0, output: 0 },
    'veo-3.0-generate-001': { input: 0, output: 0 },
    'veo-3.0-fast-generate-001': { input: 0, output: 0 },
    'veo-3.1-generate-preview': { input: 0, output: 0 },
    'veo-3.1-fast-generate-preview': { input: 0, output: 0 }
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
const videoOutputContainer = document.getElementById('videoOutputContainer');

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

// --- Generation Logic ---

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

    // Reset UI
    textOutput.textContent = 'Initializing video generation...';
    if (videoOutputContainer) {
        videoOutputContainer.innerHTML = '';
        videoOutputContainer.style.display = 'none';
    }
    
    generateButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';
    statusMessage.textContent = 'Sending request...';

    abortController = new AbortController();
    const startTime = performance.now();

    try {
        const model = geminiModelSelect.value;
        // Video generation uses predictLongRunning
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${currentApiKey}`;
        
        // Structure for Veo video generation prompt.
        const requestBody = {
            instances: [
                {
                    prompt: prompt
                }
            ],
            parameters: {
                sampleCount: 1
            }
        };

        // 1. Initiate Long-Running Operation
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            data = { error: { message: response.statusText, details: "Failed to parse JSON response" } };
        }
        
        // Log API Interaction immediately.
        // This ensures the debug button appears and works even if the API returns an error.
        logApiInteraction(endpoint, requestBody, data, performance.now() - startTime, 0);

        if (!response.ok) throw new Error(data.error?.message || response.statusText);

        const operationName = data.name;
        if (!operationName) {
            throw new Error("API did not return an operation name.");
        }

        textOutput.textContent = `Operation started: ${operationName}\nPolling for completion...`;
        statusMessage.textContent = 'Generating video... (this takes time)';

        // 2. Poll for Completion
        const result = await pollOperation(operationName);
        const totalDuration = performance.now() - startTime;

        statusMessage.textContent = 'Generation complete!';
        logApiInteraction(`Polling: ${operationName}`, {}, result, totalDuration, 0);

        // 3. Handle Result
        const videoResponse = result.response?.generateVideoResponse;
        if (videoResponse?.generatedSamples?.[0]?.video?.uri) {
             const videoUri = videoResponse.generatedSamples[0].video.uri;
             textOutput.textContent = `Success!\nVideo URI: ${videoUri}`;
             displayVideo(videoUri);
        } else if (result.error) {
             textOutput.textContent = `Operation failed: ${JSON.stringify(result.error, null, 2)}`;
        } else {
             textOutput.textContent = 'Operation completed, but no video URI found.\nResult: ' + JSON.stringify(result, null, 2);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            statusMessage.textContent = 'Cancelled.';
            textOutput.textContent += '\nCancelled by user.';
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

async function pollOperation(operationName) {
    // Operation name usually looks like "operations/..."
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${currentApiKey}`;
    
    while (true) {
        if (abortController && abortController.signal.aborted) {
            throw new Error('Operation cancelled.');
        }

        const res = await fetch(pollUrl);
        const data = await res.json();

        if (data.error) throw new Error(data.error.message);

        if (data.done) {
            return data;
        }

        // Wait before next poll (e.g., 3 seconds)
        await new Promise(r => setTimeout(r, 3000));
    }
}

async function displayVideo(uri) {
    if (!videoOutputContainer) return;
    
    try {
        statusMessage.textContent = 'Downloading video media...';
        const response = await fetch(uri, {
            headers: { 'x-goog-api-key': currentApiKey }
        });
        if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);

        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const dateTimeString = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
        const filename = `gemini_video_${dateTimeString}.mp4`;
        
        videoOutputContainer.style.display = 'flex';
        videoOutputContainer.innerHTML = `
            <video controls autoplay loop>
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div style="margin-top: 10px;">
                <a href="${videoUrl}" download="${filename}" class="button" style="text-decoration:none; background:#28a745; color:white; padding:5px 10px; border-radius:4px;">Download Video</a>
            </div>
        `;
        statusMessage.textContent = 'Video ready!';
    } catch (e) {
        console.error(e);
        textOutput.textContent += `\nError downloading video: ${e.message}`;
        statusMessage.textContent = 'Failed to load video.';
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
    // Simplify URL for display
    let endpointName = 'API Call';
    if (interaction.url.includes('predictLongRunning')) endpointName = 'START GEN';
    else if (interaction.url.includes('operations/')) endpointName = 'POLL';
    
    summary.innerHTML = `<h4>#${index + 1} ${endpointName} (${(interaction.durationMs/1000).toFixed(2)}s)</h4>`;
    details.appendChild(summary);
    
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