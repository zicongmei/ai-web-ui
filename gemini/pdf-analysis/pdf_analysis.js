// pdf_analysis.js

let currentApiKey = '';
let selectedModel = 'gemini-3.1-flash-lite';
let selectedPdfs = []; // Array of { id, base64, mimeType, name }
let abortController = null;

// Global Stats
let totalTokensCount = 0;
let totalEstimatedCostValue = 0;

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const promptInput = document.getElementById('promptInput');
const pdfFileInput = document.getElementById('pdfFileInput');
const fileUrlInput = document.getElementById('fileUrlInput');
const addUrlButton = document.getElementById('addUrlButton');
const clearUrlButton = document.getElementById('clearUrlButton');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const clearPdfsButton = document.getElementById('clearPdfsButton');
const analyzeButton = document.getElementById('analyzeButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const errorMessage = document.getElementById('errorMessage');
const textOutput = document.getElementById('textOutput');
const apiHistoryContainer = document.getElementById('apiHistoryContainer');
const summaryDisplay = document.getElementById('summaryDisplay');
const inputTokensSpan = document.getElementById('inputTokens');
const outputTokensSpan = document.getElementById('outputTokens');
const totalTokensSpan = document.getElementById('totalTokens');
const totalCostSpan = document.getElementById('totalCost');
const callTimeSpan = document.getElementById('callTime');

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
    const storedModel = localStorage.getItem('selectedPdfModel_v1');
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
        localStorage.setItem('selectedPdfModel_v1', selectedModel);
    });

    pdfFileInput.addEventListener('change', handlePdfSelection);
    addUrlButton.addEventListener('click', addFileFromUrl);
    clearUrlButton.addEventListener('click', () => {
        fileUrlInput.value = '';
    });

    clearPdfsButton.addEventListener('click', () => {
        selectedPdfs = [];
        pdfPreviewContainer.innerHTML = '';
        pdfFileInput.value = '';
    });

    analyzeButton.addEventListener('click', startAnalysis);

    stopButton.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            statusMessage.textContent = 'Analysis stopped.';
            resetUIState();
        }
    });
}

// --- File Handling ---

async function addFileFromUrl() {
    const url = fileUrlInput.value.trim();
    if (!url) return;

    statusMessage.textContent = 'Fetching file from URL...';
    errorMessage.textContent = '';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
        
        const blob = await response.blob();
        
        // Try to infer filename from URL, fallback to 'document_from_url'
        let filename = url.split('/').pop().split('?')[0] || 'document_from_url';
        
        // Manually map extension if missing from blob type but present in URL
        let mimeType = blob.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
            mimeType = getMimeType({ name: filename, type: '' });
        }

        const dataUrl = await blobToBase64(blob);
        const fileInfo = {
            id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            base64: dataUrl.split(',')[1],
            mimeType: mimeType,
            name: filename
        };
        selectedPdfs.push(fileInfo);
        renderPreview(fileInfo);
        
        statusMessage.textContent = 'File added from URL.';
        setTimeout(() => {
            if (statusMessage.textContent === 'File added from URL.') {
                statusMessage.textContent = '';
            }
        }, 3000);
    } catch (error) {
        console.error('Error adding file from URL:', error);
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

function getMimeType(file) {
    if (file.type) return file.type;

    const extension = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
        // Documents
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/json',
        'html': 'text/html',
        
        // Images
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'heic': 'image/heic',
        'heif': 'image/heif',
        
        // Video
        'mp4': 'video/mp4',
        'mpeg': 'video/mpeg',
        'mov': 'video/mpeg',
        'avi': 'video/x-msvideo',
        'wmv': 'video/x-ms-wmv',
        'mpg': 'video/mpeg',
        'webm': 'video/webm',
        
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'aac': 'audio/aac',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac'
    };

    return mimeTypes[extension] || 'text/plain';
}

async function handlePdfSelection(event) {
    const files = Array.from(event.target.files);
    for (const file of files) {
        
        const resolvedMimeType = getMimeType(file);

        try {
            const base64Data = await fileToBase64(file);
            const pdfInfo = {
                id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                base64: base64Data.split(',')[1],
                mimeType: resolvedMimeType,
                name: file.name
            };
            selectedPdfs.push(pdfInfo);
            renderPreview(pdfInfo);
        } catch (error) {
            console.error('Error processing file:', error);
            errorMessage.textContent = 'Error processing some files.';
        }
    }
    pdfFileInput.value = '';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderPreview(pdfInfo) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.dataset.id = pdfInfo.id;
    
    div.innerHTML = `
        <span class="file-icon">📄</span>
        <div style="word-break: break-all;">${pdfInfo.name}</div>
        <button class="remove-btn">×</button>
    `;
    
    const removeBtn = div.querySelector('.remove-btn');
    removeBtn.onclick = () => {
        selectedPdfs = selectedPdfs.filter(p => p.id !== pdfInfo.id);
        div.remove();
    };
    
    pdfPreviewContainer.appendChild(div);
}

// --- API Request ---

async function startAnalysis() {
    const prompt = promptInput.value.trim();
    if (!prompt && selectedPdfs.length === 0) {
        errorMessage.textContent = 'Please upload at least one PDF or provide a prompt.';
        return;
    }

    if (!currentApiKey) {
        errorMessage.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    errorMessage.textContent = '';
    statusMessage.textContent = 'Analyzing PDFs...';
    textOutput.textContent = '';
    apiHistoryContainer.innerHTML = '';
    analyzeButton.disabled = true;
    stopButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

        // Construct parts
        const parts = [];
        if (prompt) {
            parts.push({ text: prompt });
        }
        for (const pdf of selectedPdfs) {
            parts.push({
                inlineData: {
                    mimeType: pdf.mimeType,
                    data: pdf.base64
                }
            });
        }

        const requestBody = {
            contents: [{ role: 'user', parts: parts }]
        };

        const startTime = Date.now();
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': currentApiKey
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        const callTime = Date.now() - startTime;

        if (!response.ok) {
            const errorData = await response.json();
            logApiInteraction(`Analyze Error`, requestBody, errorData);
            throw new Error(errorData.error?.message || response.statusText);
        }

        const data = await response.json();
        logApiInteraction(`Analyze Documents`, requestBody, data);

        if (data.candidates && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            textOutput.textContent = text;
            updateStats(data, callTime);
        } else {
            textOutput.textContent = 'No response received from the model.';
        }

        statusMessage.textContent = 'Analysis complete.';

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Analysis aborted');
        } else {
            console.error('API Error:', error);
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        resetUIState();
    }
}

function resetUIState() {
    analyzeButton.disabled = false;
    stopButton.classList.add('hidden');
    abortController = null;
}

function logApiInteraction(title, request, response) {
    const item = document.createElement('div');
    item.className = 'api-interaction-item';
    item.style.border = '1px solid #ddd';
    item.style.padding = '10px';
    item.style.marginBottom = '10px';
    item.style.borderRadius = '4px';
    item.style.background = '#fefefe';
    
    const timestamp = new Date().toLocaleTimeString();
    
    item.innerHTML = `
        <h4 style="margin-top: 0;">${timestamp} - ${title}</h4>
        <details>
            <summary>View Request</summary>
            <pre style="font-size: 0.8em; overflow: auto; max-height: 300px;">${JSON.stringify(request, null, 2)}</pre>
        </details>
        <details style="margin-top: 5px;">
            <summary>View Response</summary>
            <pre style="font-size: 0.8em; overflow: auto; max-height: 300px;">${JSON.stringify(response, null, 2)}</pre>
        </details>
    `;
    
    apiHistoryContainer.appendChild(item);
}

function updateStats(data, callTime) {
    if (data.usageMetadata) {
        const inputTokens = data.usageMetadata.promptTokenCount || 0;
        const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        const total = inputTokens + outputTokens;
        totalTokensCount += total;
        
        let currentEstimatedCost = 0;
        if (typeof GEMINI_PRICING_CONFIG !== 'undefined') {
            const pricing = GEMINI_PRICING_CONFIG.TEXT[selectedModel];
            if (pricing && pricing.getPricing) {
                const { inputRate, outputRate } = pricing.getPricing(inputTokens);
                currentEstimatedCost = (inputTokens * inputRate) + (outputTokens * outputRate);
                totalEstimatedCostValue += currentEstimatedCost;
            }
        }
        
        summaryDisplay.style.display = 'block';
        inputTokensSpan.textContent = inputTokens;
        outputTokensSpan.textContent = outputTokens;
        totalTokensSpan.textContent = totalTokensCount;
        totalCostSpan.textContent = `$${totalEstimatedCostValue.toFixed(6)}`;
        if (callTime !== undefined) {
            callTimeSpan.textContent = `${callTime}ms`;
        }
    }
}

init();
