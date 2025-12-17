// video_gen.js - Implements Gemini Video Generation using Veo models

let currentVideoApiKey = '';
let selectedVideoModel = 'veo-3.1-fast-generate-preview';
let videoAbortController = null;
let videoApiInteractions = [];

// Global totals
let videoTotalTime = 0;
let videoTotalCost = 0;

const GEMINI_VIDEO_MODELS = {
    'veo-2.0-generate-001': 'Veo 2',
    'veo-3.0-generate-001': 'Veo 3',
    'veo-3.0-fast-generate-001': 'Veo 3 Fast',
    'veo-3.1-generate-preview': 'Veo 3.1',
    'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast'
};

// DOM Elements
const videoApiKeyInput = document.getElementById('videoApiKey');
const setVideoApiKeyButton = document.getElementById('setVideoApiKeyButton');
const videoModelSelect = document.getElementById('videoModel');
const videoPromptInput = document.getElementById('videoPromptInput');
const videoDurationSecondsSelect = document.getElementById('durationSeconds');
const videoAspectRatioSelect = document.getElementById('aspectRatio');
const videoResolutionSelect = document.getElementById('resolution');
const videoSampleCountInput = document.getElementById('sampleCount');
const videoSeedInput = document.getElementById('seed');
const videoNegativePromptInput = document.getElementById('negativePrompt');
const videoPersonGenerationSelect = document.getElementById('personGeneration');
const imageUrlInput = document.getElementById('imageUrlInput');
const imageInput = document.getElementById('imageInput'); // Keeping this for manual upload
const selectedImagePreview = document.getElementById('selectedImagePreview');
const inputImageDisplay = document.getElementById('inputImageDisplay');
const clearInputImageButton = document.getElementById('clearInputImageButton');
const generateVideoButton = document.getElementById('generateVideoButton');
const stopVideoGenerationButton = document.getElementById('stopVideoGenerationButton');
const recoverVideoButton = document.getElementById('recoverVideoButton');
const videoStatusMessage = document.getElementById('videoStatusMessage');
const videoTextOutput = document.getElementById('videoTextOutput');
const videoOutputContainer = document.getElementById('videoOutputContainer');

// Debug & Summary Elements
const showVideoApiCallsButton = document.getElementById('showVideoApiCallsButton');
const videoDebugInfo = document.getElementById('videoDebugInfo');
const videoApiCallsContainer = document.getElementById('videoApiCallsContainer');
const closeVideoDebugButton = document.getElementById('closeVideoDebugButton');
const videoTotalTimeSpan = document.getElementById('videoTotalGenerationTime');
const videoTotalCostSpan = document.getElementById('videoTotalEstimatedCost');

// --- Initialization ---

function setLocalStorageItem(name, value) {
    try { localStorage.setItem(name, value); } catch (e) { console.error(e); }
}

function getLocalStorageItem(name) {
    try { return localStorage.getItem(name); } catch (e) { return null; }
}

function setVideoApiKey() {
    const apiKey = videoApiKeyInput.value.trim();
    if (!apiKey) {
        videoStatusMessage.textContent = 'Please enter your Gemini API Key.';
        return false;
    }
    currentVideoApiKey = apiKey;
    setLocalStorageItem('geminiVideoApiKey', apiKey);
    videoStatusMessage.textContent = 'API Key set successfully!';
    setTimeout(() => videoStatusMessage.textContent = '', 3000);
    return true;
}

function loadVideoSettings() {
    const apiKey = getLocalStorageItem('geminiVideoApiKey');
    if (apiKey) {
        videoApiKeyInput.value = apiKey;
        currentVideoApiKey = apiKey;
    }
    const storedModel = getLocalStorageItem('selectedVideoModel');
    if (storedModel && GEMINI_VIDEO_MODELS[storedModel]) {
        selectedVideoModel = storedModel;
        videoModelSelect.value = storedModel;
    }

    // Check for recoverable operation
    const lastOp = getLocalStorageItem('geminiLastVideoOperationName');
    if (lastOp) {
        recoverVideoButton.style.display = 'inline-block';
        recoverVideoButton.title = `Recover: ${lastOp}`;
    }
}

function populateVideoModelSelect() {
    videoModelSelect.innerHTML = '';
    for (const modelId in GEMINI_VIDEO_MODELS) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = GEMINI_VIDEO_MODELS[modelId];
        videoModelSelect.appendChild(option);
    }
    videoModelSelect.value = selectedVideoModel;
}

// --- Image Input Handling ---

function displayVideoInputImage(base64) {
    inputImageDisplay.src = `data:image/png;base64,${base64}`;
    selectedImagePreview.style.display = 'block';
    videoStatusMessage.textContent = 'Video input image updated.';
}

function clearVideoInputImage() {
    inputImageDisplay.src = '';
    selectedImagePreview.style.display = 'none';
    imageInput.value = ''; // Clear file input
    // Clear global selection from text2img if it matches
    if (typeof selectedInputImages !== 'undefined') {
        // We don't necessarily want to clear the *text2img* inputs, just the video input.
        // But for consistency, let's assume this clear button is for the video context.
    }
    videoStatusMessage.textContent = 'Video input image cleared.';
}

// Hook into text2img.js addImageAsInput to update video preview
// This assumes text2img.js is loaded and defines addImageAsInput
if (typeof addImageAsInput === 'function') {
    const originalAddImageAsInput = addImageAsInput;
    addImageAsInput = function(base64) {
        originalAddImageAsInput(base64); // Call original to update text2img UI
        displayVideoInputImage(base64);  // Update video UI
        // Scroll to video input section
        selectedImagePreview.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
}

// --- Generation Logic ---

async function generateVideoContent() {
    const prompt = videoPromptInput.value.trim();
    if (!prompt) {
        videoStatusMessage.textContent = 'Please enter a prompt.';
        return;
    }
    
    if (!currentVideoApiKey) {
        videoStatusMessage.textContent = 'Please set your API Key.';
        return;
    }

    // Reset UI
    videoTextOutput.textContent = 'Initializing video generation...';
    if (videoOutputContainer) {
        videoOutputContainer.innerHTML = '';
        videoOutputContainer.style.display = 'none';
    }
    
    generateVideoButton.disabled = true;
    stopVideoGenerationButton.style.display = 'inline-block';
    videoStatusMessage.textContent = 'Sending request...';

    videoAbortController = new AbortController();
    const startTime = performance.now();

    try {
        const model = videoModelSelect.value;
        // Video generation uses predictLongRunning
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${currentVideoApiKey}`;
        
        let imageBase64 = null;
        let imageMimeType = null;
        const imageUrl = imageUrlInput.value.trim();

        // Use the displayed image as the source of truth
        if (selectedImagePreview.style.display !== 'none' && inputImageDisplay.src) {
            const src = inputImageDisplay.src;
            if (src.startsWith('data:image/')) {
                imageBase64 = src.split(',')[1];
                imageMimeType = src.substring(5, src.indexOf(';'));
            }
        }

        // Structure for Veo video generation prompt.
        const instance = {
            prompt: prompt
        };

        if (imageBase64) {
            instance.image = {
                bytesBase64Encoded: imageBase64,
                mimeType: imageMimeType || 'image/png'
            };
        } else if (imageUrl) {
            instance.image = {
                uri: imageUrl
            };
        }

        // Retrieve video generation parameters
        const durationSeconds = videoDurationSecondsSelect.value;
        const aspectRatio = videoAspectRatioSelect.value;
        const resolution = videoResolutionSelect.value;
        const sampleCount = videoSampleCountInput.value;
        const seed = videoSeedInput.value;
        const negativePrompt = videoNegativePromptInput.value.trim();
        const personGeneration = videoPersonGenerationSelect.value;

        const parameters = {};
        if (durationSeconds) parameters.durationSeconds = parseInt(durationSeconds, 10);
        if (aspectRatio) parameters.aspectRatio = aspectRatio;
        if (resolution) parameters.resolution = resolution;
        if (sampleCount) parameters.sampleCount = parseInt(sampleCount, 10);
        if (seed) parameters.seed = parseInt(seed, 10);
        if (negativePrompt) parameters.negativePrompt = negativePrompt;
        if (personGeneration) parameters.personGeneration = personGeneration;

        const requestBody = {
            instances: [instance],
            parameters: parameters
        };

        // Log Start
        const apiCallIndex = logVideoApiCallStart(endpoint, requestBody);

        // 1. Initiate Long-Running Operation
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: videoAbortController.signal
        });

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            data = { error: { message: response.statusText, details: "Failed to parse JSON response" } };
        }
        
        // Log Update
        updateVideoApiCallLog(apiCallIndex, data, performance.now() - startTime, 0);

        if (!response.ok) throw new Error(data.error?.message || response.statusText);

        const operationName = data.name;
        if (!operationName) {
            throw new Error("API did not return an operation name.");
        }
        
        // Save for recovery
        setLocalStorageItem('geminiLastVideoOperationName', operationName);
        recoverVideoButton.style.display = 'inline-block';
        recoverVideoButton.title = `Recover: ${operationName}`;

        videoTextOutput.textContent = `Operation started: ${operationName}\nPolling for completion...`;
        videoStatusMessage.textContent = 'Generating video... (this takes time)';

        // 2. Poll for Completion
        const pollStartIndex = logVideoApiCallStart(`Polling: ${operationName}`, { method: 'Polling loop' });
        const result = await pollVideoOperation(operationName);
        const totalDuration = performance.now() - startTime;

        videoStatusMessage.textContent = 'Generation complete!';
        
        // Use actual parameters if available, otherwise fallback to defaults for estimation
        const actualDurationSeconds = parameters.durationSeconds || 8; 
        const actualSampleCount = parameters.sampleCount || 1;
        const cost = calculateVideoCost(model, 0, actualDurationSeconds, actualSampleCount);
        
        updateVideoApiCallLog(pollStartIndex, result, totalDuration, cost);

        // 3. Handle Result
        const videoResponse = result.response?.generateVideoResponse;
        if (videoResponse?.generatedSamples?.[0]?.video?.uri) {
             const videoUri = videoResponse.generatedSamples[0].video.uri;
             videoTextOutput.textContent = `Success!\nVideo URI: ${videoUri}`;
             displayGeneratedVideo(videoUri);
        } else if (result.error) {
             videoTextOutput.textContent = `Operation failed: ${JSON.stringify(result.error, null, 2)}`;
        } else {
             videoTextOutput.textContent = 'Operation completed, but no video URI found.\nResult: ' + JSON.stringify(result, null, 2);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            videoStatusMessage.textContent = 'Cancelled.';
            videoTextOutput.textContent += '\nCancelled by user.';
        } else {
            console.error(e);
            videoStatusMessage.textContent = `Error: ${e.message}`;
            videoTextOutput.textContent = `Error: ${e.message}`;
        }
    } finally {
        generateVideoButton.disabled = false;
        stopVideoGenerationButton.style.display = 'none';
        videoAbortController = null;
    }
}

async function recoverVideoOperation() {
    const operationName = getLocalStorageItem('geminiLastVideoOperationName');
    if (!operationName) {
        videoStatusMessage.textContent = 'No operation to recover.';
        return;
    }
    
    if (!currentVideoApiKey) {
        videoStatusMessage.textContent = 'Please set your API Key.';
        return;
    }

    generateVideoButton.disabled = true;
    recoverVideoButton.disabled = true;
    stopVideoGenerationButton.style.display = 'inline-block';
    videoStatusMessage.textContent = `Recovering operation: ${operationName}...`;
    videoTextOutput.textContent = `Resuming polling for: ${operationName}`;
    
    videoAbortController = new AbortController();
    const startTime = performance.now();

    try {
        const pollStartIndex = logVideoApiCallStart(`Recover Polling: ${operationName}`, { method: 'Polling loop' });
        const result = await pollVideoOperation(operationName);
        const totalDuration = performance.now() - startTime;

        videoStatusMessage.textContent = 'Recovery complete!';
        
        // For recovery, parameters are not directly available from the DOM in the same way, 
        // so we'll make an estimation or potentially try to parse from the original request log if available.
        // For now, use sensible defaults or a simplified estimation similar to generateVideoContent's fallback.
        const estimatedDurationSeconds = 8; // Default duration
        const estimatedSampleCount = 1; // Default sample count
        const cost = calculateVideoCost(selectedVideoModel, 0, estimatedDurationSeconds, estimatedSampleCount);
        
        updateVideoApiCallLog(pollStartIndex, result, totalDuration, cost);

        // Handle Result
        const videoResponse = result.response?.generateVideoResponse;
        if (videoResponse?.generatedSamples?.[0]?.video?.uri) {
             const videoUri = videoResponse.generatedSamples[0].video.uri;
             videoTextOutput.textContent = `Success!\nVideo URI: ${videoUri}`;
             displayGeneratedVideo(videoUri);
        } else if (result.error) {
             videoTextOutput.textContent = `Operation failed: ${JSON.stringify(result.error, null, 2)}`;
        } else {
             videoTextOutput.textContent = 'Operation completed, but no video URI found.\nResult: ' + JSON.stringify(result, null, 2);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            videoStatusMessage.textContent = 'Recovery cancelled.';
        } else {
            console.error(e);
            videoStatusMessage.textContent = `Recovery failed: ${e.message}`;
            videoTextOutput.textContent += `\nError: ${e.message}`;
        }
    } finally {
        generateVideoButton.disabled = false;
        recoverVideoButton.disabled = false;
        stopVideoGenerationButton.style.display = 'none';
        videoAbortController = null;
    }
}

async function pollVideoOperation(operationName) {
    // Operation name usually looks like "operations/..."
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${currentVideoApiKey}`;
    
    while (true) {
        if (videoAbortController && videoAbortController.signal.aborted) {
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

async function displayGeneratedVideo(uri) {
    if (!videoOutputContainer) return;
    
    try {
        videoStatusMessage.textContent = 'Downloading video media...';
        const response = await fetch(uri, {
            headers: { 'x-goog-api-key': currentVideoApiKey }
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
        videoStatusMessage.textContent = 'Video ready!';
    } catch (e) {
        console.error(e);
        videoTextOutput.textContent += `\nError downloading video: ${e.message}`;
        videoStatusMessage.textContent = 'Failed to load video.';
    }
}

function stopVideoGeneration() {
    if (videoAbortController) videoAbortController.abort();
}

// --- Helper Functions ---

function calculateVideoCost(modelId, inputTokens, actualDurationSeconds, actualSampleCount) {
    // Basic stub, uses GEMINI_PRICING_CONFIG if available
    if (typeof GEMINI_PRICING_CONFIG !== 'undefined' && GEMINI_PRICING_CONFIG.VIDEO_GEN && GEMINI_PRICING_CONFIG.VIDEO_GEN[modelId]) {
        const pricing = GEMINI_PRICING_CONFIG.VIDEO_GEN[modelId];
        return (inputTokens * pricing.input) + (actualDurationSeconds * actualSampleCount * pricing.output_per_second_per_sample);
    }
    return 0;
}

function updateVideoSummaryDisplay() {
    videoTotalTimeSpan.textContent = `${(videoTotalTime / 1000).toFixed(2)}s`;
    videoTotalCostSpan.textContent = `$${videoTotalCost.toFixed(6)}`;
}

function updateVideoDebugButtonText() {
    const count = videoApiInteractions.length;
    showVideoApiCallsButton.style.display = 'inline-block';
    showVideoApiCallsButton.textContent = `Show ${count} API Call${count !== 1 ? 's' : ''}`;
}

function logVideoApiCallStart(url, request) {
    const interaction = { 
        url, 
        request, 
        response: 'Pending...', 
        durationMs: 0, 
        cost: 0, 
        timestamp: new Date().toISOString(),
        status: 'pending'
    };
    videoApiInteractions.push(interaction);
    updateVideoDebugButtonText();
    if (videoDebugInfo.style.display !== 'none') {
        appendVideoApiCallEntry(interaction, videoApiInteractions.length - 1);
    }
    return videoApiInteractions.length - 1;
}

function updateVideoApiCallLog(index, response, durationMs, cost) {
    const interaction = videoApiInteractions[index];
    if (!interaction) return;
    
    interaction.response = response;
    interaction.durationMs = durationMs;
    interaction.cost = cost;
    interaction.status = 'completed';
    
    videoTotalTime += durationMs;
    videoTotalCost += cost;
    updateVideoSummaryDisplay();
    
    if (videoDebugInfo.style.display !== 'none') {
        const entry = videoApiCallsContainer.children[index];
        if (entry) {
             entry.innerHTML = buildVideoApiCallEntryContent(interaction, index);
        }
    }
}

function buildVideoApiCallEntryContent(interaction, index) {
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

function appendVideoApiCallEntry(interaction, index) {
    const details = document.createElement('details');
    details.className = 'api-call-entry';
    details.innerHTML = buildVideoApiCallEntryContent(interaction, index);
    videoApiCallsContainer.appendChild(details);
}

// --- Event Listeners ---

setVideoApiKeyButton.addEventListener('click', setVideoApiKey);
videoModelSelect.addEventListener('change', () => {
    selectedVideoModel = videoModelSelect.value;
    setLocalStorageItem('selectedVideoModel', selectedVideoModel);
});
generateVideoButton.addEventListener('click', generateVideoContent);
recoverVideoButton.addEventListener('click', recoverVideoOperation);
stopVideoGenerationButton.addEventListener('click', stopVideoGeneration);
clearInputImageButton.addEventListener('click', clearVideoInputImage); // Listener for clear button

// Listener for manual file upload
imageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result.split(',')[1];
            displayVideoInputImage(base64);
        };
        reader.readAsDataURL(file);
    }
});

showVideoApiCallsButton.addEventListener('click', () => {
    videoApiCallsContainer.innerHTML = '';
    videoApiInteractions.forEach((ia, idx) => appendVideoApiCallEntry(ia, idx));
    videoDebugInfo.style.display = 'block';
});
closeVideoDebugButton.addEventListener('click', () => videoDebugInfo.style.display = 'none');
videoPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateVideoContent();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadVideoSettings();
    populateVideoModelSelect();
    updateVideoSummaryDisplay();
});