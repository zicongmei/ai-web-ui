// novel.js

// Configuration
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const STORAGE_PREFIX = 'novel_';

// State
let currentApiKey = '';
let selectedModel = 'gemini-3-pro-preview';
let history = []; // Array of abstract objects
let currentAbstractId = null;
let abortController = null;

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const languageInput = document.getElementById('languageInput');
const modelSelect = document.getElementById('modelSelect');
const thinkingLevelSelect = document.getElementById('thinkingLevelSelect');
const thinkingLevelGroup = document.getElementById('thinkingLevelGroup');
const useGoogleSearchCheckbox = document.getElementById('useGoogleSearch');
const numChaptersInput = document.getElementById('numChapters');
const additionalPromptInput = document.getElementById('additionalPrompt');
const generateButton = document.getElementById('generateButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('statusDiv');

// Debug Elements
const debugSection = document.getElementById('debugSection');
const toggleDebug = document.getElementById('toggleDebug');
const debugContent = document.getElementById('debugContent');
const debugUrlPreview = document.getElementById('debugUrlPreview');
const debugRequestPreview = document.getElementById('debugRequestPreview');
const debugActualUrl = document.getElementById('debugActualUrl');
const debugActualRequest = document.getElementById('debugActualRequest');
const debugResponse = document.getElementById('debugResponse');
const requestPreviewGroup = document.getElementById('requestPreviewGroup');
const actualRequestGroup = document.getElementById('actualRequestGroup');
const debugResponseGroup = document.getElementById('apiResponseGroup');

// Template Elements
const tplChapters = document.getElementById('tplChapters');
const tplIdea = document.getElementById('tplIdea');
const tplIdeaWrapper = document.getElementById('tplIdeaWrapper');
const tplLanguage = document.getElementById('tplLanguage');
const toggleInstruction = document.getElementById('toggleInstruction');
const systemInstructionTemplate = document.getElementById('systemInstructionTemplate');

// Result Elements
const resultArea = document.getElementById('resultArea');
const resultTitle = document.getElementById('resultTitle');
const resultContent = document.getElementById('resultContent');
const tokenStats = document.getElementById('tokenStats');
const priceStats = document.getElementById('priceStats');
const saveEditButton = document.getElementById('saveEditButton');
const discardEditButton = document.getElementById('discardEditButton');

// History Management DOM
const historyList = document.getElementById('historyList');
const saveToFileButton = document.getElementById('saveToFileButton');
const loadFromFileButton = document.getElementById('loadFromFileButton');
const fileInput = document.getElementById('fileInput');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const newAbstractButton = document.getElementById('newAbstractButton');

const SYSTEM_INSTRUCTION_BASE = `
Write a concise, compelling story writing plan.
It need to include the settings, the name of main characters and a detail plan for all {{chapters}} chapters

Create a detailed story idea. Use around 100 words to describe each chapter in the story planning.
`.trim();

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadHistory();
    renderHistory();
    updateModelOptions();
    updateDebugPreview();
    
    // Check for API key in general storage if not in novel storage
    if (!apiKeyInput.value) {
        const globalKey = localStorage.getItem('geminiApiKey');
        if (globalKey) {
            apiKeyInput.value = globalKey;
            currentApiKey = globalKey;
        }
    }

    // Auto-resume pending jobs
    history.forEach(item => {
        if (item.status === 'pending') {
            pollBatchJob(item.id);
        }
    });

    // Collapsible Logic
    if (toggleInstruction && systemInstructionTemplate) {
        toggleInstruction.addEventListener('click', () => {
            const isCollapsed = systemInstructionTemplate.classList.toggle('collapsed');
            toggleInstruction.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    if (toggleDebug && debugContent) {
        toggleDebug.addEventListener('click', () => {
            const isCollapsed = debugContent.classList.toggle('collapsed');
            toggleDebug.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    // Edit logic
    resultContent.addEventListener('input', () => {
        if (currentAbstractId) {
            const item = history.find(h => h.id === currentAbstractId);
            if (item && item.status === 'completed' && resultContent.textContent !== item.content) {
                saveEditButton.classList.remove('hidden');
                discardEditButton.classList.remove('hidden');
            }
        }
    });

    saveEditButton.addEventListener('click', saveAbstractEdits);
    discardEditButton.addEventListener('click', () => loadAbstract(currentAbstractId));
});

// Settings Management
function loadSettings() {
    const key = localStorage.getItem(STORAGE_PREFIX + 'apiKey');
    if (key) {
        apiKeyInput.value = key;
        currentApiKey = key;
    }

    const model = localStorage.getItem(STORAGE_PREFIX + 'model');
    if (model) {
        modelSelect.value = model;
        selectedModel = model;
    }
    
    const lang = localStorage.getItem(STORAGE_PREFIX + 'language');
    if (lang) languageInput.value = lang;
    
    const chapters = localStorage.getItem(STORAGE_PREFIX + 'chapters');
    if (chapters) numChaptersInput.value = chapters;
}

function saveSettings() {
    localStorage.setItem(STORAGE_PREFIX + 'apiKey', currentApiKey);
    localStorage.setItem(STORAGE_PREFIX + 'model', selectedModel);
    localStorage.setItem(STORAGE_PREFIX + 'language', languageInput.value);
    localStorage.setItem(STORAGE_PREFIX + 'chapters', numChaptersInput.value);
}

function saveHistory() {
    localStorage.setItem(STORAGE_PREFIX + 'history', JSON.stringify(history));
}

function loadHistory() {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'history');
    if (saved) {
        try {
            history = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse history", e);
            history = [];
        }
    }
}

function renderHistory() {
    historyList.innerHTML = '';
    // Sort by timestamp descending
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        if (currentAbstractId === item.id) div.classList.add('active');
        
        const title = document.createElement('h4');
        title.textContent = item.title || 'Untitled';
        
        const info = document.createElement('p');
        const date = new Date(item.timestamp).toLocaleString();
        info.textContent = `${date} | ${item.model}`;
        
        if (item.status === 'pending') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#ff8c00';
            statusSpan.textContent = ' (Pending...)';
            info.appendChild(statusSpan);
        } else if (item.status === 'failed') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#dc3545';
            statusSpan.textContent = ' (Failed)';
            info.appendChild(statusSpan);
        }

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete from history';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });

        div.appendChild(title);
        div.appendChild(info);
        div.appendChild(deleteBtn);
        
        div.addEventListener('click', () => loadAbstract(item.id));
        historyList.appendChild(div);
    });
}

function deleteHistoryItem(id) {
    if (confirm('Delete this item from history?')) {
        history = history.filter(h => h.id !== id);
        saveHistory();
        if (currentAbstractId === id) {
            newAbstractButton.click();
        }
        renderHistory();
    }
}

function getTimestampTitle() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `story-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}


function updateDebugPreview() {
    const chapters = numChaptersInput.value || 'xx';
    const idea = additionalPromptInput.value || '';
    const language = languageInput.value || 'xx';

    if (tplChapters) tplChapters.textContent = chapters;
    if (tplLanguage) tplLanguage.textContent = language;
    
    let systemInst = SYSTEM_INSTRUCTION_BASE.replace('{{chapters}}', chapters);

    if (idea) {
        if (tplIdea) tplIdea.textContent = idea;
        if (tplIdeaWrapper) tplIdeaWrapper.classList.remove('hidden');
        systemInst += `\n\nThe story idea is: ${idea}`;
    } else {
        if (tplIdeaWrapper) tplIdeaWrapper.classList.add('hidden');
    }

    systemInst += `\n\nThe story language is ${language}`;

    const model = modelSelect.value;
    const useSearch = useGoogleSearchCheckbox.checked;
    const thinkingLevel = thinkingLevelSelect.value;

    const request = {
        contents: [{ parts: [{ text: "Please generate the novel abstract as instructed." }] }],
        systemInstruction: { parts: [{ text: systemInst }] },
        generationConfig: { temperature: 0.7 }
    };

    if (useSearch) request.tools = [{ google_search: {} }];
    if (model.startsWith('gemini-3')) {
        request.generationConfig.thinkingConfig = { thinkingLevel };
    }

    const batchRequest = {
        batch: {
            display_name: `novel-gen-preview`,
            input_config: { requests: { requests: [{ request }] } }
        }
    };

    const url = `${GEMINI_API_BASE_URL}${model}:batchGenerateContent?key=${currentApiKey || 'YOUR_API_KEY'}`;
    if (debugUrlPreview) debugUrlPreview.textContent = url;
    if (debugRequestPreview) debugRequestPreview.textContent = JSON.stringify(batchRequest, null, 2);
    
    // Reset other debug views when editing
    if (actualRequestGroup) actualRequestGroup.classList.add('hidden');
    if (debugResponseGroup) debugResponseGroup.classList.add('hidden');
    if (requestPreviewGroup) requestPreviewGroup.classList.remove('hidden');
}

function loadAbstract(id) {
    const item = history.find(h => h.id === id);
    if (!item) return; 
    
    currentAbstractId = id;
    resultTitle.textContent = item.title;
    
    if (item.status === 'pending') {
        resultContent.textContent = 'Batch job is still processing...';
        statusDiv.textContent = 'Polling for results...';
        statusDiv.classList.remove('hidden');
        tokenStats.textContent = 'Tokens: -';
        priceStats.textContent = 'Cost: -';
    } else if (item.status === 'failed') {
        resultContent.textContent = 'Batch job failed: ' + (item.error || 'Unknown error');
        statusDiv.textContent = 'Job failed.';
        statusDiv.classList.remove('hidden');
        tokenStats.textContent = 'Tokens: -';
        priceStats.textContent = 'Cost: -';
    } else {
        resultContent.textContent = item.content;
        updateStatsDisplay(item.stats);
        statusDiv.classList.add('hidden');
    }

    if (saveEditButton) saveEditButton.classList.add('hidden');
    if (discardEditButton) discardEditButton.classList.add('hidden');
    
    // Restore inputs and update preview
    if (item.params) {
        languageInput.value = item.params.language;
        modelSelect.value = item.params.model;
        numChaptersInput.value = item.params.numChapters;
        additionalPromptInput.value = item.params.prompt;
        updateDebugPreview();
    }
    
    if (resultArea) resultArea.classList.remove('hidden');
    renderHistory();
}

function saveAbstractEdits() {
    const item = history.find(h => h.id === currentAbstractId);
    if (item) {
        item.content = resultContent.textContent;
        saveHistory();
        saveEditButton.classList.add('hidden');
        discardEditButton.classList.add('hidden');
        alert('Changes saved to history.');
    }
}

// Generation Logic
async function generateAbstract() {
    if (!currentApiKey) {
        alert('Please set your API Key first.');
        return;
    }

    const language = languageInput.value;
    const model = modelSelect.value;
    const chapters = numChaptersInput.value;
    const prompt = additionalPromptInput.value;
    const useSearch = useGoogleSearchCheckbox.checked;
    const thinkingLevel = thinkingLevelSelect.value;

    let systemInst = SYSTEM_INSTRUCTION_BASE.replace('{{chapters}}', chapters);
    if (prompt) {
        systemInst += `\n\nThe story idea is: ${prompt}`;
    }
    systemInst += `\n\nThe story language is ${language}`;

    const singleRequest = {
        request: {
            contents: [{ parts: [{ text: "Please generate the novel abstract as instructed." }] }],
            systemInstruction: { parts: [{ text: systemInst }] },
            generationConfig: {
                temperature: 0.7,
            }
        }
    };

    if (useSearch) singleRequest.request.tools = [{ google_search: {} }];
    if (model.startsWith('gemini-3')) {
        singleRequest.request.generationConfig.thinkingConfig = { thinkingLevel };
    }

    const requestBody = {
        batch: {
            display_name: `novel-gen-${Date.now()}`,
            input_config: { requests: { requests: [singleRequest] } }
        }
    };

    // Show actual request
    const url = `${GEMINI_API_BASE_URL}${model}:batchGenerateContent?key=${currentApiKey}`;
    if (debugActualUrl) debugActualUrl.textContent = url;
    if (debugActualRequest) debugActualRequest.textContent = JSON.stringify(requestBody, null, 2);
    if (actualRequestGroup) actualRequestGroup.classList.remove('hidden');
    if (requestPreviewGroup) requestPreviewGroup.classList.add('hidden');
    if (debugResponseGroup) debugResponseGroup.classList.add('hidden');

    generateButton.disabled = true;
    generateButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    statusDiv.textContent = 'Submitting Batch Request...';
    statusDiv.classList.remove('hidden');
    if (resultArea) resultArea.classList.add('hidden');
    
    abortController = new AbortController();

    try {
        const batchResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        if (!batchResponse.ok) {
            const err = await batchResponse.json();
            throw new Error(err.error?.message || batchResponse.statusText);
        }

        const batchData = await batchResponse.json();
        
        // Display response in debug
        if (debugResponse) debugResponse.textContent = JSON.stringify(batchData, null, 2);
        if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');

        const batchName = batchData.name;
        
        const newEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            title: getTimestampTitle(),
            status: 'pending',
            batchName: batchName,
            model: model,
            params: { language, model, numChapters: chapters, prompt },
            stats: { inputTokens: 0, outputTokens: 0, cost: 0 }
        };

        history.push(newEntry);
        saveHistory();
        loadAbstract(newEntry.id);
        pollBatchJob(newEntry.id);

    } catch (e) {
        if (e.name === 'AbortError') {
            statusDiv.textContent = 'Cancelled.';
        } else {
            console.error(e);
            statusDiv.textContent = `Error: ${e.message}`;
            alert(`Error: ${e.message}`);
        }
        generateButton.disabled = false;
        generateButton.classList.remove('hidden');
        stopButton.classList.add('hidden');
    } finally {
        abortController = null;
    }
}

async function pollBatchJob(id) {
    const item = history.find(h => h.id === id);
    if (!item || item.status !== 'pending') return;

    const batchName = item.batchName;
    const model = item.model;
    
    try {
        const getBatchState = (d) => {
            if (d.state) return d.state;
            if (d.metadata && d.metadata.state) return d.metadata.state;
            return undefined;
        };

        let jobState = 'BATCH_STATE_PENDING';
        let pollData = null;

        while (jobState !== 'BATCH_STATE_SUCCEEDED' && jobState !== 'BATCH_STATE_FAILED' && jobState !== 'BATCH_STATE_CANCELLED') {
            const isCurrent = (currentAbstractId === id);
            if (isCurrent && abortController && abortController.signal.aborted) {
                throw new Error('Polling stopped by user.');
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}?key=${currentApiKey}`;
            const pollResponse = await fetch(pollUrl, {
                signal: isCurrent ? abortController?.signal : null
            });
            pollData = await pollResponse.json();
            
            if (pollData.error) throw new Error(pollData.error.message);
            
            // Update debug response if current
            if (isCurrent && debugResponse) {
                debugResponse.textContent = JSON.stringify(pollData, null, 2);
                if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');
            }

            jobState = getBatchState(pollData);
            if (!jobState && pollData.response) jobState = 'BATCH_STATE_SUCCEEDED';
            
            if (isCurrent) {
                statusDiv.textContent = `Processing... State: ${jobState || 'Unknown'}`;
            }
        }

        if (jobState !== 'BATCH_STATE_SUCCEEDED') {
            throw new Error(`Batch job ended with state: ${jobState}`);
        }

        // Process Result
        let results = null;
        if (pollData.response && pollData.response.inlinedResponses && pollData.response.inlinedResponses.inlinedResponses) {
            results = pollData.response.inlinedResponses.inlinedResponses;
        } else if (pollData.dest && pollData.dest.inlinedResponses) {
            results = pollData.dest.inlinedResponses;
        }
        
        if (!results || !Array.isArray(results) || results.length === 0) {
            throw new Error('No responses in batch result');
        }

        const resItem = results[0];
        if (resItem.status && resItem.status.code && resItem.status.code !== 0) {
             throw new Error(`Generation failed: ${resItem.status.message}`);
        }

        const candidateResponse = resItem.response || resItem;
        const candidate = candidateResponse.candidates?.[0];
        if (!candidate) throw new Error('No candidate in response');

        const text = candidate.content.parts.map(p => p.text).join('');
        
        let title = item.title; // Keep timestamp title if parsing fails
        let content = text;
        const titleMatch = text.match(/^Title:\s*(.+)$/m);
        if (titleMatch) {
            title = titleMatch[1].trim();
            content = text.replace(titleMatch[0], '').trim();
            if (content.startsWith('Abstract:')) {
                content = content.replace('Abstract:', '').trim();
            }
        }

        const usage = candidateResponse.usageMetadata || candidate.usageMetadata;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const cost = calculateCost(model, inputTokens, outputTokens);

        // Update history item
        item.status = 'completed';
        item.title = title;
        item.content = content;
        item.stats = { inputTokens, outputTokens, cost };
        saveHistory();
        
        if (currentAbstractId === id) {
            loadAbstract(id);
            statusDiv.textContent = 'Generation Complete!';
            generateButton.disabled = false;
            generateButton.classList.remove('hidden');
            stopButton.classList.add('hidden');
        } else {
            renderHistory();
        }

    } catch (e) {
        console.error(e);
        item.status = 'failed';
        item.error = e.message;
        saveHistory();
        if (currentAbstractId === id) {
            statusDiv.textContent = `Error: ${e.message}`;
            resultContent.textContent = `Error: ${e.message}`;
            generateButton.disabled = false;
            generateButton.classList.remove('hidden');
            stopButton.classList.add('hidden');
        }
        renderHistory();
    }
}

// Cost Calculation (Simplified based on price.js knowledge)
function calculateCost(model, input, output) {
    // We can assume GEMINI_PRICING_CONFIG is available globally if we import price.js in HTML
    if (typeof GEMINI_PRICING_CONFIG !== 'undefined' && GEMINI_PRICING_CONFIG.TEXT[model]) {
        const prices = GEMINI_PRICING_CONFIG.TEXT[model].getPricing(input);
        return (input * prices.inputRate) + (output * prices.outputRate);
    }
    return 0;
}

function updateStatsDisplay(stats) {
    tokenStats.textContent = `Tokens: In ${stats.inputTokens} / Out ${stats.outputTokens}`;
    priceStats.textContent = `Est. Cost: $${stats.cost.toFixed(6)}`;
}

// Model Options
function updateModelOptions() {
    const isGemini3 = modelSelect.value.startsWith('gemini-3');
    if (isGemini3) {
        thinkingLevelGroup.classList.remove('hidden');
        useGoogleSearchCheckbox.parentElement.classList.remove('hidden'); // Google search usually supported on newer models
    } else {
        thinkingLevelGroup.classList.add('hidden');
        // useGoogleSearchCheckbox.parentElement.classList.add('hidden'); // Keep search visible generally or check model capability
    }
    selectedModel = modelSelect.value;
    saveSettings();
    updateDebugPreview();
}

// Event Listeners
setApiKeyButton.addEventListener('click', () => {
    currentApiKey = apiKeyInput.value.trim();
    saveSettings();
    alert('API Key Saved');
});

generateButton.addEventListener('click', generateAbstract);
stopButton.addEventListener('click', () => {
    if (abortController) abortController.abort();
});

modelSelect.addEventListener('change', updateModelOptions);
languageInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
numChaptersInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
additionalPromptInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
useGoogleSearchCheckbox.addEventListener('change', updateDebugPreview);
thinkingLevelSelect.addEventListener('change', updateDebugPreview);

newAbstractButton.addEventListener('click', () => {
    currentAbstractId = null;
    resultArea.classList.add('hidden');
    resultTitle.textContent = '';
    resultContent.textContent = '';
    renderHistory();
    // Optional: Clear inputs
});

clearHistoryButton.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
        history = [];
        saveHistory();
        newAbstractButton.click();
    }
});

saveToFileButton.addEventListener('click', () => {
    if (!currentAbstractId) {
        alert('Please select a job from history to save.');
        return;
    }
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;

    const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${item.id}.json`;
    a.click();
});

loadFromFileButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const loaded = JSON.parse(evt.target.result);
            const processItem = (item) => {
                if (!item || !item.id) return false;
                // If ID exists, append a suffix to make it unique or just skip if exactly same
                const existing = history.find(h => h.id === item.id);
                if (existing) {
                    if (JSON.stringify(existing) === JSON.stringify(item)) {
                        return false; // Skip identical
                    }
                    item.id = item.id + '_' + Date.now(); // Make unique
                }
                history.push(item);
                return true;
            };

            let addedCount = 0;
            if (Array.isArray(loaded)) {
                loaded.forEach(item => {
                    if (processItem(item)) addedCount++;
                });
            } else if (typeof loaded === 'object') {
                if (processItem(loaded)) addedCount = 1;
            }

            if (addedCount > 0) {
                saveHistory();
                renderHistory();
                if (addedCount === 1 && !Array.isArray(loaded)) {
                    loadAbstract(loaded.id);
                }
                alert(`Successfully loaded ${addedCount} job(s).`);
            } else {
                alert('No new unique jobs found in the file.');
            }
        } catch (err) {
            alert('Error loading file: ' + err.message);
        }
        // Reset file input so same file can be selected again
        e.target.value = '';
    };
    reader.readAsText(file);
});