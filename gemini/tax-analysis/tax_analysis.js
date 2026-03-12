// tax_analysis.js

let currentApiKey = '';
let selectedModel = 'gemini-3.1-flash-lite-preview';
let selectedFiles = []; // Array of { id, base64, mimeType, name }
let abortController = null;
let extractedData = []; // Array of parsed JSON objects from Gemini

// Global Stats
let totalTokensCount = 0;
let totalEstimatedCostValue = 0;

// IndexedDB Constants
const DB_NAME = 'GeminiTaxAnalysisDB';
const DB_VERSION = 1;
const FILES_STORE = 'uploadedTaxFiles';

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(FILES_STORE)) {
                db.createObjectStore(FILES_STORE);
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveToDB(storeName, key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error saving to IndexedDB [${storeName}:${key}]:`, e);
    }
}

async function getFromDB(storeName, key) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Error loading from IndexedDB [${storeName}:${key}]:`, e);
        return null;
    }
}

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const fileInput = document.getElementById('fileInput');
const filePreviewContainer = document.getElementById('filePreviewContainer');
const clearFilesButton = document.getElementById('clearFilesButton');
const analyzeButton = document.getElementById('analyzeButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const tablesContainer = document.getElementById('tablesContainer');
const apiResponseBody = document.getElementById('apiResponseBody');
const summaryDisplay = document.getElementById('summaryDisplay');
const totalTokensSpan = document.getElementById('totalTokens');
const totalCostSpan = document.getElementById('totalCost');

// --- Initialization ---

function init() {
    loadSettings();
    addEventListeners();
}

async function loadSettings() {
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

    // Load persisted files
    const storedFilesStr = await getFromDB(FILES_STORE, 'selectedFiles');
    if (storedFilesStr) {
        try {
            const storedFiles = JSON.parse(storedFilesStr);
            if (Array.isArray(storedFiles)) {
                selectedFiles = storedFiles;
                filePreviewContainer.innerHTML = '';
                selectedFiles.forEach(f => renderPreview(f));
            }
        } catch (e) {
            console.error("Failed to parse stored files:", e);
        }
    }
}

async function saveFilesToDB() {
    await saveToDB(FILES_STORE, 'selectedFiles', JSON.stringify(selectedFiles));
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

    fileInput.addEventListener('change', handleFileSelection);

    clearFilesButton.addEventListener('click', async () => {
        selectedFiles = [];
        filePreviewContainer.innerHTML = '';
        fileInput.value = '';
        resultsSection.style.display = 'none';
        tablesContainer.innerHTML = '';
        extractedData = [];
        await saveFilesToDB();
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

function getMimeType(file) {
    if (file.type) return file.type;
    const extension = file.name.split('.').pop().toLowerCase();
    const mimeTypes = {
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

async function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    for (const file of files) {
        const resolvedMimeType = getMimeType(file);
        try {
            const base64Data = await fileToBase64(file);
            const fileInfo = {
                id: 'tax_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                base64: base64Data.split(',')[1],
                mimeType: resolvedMimeType,
                name: file.name
            };
            selectedFiles.push(fileInfo);
            renderPreview(fileInfo);
        } catch (error) {
            console.error('Error processing file:', error);
            errorMessage.textContent = 'Error processing some files.';
        }
    }
    fileInput.value = '';
    await saveFilesToDB();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderPreview(fileInfo) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.dataset.id = fileInfo.id;
    
    let icon = '📄';
    if (fileInfo.mimeType.startsWith('image/')) icon = '🖼️';
    
    div.innerHTML = `
        <span class="file-icon">${icon}</span>
        <div style="word-break: break-all; margin-bottom: 10px;">${fileInfo.name}</div>
        <button class="remove-btn">×</button>
    `;
    
    const removeBtn = div.querySelector('.remove-btn');
    removeBtn.onclick = async () => {
        selectedFiles = selectedFiles.filter(f => f.id !== fileInfo.id);
        div.remove();
        await saveFilesToDB();
    };
    
    filePreviewContainer.appendChild(div);
}

// --- Analysis Logic ---

async function startAnalysis() {
    if (selectedFiles.length === 0) {
        errorMessage.textContent = 'Please upload at least one tax form.';
        return;
    }

    if (!currentApiKey) {
        errorMessage.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    errorMessage.textContent = '';
    extractedData = []; // Reset extracted data
    tablesContainer.innerHTML = '';
    resultsSection.style.display = 'none';
    analyzeButton.disabled = true;
    stopButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            if (abortController.signal.aborted) break;
            
            const fileInfo = selectedFiles[i];
            
            // Step 1: Identify Form Type
            statusMessage.textContent = `Identifying form type for ${i + 1} of ${selectedFiles.length}: ${fileInfo.name}...`;
            const typeInfo = await identifyFormType(fileInfo);
            const formType = typeInfo ? typeInfo.form_type : 'Unknown';
            
            // Step 2: Extract Data using specific prompt
            statusMessage.textContent = `Extracting ${formType} data for ${i + 1} of ${selectedFiles.length}: ${fileInfo.name}...`;
            const data = await extractDataFromForm(fileInfo, formType);
            
            if (data) {
                const addDataEntry = (entry) => {
                    entry._sourceFile = fileInfo.name;
                    if (typeInfo && typeInfo.issuer && (!entry.issuer || entry.issuer === 'Unknown')) {
                        entry.issuer = typeInfo.issuer;
                    }
                    extractedData.push(entry);
                };

                if (Array.isArray(data)) {
                    data.forEach(item => addDataEntry(item));
                } else {
                    addDataEntry(data);
                }
            }
        }
        
        if (!abortController.signal.aborted) {
            statusMessage.textContent = 'Analysis complete. Grouping results...';
            renderTables();
            statusMessage.textContent = '';
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Analysis aborted');
        } else {
            console.error('Analysis Error:', error);
            errorMessage.textContent = `Error: ${error.message}`;
        }
    } finally {
        resetUIState();
    }
}

async function identifyFormType(fileInfo) {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

    const prompt = `Identify the type of tax form in the provided image/document. 
Return ONLY a valid JSON object.
The JSON object must have this structure:
{
  "form_type": "The specific name/type of the form (e.g., 'W-2', '1099-INT', '1099-DIV', '1098')",
  "issuer": "The name of the employer, bank, or institution issuing the form"
}`;

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: fileInfo.mimeType,
                        data: fileInfo.base64
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
        }
    };

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
        throw new Error(errorData.error?.message || response.statusText);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0].content) {
        updateStats(data);
        try {
            const text = data.candidates[0].content.parts[0].text;
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanedText);
        } catch (e) {
            console.error("Failed to parse form identification JSON:", e);
            return null;
        }
    }
    return null;
}

async function getPromptForType(formType) {
    let fileName = 'prompt/generic_prompt.txt';
    const type = formType.toLowerCase();
    
    if (type.includes('w-2')) {
        fileName = 'prompt/w2_prompt.txt';
    } else if (type.includes('1099-int')) {
        fileName = 'prompt/1099int_prompt.txt';
    } else if (type.includes('1099-div')) {
        fileName = 'prompt/1099div_prompt.txt';
    } else if (type.includes('1099-b')) {
        fileName = 'prompt/1099b_prompt.txt';
    } else if (type.includes('composite') || type.includes('consolidated')) {
        fileName = 'prompt/1099composite_prompt.txt';
    }
    
    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error('Could not fetch prompt file');
        return await response.text();
    } catch (e) {
        console.warn(`Could not load prompt for ${formType}, using generic.`, e);
        try {
            const fallback = await fetch('prompt/generic_prompt.txt');
            return await fallback.text();
        } catch (err) {
            return `Extract tax data from this form as JSON.`;
        }
    }
}

async function extractDataFromForm(fileInfo, formType) {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

    const prompt = await getPromptForType(formType);

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: fileInfo.mimeType,
                        data: fileInfo.base64
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
        }
    };

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
        throw new Error(errorData.error?.message || response.statusText);
    }

    const data = await response.json();
    apiResponseBody.textContent = JSON.stringify(data, null, 2);

    if (data.candidates && data.candidates[0].content) {
        updateStats(data);
        try {
            const text = data.candidates[0].content.parts[0].text;
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanedText);
            return parsedData;
        } catch (e) {
            console.error("Failed to parse tax form JSON:", e, data.candidates[0].content.parts[0].text);
            return null;
        }
    }
    return null;
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

// --- Rendering Logic ---

function renderTables() {
    if (extractedData.length === 0) {
        errorMessage.textContent = "No valid data extracted from the forms.";
        return;
    }

    resultsSection.style.display = 'block';
    
    // Group by form_type
    const groups = {};
    extractedData.forEach(form => {
        const type = form.form_type || 'Unknown Form';
        if (!groups[type]) groups[type] = [];
        groups[type].push(form);
    });

    for (const [formType, forms] of Object.entries(groups)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tax-table-wrapper';
        
        const title = document.createElement('h3');
        title.textContent = formType;
        wrapper.appendChild(title);

        // Collect all unique field keys across all forms of this type
        const allKeysSet = new Set();
        forms.forEach(f => {
            if (f.fields) {
                Object.keys(f.fields).forEach(k => allKeysSet.add(k));
            }
        });
        // Sort keys alphabetically for consistent display
        const allKeys = Array.from(allKeysSet).sort();

        const table = document.createElement('table');
        
        // Header Row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const thField = document.createElement('th');
        thField.textContent = 'Field Name';
        headerRow.appendChild(thField);

        forms.forEach((f, idx) => {
            const th = document.createElement('th');
            // Show issuer or file name
            const issuer = f.issuer && f.issuer !== 'Unknown' ? f.issuer : f._sourceFile;
            th.textContent = `Form ${idx + 1} (${issuer})`;
            headerRow.appendChild(th);
        });

        const thTotal = document.createElement('th');
        thTotal.textContent = 'Total';
        thTotal.className = 'total-col';
        headerRow.appendChild(thTotal);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body Rows (One per field key)
        const tbody = document.createElement('tbody');
        
        allKeys.forEach(key => {
            const tr = document.createElement('tr');
            
            const tdName = document.createElement('td');
            tdName.textContent = key;
            tdName.style.fontWeight = '500';
            tr.appendChild(tdName);

            let rowTotal = 0;

            forms.forEach(f => {
                const tdVal = document.createElement('td');
                const val = f.fields && f.fields[key] !== undefined ? f.fields[key] : null;
                
                if (val !== null && !isNaN(val)) {
                    const numVal = parseFloat(val);
                    tdVal.textContent = numVal.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                    rowTotal += numVal;
                } else {
                    tdVal.textContent = '-';
                }
                tr.appendChild(tdVal);
            });

            const tdTotal = document.createElement('td');
            tdTotal.textContent = rowTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
            tdTotal.className = 'total-col';
            tr.appendChild(tdTotal);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);
        tablesContainer.appendChild(wrapper);
    }
}

function resetUIState() {
    analyzeButton.disabled = false;
    stopButton.classList.add('hidden');
    abortController = null;
}

init();
