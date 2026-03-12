// face_extract.js

let currentApiKey = '';
let selectedModel = 'gemini-2.0-flash';
let selectedImages = []; // Array of { id, base64, mimeType, previewUrl, originalWidth, originalHeight }
let extractedFaces = []; // Array of { id, base64, sourceImageId }
let abortController = null;

// Global Stats
let totalTokensCount = 0;
let totalEstimatedCostValue = 0;

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const imageFileInput = document.getElementById('imageFileInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const addUrlButton = document.getElementById('addUrlButton');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const clearImagesButton = document.getElementById('clearImagesButton');
const extractButton = document.getElementById('extractButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const errorMessage = document.getElementById('errorMessage');
const facesGallery = document.getElementById('facesGallery');
const downloadZipButton = document.getElementById('downloadZipButton');
const clearFacesButton = document.getElementById('clearFacesButton');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');
const summaryDisplay = document.getElementById('summaryDisplay');
const totalTokensSpan = document.getElementById('totalTokens');
const totalCostSpan = document.getElementById('totalCost');
const targetFaceSizeInput = document.getElementById('targetFaceSize');

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
    const storedModel = localStorage.getItem('selectedFaceModel_v1');
    if (storedModel) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
    }
    const storedSize = localStorage.getItem('targetFaceSize_v1');
    if (storedSize) {
        targetFaceSizeInput.value = storedSize;
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
        localStorage.setItem('selectedFaceModel_v1', selectedModel);
    });

    targetFaceSizeInput.addEventListener('change', () => {
        localStorage.setItem('targetFaceSize_v1', targetFaceSizeInput.value);
    });

    imageFileInput.addEventListener('change', handleImageSelection);
    addUrlButton.addEventListener('click', addImageFromUrl);

    clearImagesButton.addEventListener('click', () => {
        selectedImages = [];
        imagePreviewContainer.innerHTML = '';
        imageFileInput.value = '';
    });

    extractButton.addEventListener('click', startExtraction);

    stopButton.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            statusMessage.textContent = 'Extraction stopped.';
            resetUIState();
        }
    });

    clearFacesButton.addEventListener('click', () => {
        extractedFaces = [];
        renderFaces();
    });

    downloadZipButton.addEventListener('click', downloadAllAsZip);
}

// --- Image Handling ---

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

        const dataUrl = await blobToBase64(blob);
        const dimensions = await getImageDimensions(dataUrl);
        const imageInfo = {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            base64: dataUrl.split(',')[1],
            mimeType: blob.type,
            previewUrl: dataUrl,
            width: dimensions.width,
            height: dimensions.height,
            name: url.substring(url.lastIndexOf('/') + 1) || 'image_from_url'
        };
        selectedImages.push(imageInfo);
        renderPreview(imageInfo);
        imageUrlInput.value = '';
        statusMessage.textContent = 'Image added from URL.';
        setTimeout(() => {
            if (statusMessage.textContent === 'Image added from URL.') {
                statusMessage.textContent = '';
            }
        }, 3000);
    } catch (error) {
        console.error('Error adding image from URL:', error);
        errorMessage.textContent = `Error: ${error.message} (CORS might block some URLs)`;
        statusMessage.textContent = '';
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

async function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;

        try {
            const dataUrl = await fileToDataUrl(file);
            const dimensions = await getImageDimensions(dataUrl);
            const imageInfo = {
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                base64: dataUrl.split(',')[1],
                mimeType: file.type,
                previewUrl: dataUrl,
                width: dimensions.width,
                height: dimensions.height,
                name: file.name
            };
            selectedImages.push(imageInfo);
            renderPreview(imageInfo);
        } catch (error) {
            console.error('Error processing image:', error);
            errorMessage.textContent = 'Error processing some images.';
        }
    }
    imageFileInput.value = '';
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = dataUrl;
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

// --- Face Extraction Logic ---

async function startExtraction() {
    if (selectedImages.length === 0) {
        errorMessage.textContent = 'Please upload at least one image.';
        return;
    }

    if (!currentApiKey) {
        errorMessage.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    errorMessage.textContent = '';
    statusMessage.textContent = 'Detecting faces...';
    extractButton.disabled = true;
    stopButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        for (let i = 0; i < selectedImages.length; i++) {
            if (abortController.signal.aborted) break;
            
            const imageInfo = selectedImages[i];
            statusMessage.textContent = `Processing image ${i + 1} of ${selectedImages.length}: ${imageInfo.name}`;
            
            const faces = await detectFaces(imageInfo);
            if (faces && faces.length > 0) {
                for (const face of faces) {
                    await extractFaceImage(imageInfo, face);
                }
                // Render faces progressively after each image is processed
                renderFaces();
            }
        }
        statusMessage.textContent = 'Extraction complete.';
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Extraction aborted');
        } else {
            console.error('Extraction Error:', error);
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        resetUIState();
        // Final render to ensure everything is up to date
        renderFaces();
    }
}

async function detectFaces(imageInfo) {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

    const prompt = "Detect all faces in this image. Return only a JSON array of bounding boxes in [ymin, xmin, ymax, xmax] format. Normalized coordinates (0-1000). Example: [[100, 200, 300, 400], [500, 600, 700, 800]]";

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: imageInfo.mimeType,
                        data: imageInfo.base64
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
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
        updateStats(data);
        try {
            const text = data.candidates[0].content.parts[0].text;
            return JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse face coordinates:", e);
            return [];
        }
    }
    return [];
}

function updateStats(data) {
    if (data.usageMetadata) {
        const inputTokens = data.usageMetadata.promptTokenCount || 0;
        const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        const total = inputTokens + outputTokens;
        totalTokensCount += total;
        
        if (typeof GEMINI_PRICING_CONFIG !== 'undefined') {
            const pricing = GEMINI_PRICING_CONFIG.TEXT[selectedModel];
            if (pricing && pricing.getPricing) {
                const { inputRate, outputRate } = pricing.getPricing(inputTokens);
                const currentCost = (inputTokens * inputRate) + (outputTokens * outputRate);
                totalEstimatedCostValue += currentCost;
            }
        }
        
        summaryDisplay.style.display = 'block';
        totalTokensSpan.textContent = totalTokensCount;
        totalCostSpan.textContent = `$${totalEstimatedCostValue.toFixed(6)}`;
    }
}

async function extractFaceImage(imageInfo, box) {
    // box is [ymin, xmin, ymax, xmax] in 0-1000
    const ymin = box[0] / 1000 * imageInfo.height;
    const xmin = box[1] / 1000 * imageInfo.width;
    const ymax = box[2] / 1000 * imageInfo.height;
    const xmax = box[3] / 1000 * imageInfo.width;

    const width = xmax - xmin;
    const height = ymax - ymin;
    
    // To make it a square, find the center and use the larger dimension with padding
    const centerX = xmin + width / 2;
    const centerY = ymin + height / 2;
    let size = Math.max(width, height) * 1.5; // 50% extra padding

    // Clamp and adjust to keep it a square within image boundaries
    let left = centerX - size / 2;
    let top = centerY - size / 2;

    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (left + size > imageInfo.width) size = imageInfo.width - left;
    if (top + size > imageInfo.height) size = imageInfo.height - top;
    
    // Final clamp to ensure squareness if we hit multiple edges
    const finalSize = Math.min(size, imageInfo.width - left, imageInfo.height - top);
    
    const targetOutputSize = parseInt(targetFaceSizeInput.value, 10) || 256;

    const canvas = document.createElement('canvas');
    canvas.width = targetOutputSize;
    canvas.height = targetOutputSize;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.src = imageInfo.previewUrl;
    
    return new Promise((resolve) => {
        img.onload = () => {
            // Draw the cropped area, scaling it to the targetOutputSize
            ctx.drawImage(img, left, top, finalSize, finalSize, 0, 0, targetOutputSize, targetOutputSize);
            const faceBase64 = canvas.toDataURL('image/png').split(',')[1];
            extractedFaces.push({
                id: 'face_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                base64: faceBase64,
                sourceImageId: imageInfo.id
            });
            resolve();
        };
    });
}

function renderFaces() {
    facesGallery.innerHTML = '';
    extractedFaces.forEach((face, index) => {
        const div = document.createElement('div');
        div.className = 'face-item';
        
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${face.base64}`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            extractedFaces.splice(index, 1);
            renderFaces();
        };
        
        div.appendChild(img);
        div.appendChild(removeBtn);
        facesGallery.appendChild(div);
    });

    downloadZipButton.disabled = extractedFaces.length === 0;
}

async function downloadAllAsZip() {
    if (extractedFaces.length === 0) return;

    statusMessage.textContent = 'Creating ZIP file...';
    const zip = new JSZip();
    
    extractedFaces.forEach((face, index) => {
        zip.file(`face_${index + 1}.png`, face.base64, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    
    // Format date and time: YYYYMMDD_HHMMSS
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    link.download = `extracted_faces_${timestamp}.zip`;
    link.click();
    statusMessage.textContent = 'ZIP download started.';
    setTimeout(() => statusMessage.textContent = '', 3000);
}

function resetUIState() {
    extractButton.disabled = false;
    stopButton.classList.add('hidden');
    abortController = null;
}

init();
