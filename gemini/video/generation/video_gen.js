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

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const promptInput = document.getElementById('promptInput');
const imageInput = document.getElementById('imageInput'); // New image input
const generateButton = document.getElementById('generateButton');
const stopGenerationButton = document.getElementById('stopGenerationButton');
const recoverVideoButton = document.getElementById('recoverVideoButton');
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

    // Check for recoverable operation
    const lastOp = getLocalStorageItem('geminiLastVideoOperationName');
    if (lastOp) {
        recoverVideoButton.style.display = 'inline-block';
        recoverVideoButton.title = `Recover: ${lastOp}`;
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
        
        let imageBase64 = null;
        let imageMimeType = null;

        if (imageInput.files.length > 0) {
            const file = imageInput.files[0];
            imageMimeType = file.type;
            const reader = new FileReader();
            imageBase64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
        }

        // Structure for Veo video generation prompt.
        const instance = {
            prompt: prompt
        };

        if (imageBase64) {
            instance.image = {
                bytesBase64Encoded: imageBase64,
                mimeType: imageMimeType
            };
        }

        const requestBody = {
            instances: [instance],
            parameters: {
                sampleCount: 1
            }
        };

        // Log Start
        const apiCallIndex = logApiCallStart(endpoint, requestBody);

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
        
        // Log Update
        updateApiCallLog(apiCallIndex, data, performance.now() - startTime, 0);

        if (!response.ok) throw new Error(data.error?.message || response.statusText);

        const operationName = data.name;
        if (!operationName) {
            throw new Error("API did not return an operation name.");
        }
        
        // Save for recovery
        setLocalStorageItem('geminiLastVideoOperationName', operationName);
        recoverVideoButton.style.display = 'inline-block';
        recoverVideoButton.title = `Recover: ${operationName}`;

        textOutput.textContent = `Operation started: ${operationName}\nPolling for completion...`;
        statusMessage.textContent = 'Generating video... (this takes time)';

        // 2. Poll for Completion
        const pollStartIndex = logApiCallStart(`Polling: ${operationName}`, { method: 'Polling loop' });
        const result = await pollOperation(operationName);
        const totalDuration = performance.now() - startTime;

        statusMessage.textContent = 'Generation complete!';
        
        // Calculate cost assuming ~5 seconds of video for preview models
        const estimatedDurationSeconds = 5; 
        const cost = calculateCost(model, 0, estimatedDurationSeconds);
        
        updateApiCallLog(pollStartIndex, result, totalDuration, cost);

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

async function recoverVideo() {
    const operationName = getLocalStorageItem('geminiLastVideoOperationName');
    if (!operationName) {
        statusMessage.textContent = 'No operation to recover.';
        return;
    }
    
    if (!currentApiKey) {
        statusMessage.textContent = 'Please set your API Key.';
        return;
    }

    generateButton.disabled = true;
    recoverVideoButton.disabled = true;
    stopGenerationButton.style.display = 'inline-block';
    statusMessage.textContent = `Recovering operation: ${operationName}...`;
    textOutput.textContent = `Resuming polling for: ${operationName}`;
    
    abortController = new AbortController();
    const startTime = performance.now();

    try {
        const pollStartIndex = logApiCallStart(`Recover Polling: ${operationName}`, { method: 'Polling loop' });
        const result = await pollOperation(operationName);
        const totalDuration = performance.now() - startTime;

        statusMessage.textContent = 'Recovery complete!';
        
        // Calculate cost assuming ~5 seconds of video for preview models (estimation)
        const estimatedDurationSeconds = 5; 
        const cost = calculateCost(selectedModel, 0, estimatedDurationSeconds);
        
        updateApiCallLog(pollStartIndex, result, totalDuration, cost);

        // Handle Result
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
            statusMessage.textContent = 'Recovery cancelled.';
        } else {
            console.error(e);
            statusMessage.textContent = `Recovery failed: ${e.message}`;
            textOutput.textContent += `\nError: ${e.message}`;
        }
    } finally {
        generateButton.disabled = false;
        recoverVideoButton.disabled = false;
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
    const pricing = GEMINI_PRICING_CONFIG.VIDEO_GEN[modelId];
    if (!pricing) return 0;
    return (inputTokens * pricing.input) + (outputTokens * pricing.output);
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

function logApiCallStart(url, request) {
    const interaction = { 
        url, 
        request, 
        response: 'Pending...', 
        durationMs: 0, 
        cost: 0, 
        timestamp: new Date().toISOString(),
        status: 'pending'
    };
    allApiInteractions.push(interaction);
    updateDebugButtonText();
    if (debugInfo.style.display !== 'none') {
        appendApiCallEntry(interaction, allApiInteractions.length - 1);
    }
    return allApiInteractions.length - 1;
}

function updateApiCallLog(index, response, durationMs, cost) {
    const interaction = allApiInteractions[index];
    if (!interaction) return;
    
    interaction.response = response;
    interaction.durationMs = durationMs;
    interaction.cost = cost;
    interaction.status = 'completed';
    
    totalGenerationTime += durationMs;
    totalEstimatedCost += cost;
    updateSummaryDisplay();
    
    if (debugInfo.style.display !== 'none') {
        const entry = apiCallsContainer.children[index];
        if (entry) {
             entry.innerHTML = buildApiCallEntryContent(interaction, index);
        }
    }
}

function buildApiCallEntryContent(interaction, index) {
    let endpointName = 'API Call';
    if (interaction.url.includes('predictLongRunning')) endpointName = 'START GEN';
    else if (interaction.url.includes('operations/')) endpointName = 'POLL';
    
    const durationDisplay = interaction.status === 'pending' ? 'Pending...' : `${(interaction.durationMs/1000).toFixed(2)}s`;
    
    return `
        <summary><h4>#${index + 1} ${endpointName} (${durationDisplay})</h4></summary>
        <div class="debug-section"><h5>URL</h5><div class="debug-content">${interaction.url}</div></div>
        <div class="debug-section"><h5>Request</h5><div class="debug-content">${JSON.stringify(interaction.request, null, 2)}</div></div>
        <div class="debug-section"><h5>Response</h5><div class="debug-content">${JSON.stringify(interaction.response, null, 2)}</div></div>
    `;
}

function appendApiCallEntry(interaction, index) {
    const details = document.createElement('details');
    details.className = 'api-call-entry';
    details.innerHTML = buildApiCallEntryContent(interaction, index);
    apiCallsContainer.appendChild(details);
}

function logApiInteraction(url, request, response, durationMs, cost) {
    // Legacy support: logs a completed interaction immediately
    const index = logApiCallStart(url, request);
    updateApiCallLog(index, response, durationMs, cost);
}

// --- Event Listeners ---

setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', () => {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedVideoModel', selectedModel);
});
generateButton.addEventListener('click', generateContent);
recoverVideoButton.addEventListener('click', recoverVideo); // Added listener
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