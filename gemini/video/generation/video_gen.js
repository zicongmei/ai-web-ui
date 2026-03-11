// video_gen.js - Implements Gemini Video Generation using Veo models

let currentVideoApiKey = '';
let selectedVideoModel = 'veo-3.1-fast-generate-preview';
let videoAbortController = null;
let videoApiInteractions = [];

let assignedImages = []; // List of { base64, mimeType, role }

// Global totals
let videoTotalTime = 0;
let videoTotalCost = 0;

const GEMINI_VIDEO_MODELS = {
    'veo-2.0-generate-001': 'Veo 2 Standard',
    'veo-2': 'Veo 2 (Alias)',
    'veo-3.0-generate-001': 'Veo 3 Standard',
    'veo-3.0-fast-generate-001': 'Veo 3 Fast',
    'veo-3': 'Veo 3 (Alias)',
    'veo-3.1-generate-preview': 'Veo 3.1 Standard',
    'veo-3.1-fast-generate-preview': 'Veo 3.1 Fast',
    'veo-3.1': 'Veo 3.1 (Alias)'
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
const videoGenerateAudioSelect = document.getElementById('generateAudio');
const imageInput = document.getElementById('imageInput'); // Manual upload
const videoCameraInput = document.getElementById('videoCameraInput');
const videoTakePhotoButton = document.getElementById('videoTakePhotoButton');
const videoImageUrlInput = document.getElementById('videoImageUrlInput');
const videoAddUrlButton = document.getElementById('videoAddUrlButton');
const assignedImagesContainer = document.getElementById('assignedImagesContainer');
const assignedImagesList = document.getElementById('assignedImagesList');
const clearAllAssignedImagesButton = document.getElementById('clearAllAssignedImagesButton');
const videoRecoveryContainer = document.getElementById('videoRecoveryContainer');
const videoOperationSelect = document.getElementById('videoOperationSelect');
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

// Constants for DB (matching text2img.js for compatibility if needed, or separate)
const VIDEO_DB_NAME = 'GeminiVideoHistoryDB';
const VIDEO_DB_VERSION = 1;
const VIDEO_SETTINGS_STORE = 'settings';

// Video Operation History
let videoOperationHistory = [];

async function saveOperationToHistory(opName, prompt) {
    const opItem = {
        name: opName,
        prompt: prompt,
        timestamp: new Date().toISOString()
    };
    videoOperationHistory.unshift(opItem);
    if (videoOperationHistory.length > 20) videoOperationHistory = videoOperationHistory.slice(0, 20);
    await saveToVideoDB('geminiVideoOperationHistory', JSON.stringify(videoOperationHistory));
    renderOperationSelect();
}

async function loadVideoOperationHistory() {
    const stored = await getFromVideoDB('geminiVideoOperationHistory');
    if (stored) {
        try {
            videoOperationHistory = JSON.parse(stored);
        } catch (e) {
            console.error("Failed to parse video operation history:", e);
            videoOperationHistory = [];
        }
    } else {
        const lastOp = getLocalStorageItem('geminiLastVideoOperationName');
        if (lastOp) {
            videoOperationHistory = [{ name: lastOp, prompt: 'Recovered Operation', timestamp: new Date().toISOString() }];
            localStorage.removeItem('geminiLastVideoOperationName');
            await saveToVideoDB('geminiVideoOperationHistory', JSON.stringify(videoOperationHistory));
        }
    }
    renderOperationSelect();
}

function renderOperationSelect() {
    if (!videoOperationSelect || !videoRecoveryContainer) return;
    if (videoOperationHistory.length === 0) {
        videoRecoveryContainer.style.display = 'none';
        return;
    }
    videoRecoveryContainer.style.display = 'block';
    videoOperationSelect.innerHTML = '';
    videoOperationHistory.forEach(op => {
        const option = document.createElement('option');
        option.value = op.name;
        const words = op.prompt.split(/\s+/).slice(0, 10).join(' ');
        const truncatedPrompt = words.length < op.prompt.length ? words + '...' : words;
        option.textContent = `${truncatedPrompt} (Length: ${op.prompt.length})`;
        videoOperationSelect.appendChild(option);
    });
}

async function initVideoDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(VIDEO_SETTINGS_STORE)) {
                db.createObjectStore(VIDEO_SETTINGS_STORE);
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveToVideoDB(key, value) {
    try {
        const db = await initVideoDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_SETTINGS_STORE, 'readwrite');
            const store = transaction.objectStore(VIDEO_SETTINGS_STORE);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error saving to Video DB [${key}]:`, e);
    }
}

async function getFromVideoDB(key) {
    try {
        const db = await initVideoDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(VIDEO_SETTINGS_STORE, 'readonly');
            const store = transaction.objectStore(VIDEO_SETTINGS_STORE);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error reading from Video DB [${key}]:`, e);
        return null;
    }
}

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
    setLocalStorageItem('geminiVideoApiKey_v1', apiKey);
    videoStatusMessage.textContent = 'API Key set successfully!';
    setTimeout(() => videoStatusMessage.textContent = '', 3000);
    return true;
}

async function loadVideoSettings() {
    const apiKey = getLocalStorageItem('geminiVideoApiKey_v1');
    if (apiKey) {
        videoApiKeyInput.value = apiKey;
        currentVideoApiKey = apiKey;
    }
    const storedModel = getLocalStorageItem('selectedVideoModel_v1');
    if (storedModel && GEMINI_VIDEO_MODELS[storedModel]) {
        selectedVideoModel = storedModel;
    }

    // Load prompt
    const storedPrompt = getLocalStorageItem('videoPromptInput_v1');
    if (storedPrompt) {
        videoPromptInput.value = storedPrompt;
    }

    // Load options
    const options = [
        { el: videoDurationSecondsSelect, key: 'videoDurationSeconds_v1' },
        { el: videoAspectRatioSelect, key: 'videoAspectRatio_v1' },
        { el: videoResolutionSelect, key: 'videoResolution_v1' },
        { el: videoSampleCountInput, key: 'videoSampleCount_v1' },
        { el: videoSeedInput, key: 'videoSeed_v1' },
        { el: videoNegativePromptInput, key: 'videoNegativePrompt_v1' },
        { el: videoPersonGenerationSelect, key: 'videoPersonGeneration_v1' },
        { el: videoGenerateAudioSelect, key: 'videoGenerateAudio_v1' }
    ];
    options.forEach(opt => {
        const val = getLocalStorageItem(opt.key);
        if (val !== null && opt.el) opt.el.value = val;
    });

    // Load assigned images from IndexedDB
    const storedAssignedImages = await getFromVideoDB('assignedImages');
    if (storedAssignedImages) {
        try {
            assignedImages = JSON.parse(storedAssignedImages);
            renderAssignedImages();
        } catch (e) {
            console.error("Failed to parse stored assigned images:", e);
        }
    }

    // Check for recoverable operations
    await loadVideoOperationHistory();
}

function populateVideoModelSelect() {
    videoModelSelect.innerHTML = '';
    for (const modelId in GEMINI_VIDEO_MODELS) {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = GEMINI_VIDEO_MODELS[modelId];
        videoModelSelect.appendChild(option);
    }
    // Ensure the select reflects the loaded state
    if (selectedVideoModel) {
        videoModelSelect.value = selectedVideoModel;
    }
    updateDurationSecondsOptions();
}

function updateDurationSecondsOptions() {
    const model = videoModelSelect.value;
    const isVeo2 = model.includes('veo-2');
    const isVeo3 = model.includes('veo-3');
    const hasFirstOrLastFrame = assignedImages.some(img => img.role === 'image' || img.role === 'lastFrame');

    const currentVal = videoDurationSecondsSelect.value;
    videoDurationSecondsSelect.innerHTML = '<option value="" selected>Not Set (Default: 8)</option>';

    if (hasFirstOrLastFrame) {
        const option = document.createElement('option');
        option.value = "8";
        option.textContent = "8 (Fixed for Image-to-Video)";
        videoDurationSecondsSelect.appendChild(option);
        videoDurationSecondsSelect.value = "8";
        videoDurationSecondsSelect.disabled = true;
    } else {
        videoDurationSecondsSelect.disabled = false;
        let options = [];
        if (isVeo2) {
            options = [5, 6, 7, 8];
        } else if (isVeo3) {
            options = [4, 6, 8];
        } else {
            options = [4, 5, 6, 7, 8]; // Default
        }

        options.forEach(d => {
            const option = document.createElement('option');
            option.value = d.toString();
            option.textContent = d.toString();
            videoDurationSecondsSelect.appendChild(option);
        });

        // Restore previous value if it's still in the list
        if (currentVal && options.includes(parseInt(currentVal, 10))) {
            videoDurationSecondsSelect.value = currentVal;
        }
    }
}

// --- Image Input Handling ---

async function addVideoImageFromUrl() {
    const url = videoImageUrlInput.value.trim();
    if (!url) return;

    videoStatusMessage.textContent = 'Fetching image from URL...';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
            throw new Error('URL does not point to a valid image.');
        }

        const base64Data = await blobToBase64(blob);
        const base64 = base64Data.split(',')[1];
        addAssignedImage(base64, blob.type);
        videoImageUrlInput.value = '';
        videoStatusMessage.textContent = 'Image added from URL.';
        setTimeout(() => {
            if (videoStatusMessage.textContent === 'Image added from URL.') {
                videoStatusMessage.textContent = '';
            }
        }, 3000);
    } catch (error) {
        console.error('Error adding image from URL:', error);
        videoStatusMessage.textContent = `Error: ${error.message} (CORS might block some URLs)`;
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

function addAssignedImage(base64, mimeType = 'image/png') {
    // Default role based on what's already assigned
    let role = 'referenceImage';
    if (!assignedImages.some(img => img.role === 'image')) {
        role = 'image';
    } else if (!assignedImages.some(img => img.role === 'lastFrame')) {
        role = 'lastFrame';
    }

    assignedImages.push({ base64, mimeType, role, referenceType: 'style' });
    renderAssignedImages();
    videoStatusMessage.textContent = 'Image added and assigned.';
    updateDurationSecondsOptions();
}

function renderAssignedImages() {
    assignedImagesList.innerHTML = '';
    if (assignedImages.length === 0) {
        assignedImagesContainer.style.display = 'none';
        saveToVideoDB('assignedImages', JSON.stringify([]));
        return;
    }
    assignedImagesContainer.style.display = 'block';

    assignedImages.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'assigned-image-item';
        wrapper.style.cssText = 'position: relative; border: 1px solid #ccc; padding: 5px; border-radius: 4px; background: white; width: 150px;';

        const preview = document.createElement('img');
        preview.src = `data:${img.mimeType};base64,${img.base64}`;
        preview.style.cssText = 'width: 100%; height: 100px; object-fit: cover; border-radius: 2px;';
        wrapper.appendChild(preview);

        const roleSelect = document.createElement('select');
        roleSelect.style.cssText = 'width: 100%; margin-top: 5px; font-size: 0.8em;';
        const roles = [
            { val: 'image', label: 'First Image (Start)' },
            { val: 'lastFrame', label: 'Last Image (End)' },
            { val: 'referenceImage', label: 'Reference Image' }
        ];
        roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.val;
            opt.textContent = r.label;
            if (img.role === r.val) opt.selected = true;
            roleSelect.appendChild(opt);
        });
        
        const refTypeSelect = document.createElement('select');
        refTypeSelect.style.cssText = 'width: 100%; margin-top: 2px; font-size: 0.8em;';
        refTypeSelect.style.display = img.role === 'referenceImage' ? 'block' : 'none';
        const refTypes = [
            { val: 'style', label: 'Style Ref' },
            { val: 'asset', label: 'Asset Ref' }
        ];
        refTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.val;
            opt.textContent = t.label;
            if (img.referenceType === t.val) opt.selected = true;
            refTypeSelect.appendChild(opt);
        });

        roleSelect.onchange = (e) => {
            img.role = e.target.value;
            refTypeSelect.style.display = img.role === 'referenceImage' ? 'block' : 'none';
            saveToVideoDB('assignedImages', JSON.stringify(assignedImages));
            updateDurationSecondsOptions();
        };

        refTypeSelect.onchange = (e) => {
            img.referenceType = e.target.value;
            saveToVideoDB('assignedImages', JSON.stringify(assignedImages));
        };

        wrapper.appendChild(roleSelect);
        wrapper.appendChild(refTypeSelect);

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&times;';
        removeBtn.style.cssText = 'position: absolute; top: -10px; right: -10px; background: red; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;';
        removeBtn.onclick = () => {
            assignedImages.splice(index, 1);
            renderAssignedImages();
            updateDurationSecondsOptions();
        };
        wrapper.appendChild(removeBtn);

        assignedImagesList.appendChild(wrapper);
    });

    saveToVideoDB('assignedImages', JSON.stringify(assignedImages));
}

function clearAllAssignedImages() {
    assignedImages = [];
    renderAssignedImages();
    imageInput.value = '';
    videoStatusMessage.textContent = 'All assigned images cleared.';
    saveToVideoDB('assignedImages', JSON.stringify([]));
    updateDurationSecondsOptions();
}

// Hook into text2img.js addImageAsInput to update video preview
if (typeof addImageAsInput === 'function') {
    const originalAddImageAsInput = addImageAsInput;
    addImageAsInput = function(base64) {
        originalAddImageAsInput(base64); // Call original to update text2img UI
        addAssignedImage(base64);  // Add to video assigned images
        // Scroll to video input section
        assignedImagesContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        // Removed videoOutputContainer.style.display = 'none'; to keep it uncollapsed
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
        
        // Find assigned images by role
        const firstFrameImg = assignedImages.find(img => img.role === 'image');
        const lastFrameImg = assignedImages.find(img => img.role === 'lastFrame');
        const refImages = assignedImages.filter(img => img.role === 'referenceImage').slice(0, 3);

        // Structure for Veo video generation prompt.
        const instance = {
            prompt: prompt
        };

        if (firstFrameImg) {
            instance.image = {
                bytesBase64Encoded: firstFrameImg.base64,
                mimeType: firstFrameImg.mimeType || 'image/png'
            };
        }

        if (lastFrameImg) {
            instance.lastFrame = {
                bytesBase64Encoded: lastFrameImg.base64,
                mimeType: lastFrameImg.mimeType || 'image/png'
            };
        }

        if (refImages.length > 0) {
            instance.referenceImages = refImages.map(img => ({
                image: {
                    bytesBase64Encoded: img.base64,
                    mimeType: img.mimeType || 'image/png'
                },
                referenceType: img.referenceType || 'style'
            }));
        }

        // Retrieve video generation parameters
        let durationSecondsValue = videoDurationSecondsSelect.value;
        const aspectRatio = videoAspectRatioSelect.value;
        const resolution = videoResolutionSelect.value;
        const sampleCount = videoSampleCountInput.value;
        const seed = videoSeedInput.value;
        const negativePrompt = videoNegativePromptInput.value.trim();
        const personGeneration = videoPersonGenerationSelect.value;
        const generateAudio = videoGenerateAudioSelect.value;

        const parameters = {};
        
        // Requirement: When using referenceImages or frames: 8.
        if (firstFrameImg || lastFrameImg || refImages.length > 0) {
            parameters.durationSeconds = 8;
        } else if (durationSecondsValue) {
            parameters.durationSeconds = parseInt(durationSecondsValue, 10);
        }

        if (aspectRatio) parameters.aspectRatio = aspectRatio;
        if (resolution) parameters.resolution = resolution;
        if (sampleCount) parameters.sampleCount = parseInt(sampleCount, 10);
        if (seed) parameters.seed = parseInt(seed, 10);
        if (negativePrompt) parameters.negativePrompt = negativePrompt;
        if (personGeneration) parameters.personGeneration = personGeneration;
        if (generateAudio) parameters.generateAudio = (generateAudio === 'true');

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
        
        // Save to history
        await saveOperationToHistory(operationName, prompt);

        // Add to sidebar history
        if (typeof addToHistory === 'function') {
            addToHistory({
                type: 'operation',
                name: operationName,
                prompt: prompt,
                model: model,
                timestamp: new Date().toISOString()
            });
        }

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

// Function to recover a video operation by name (ID)
async function recoverVideoOperationByName(name) {
    const isVideoPage = !!document.getElementById('videoPromptInput');
    if (!isVideoPage) {
        alert('Please go to the Video Generation page to retrieve this video.');
        return;
    }

    if (!currentVideoApiKey) {
        alert('Please set your Video API Key first.');
        return;
    }

    let found = false;
    for (let i = 0; i < videoOperationSelect.options.length; i++) {
        if (videoOperationSelect.options[i].value === name) {
            videoOperationSelect.selectedIndex = i;
            found = true;
            break;
        }
    }

    if (!found) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `Sidebar Retrieval: ${name}`;
        videoOperationSelect.appendChild(option);
        videoOperationSelect.value = name;
    }

    recoverVideoOperation();
}

window.recoverVideoOperationByName = recoverVideoOperationByName;

async function recoverVideoOperation() {
    const operationName = videoOperationSelect.value;
    if (!operationName) {
        videoStatusMessage.textContent = 'No operation selected.';
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

        // Add to history
        if (typeof addToHistory === 'function') {
            addToHistory({
                type: 'video',
                url: videoUrl,
                data: blob, // Store the actual Blob for IndexedDB persistence
                videoUri: uri,
                filename: filename,
                timestamp: new Date().toISOString()
            });
        }
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
    setLocalStorageItem('selectedVideoModel_v1', selectedVideoModel);
    updateDurationSecondsOptions();
});
generateVideoButton.addEventListener('click', generateVideoContent);
recoverVideoButton.addEventListener('click', recoverVideoOperation);
stopVideoGenerationButton.addEventListener('click', stopVideoGeneration);
clearAllAssignedImagesButton.addEventListener('click', clearAllAssignedImages);

// Listener for manual file upload
imageInput.addEventListener('change', (event) => {
    handleVideoFileSelect(event);
});

// Listener for camera capture
videoCameraInput.addEventListener('change', (event) => {
    handleVideoFileSelect(event);
});

// Listener for camera button click
videoTakePhotoButton.addEventListener('click', () => {
    videoCameraInput.click();
});

// Listener for Add URL button click
videoAddUrlButton.addEventListener('click', addVideoImageFromUrl);

// persistence Listeners
videoPromptInput.addEventListener('input', () => {
    setLocalStorageItem('videoPromptInput_v1', videoPromptInput.value);
});

const persistOptions = [
    { el: videoDurationSecondsSelect, key: 'videoDurationSeconds_v1' },
    { el: videoAspectRatioSelect, key: 'videoAspectRatio_v1' },
    { el: videoResolutionSelect, key: 'videoResolution_v1' },
    { el: videoSampleCountInput, key: 'videoSampleCount_v1' },
    { el: videoSeedInput, key: 'videoSeed_v1' },
    { el: videoNegativePromptInput, key: 'videoNegativePrompt_v1' },
    { el: videoPersonGenerationSelect, key: 'videoPersonGeneration_v1' },
    { el: videoGenerateAudioSelect, key: 'videoGenerateAudio_v1' }
];

persistOptions.forEach(opt => {
    opt.el.addEventListener('change', () => {
        setLocalStorageItem(opt.key, opt.el.value);
    });
    // For inputs like number or text, also listen to input
    if (opt.el.tagName === 'INPUT' || opt.el.tagName === 'TEXTAREA') {
        opt.el.addEventListener('input', () => {
            setLocalStorageItem(opt.key, opt.el.value);
        });
    }
});

function handleVideoFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result.split(',')[1];
            addAssignedImage(base64, file.type);
        };
        reader.readAsDataURL(file);
    }
}

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