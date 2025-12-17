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
const resultArea = document.getElementById('resultArea');
const resultTitle = document.getElementById('resultTitle');
const resultContent = document.getElementById('resultContent');
const tokenStats = document.getElementById('tokenStats');
const priceStats = document.getElementById('priceStats');
const historyList = document.getElementById('historyList');
const saveToFileButton = document.getElementById('saveToFileButton');
const loadFromFileButton = document.getElementById('loadFromFileButton');
const fileInput = document.getElementById('fileInput');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const newAbstractButton = document.getElementById('newAbstractButton');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadHistory();
    renderHistory();
    updateModelOptions();
    
    // Check for API key in general storage if not in novel storage
    if (!apiKeyInput.value) {
        const globalKey = localStorage.getItem('geminiApiKey');
        if (globalKey) {
            apiKeyInput.value = globalKey;
            currentApiKey = globalKey;
        }
    }
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

// ... (History Management remains the same) ...

function loadAbstract(id) {
    const item = history.find(h => h.id === id);
    if (!item) return;
    
    currentAbstractId = id;
    resultTitle.textContent = item.title;
    resultContent.textContent = item.content;
    
    // Restore inputs logic if desired, but mostly just show result
    // We could restore the prompt inputs used to generate this
    languageInput.value = item.params.language;
    modelSelect.value = item.params.model;
    numChaptersInput.value = item.params.numChapters;
    additionalPromptInput.value = item.params.prompt;
    
    updateStatsDisplay(item.stats);
    resultArea.classList.remove('hidden');
    renderHistory();
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

    const fullPrompt = `
You are a professional novel editor and writer.
Task: Write a detailed abstract for a novel.
Language: ${language}
Target Number of Chapters: ${chapters}
Additional Requirements: ${prompt}

Structure your response exactly as follows:
Title: [Insert Creative Title Here]
Abstract:
[Insert Detailed Abstract Here, outlining the plot, characters, and key themes]
    `.trim();

    // Prepare the single request object for the batch
    const singleRequest = {
        request: {
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
                temperature: 0.7,
            }
        },
        metadata: { key: 'novel-abstract-req' }
    };

    if (useSearch) {
        singleRequest.request.tools = [{ google_search: {} }];
    }

    // Add Thinking Config if Gemini 3
    if (model.startsWith('gemini-3')) {
        singleRequest.request.generationConfig.thinkingConfig = {
            thinkingLevel: thinkingLevel
        };
    }

    const requestBody = {
        batch: {
            display_name: `novel-gen-${Date.now()}`,
            input_config: {
                requests: {
                    requests: [singleRequest]
                }
            }
        }
    };

    generateButton.disabled = true;
    generateButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    statusDiv.textContent = 'Submitting Batch Request...';
    resultArea.classList.add('hidden');
    
    abortController = new AbortController();

    try {
        // 1. Submit Batch Job
        const batchResponse = await fetch(`${GEMINI_API_BASE_URL}${model}:batchGenerateContent?key=${currentApiKey}`, {
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
        const batchName = batchData.name; // e.g. "batch/..."
        
        statusDiv.textContent = `Batch Job Submitted. Polling ${batchName}...`;

        // 2. Polling Logic
        const getBatchState = (d) => {
            if (d.state) return d.state;
            if (d.metadata && d.metadata.state) return d.metadata.state;
            return undefined;
        };

        let jobState = getBatchState(batchData);
        let pollData = batchData;

        while (jobState !== 'BATCH_STATE_SUCCEEDED' && jobState !== 'BATCH_STATE_FAILED' && jobState !== 'BATCH_STATE_CANCELLED') {
            if (abortController.signal.aborted) {
                throw new Error('Generation cancelled by user.');
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3 seconds
            
            const pollResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}?key=${currentApiKey}`, {
                signal: abortController.signal
            });
            
            pollData = await pollResponse.json();
            
            if (pollData.error) throw new Error(pollData.error.message);
            
            jobState = getBatchState(pollData);
            
            // If state is undefined but 'response' exists, it means job succeeded and result is ready
            if (!jobState && pollData.response) {
                jobState = 'BATCH_STATE_SUCCEEDED';
            }
            
            statusDiv.textContent = `Processing... State: ${jobState || 'Unknown'}`;
        }

        if (jobState !== 'BATCH_STATE_SUCCEEDED') {
            throw new Error(`Batch job ended with state: ${jobState}`);
        }

        statusDiv.textContent = 'Processing Result...';

        // 3. Process Result
        let results = null;
        if (pollData.response && pollData.response.inlinedResponses && pollData.response.inlinedResponses.inlinedResponses) {
            results = pollData.response.inlinedResponses.inlinedResponses;
        } else if (pollData.dest && pollData.dest.inlinedResponses) {
            results = pollData.dest.inlinedResponses;
        }
        
        if (!results || !Array.isArray(results) || results.length === 0) {
            throw new Error('No responses in batch result');
        }

        const item = results[0];
        // Check for error in individual item
        if (item.status && item.status.code && item.status.code !== 0) {
             throw new Error(`Generation failed: ${item.status.message}`);
        }

        // item.response contains the GenerateContentResponse, or the item itself is the response structure
        const candidateResponse = item.response || item;
        const candidate = candidateResponse.candidates?.[0];
        if (!candidate) {
             throw new Error('No candidate in response');
        }

        const text = candidate.content.parts.map(p => p.text).join('');
        
        // Parse Title and Abstract
        let title = 'Untitled Novel';
        let content = text;
        const titleMatch = text.match(/^Title:\s*(.+)$/m);
        if (titleMatch) {
            title = titleMatch[1].trim();
            content = text.replace(titleMatch[0], '').trim();
            if (content.startsWith('Abstract:')) {
                content = content.replace('Abstract:', '').trim();
            }
        }

        // Stats
        const usage = candidateResponse.usageMetadata || candidate.usageMetadata;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const cost = calculateCost(model, inputTokens, outputTokens);

        const newEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            title: title,
            content: content,
            model: model,
            params: { language, model, numChapters: chapters, prompt },
            stats: { inputTokens, outputTokens, cost }
        };

        history.push(newEntry);
        saveHistory();
        loadAbstract(newEntry.id);
        
        statusDiv.textContent = 'Generation Complete!';

    } catch (e) {
        if (e.name === 'AbortError') {
            statusDiv.textContent = 'Cancelled.';
        } else {
            console.error(e);
            statusDiv.textContent = `Error: ${e.message}`;
            alert(`Error: ${e.message}`);
        }
    } finally {
        generateButton.disabled = false;
        generateButton.classList.remove('hidden');
        stopButton.classList.add('hidden');
        abortController = null;
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
languageInput.addEventListener('change', saveSettings);
numChaptersInput.addEventListener('change', saveSettings);

newAbstractButton.addEventListener('click', () => {
    currentAbstractId = null;
    resultArea.classList.add('hidden');
    resultTitle.textContent = '';
    resultContent.textContent = '';
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
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novel_abstracts_${Date.now()}.json`;
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
            if (Array.isArray(loaded)) {
                history = loaded;
                saveHistory();
                alert('History loaded successfully');
            } else {
                alert('Invalid file format');
            }
        } catch (err) {
            alert('Error loading file: ' + err.message);
        }
    };
    reader.readAsText(file);
});
