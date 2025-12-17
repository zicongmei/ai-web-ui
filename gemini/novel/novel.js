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
const useBatchAbstractCheckbox = document.getElementById('useBatchAbstract');
const numChaptersInput = document.getElementById('numChapters');
const additionalPromptInput = document.getElementById('additionalPrompt');
const generateButton = document.getElementById('generateButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('statusDiv');
const retryArea = document.getElementById('retryArea');
const retryButton = document.getElementById('retryButton');

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

// Abstract Gen Collapsible
const toggleAbstractGen = document.getElementById('toggleAbstractGen');
const abstractGenContent = document.getElementById('abstractGenContent');

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

// Story Gen Elements
const storyGenControls = document.getElementById('storyGenControls');
const storyModelSelect = document.getElementById('storyModelSelect');
const wordsPerChapterInput = document.getElementById('wordsPerChapter');
const storyAdditionalPromptInput = document.getElementById('storyAdditionalPrompt');
const useThoughtSignatureCheckbox = document.getElementById('useThoughtSignature');
const useBatchStoryCheckbox = document.getElementById('useBatchStory');
const startStoryButton = document.getElementById('startStoryButton');
const pauseStoryButton = document.getElementById('pauseStoryButton');
const resumeStoryButton = document.getElementById('resumeStoryButton');
const storyArea = document.getElementById('storyArea');

// History Management DOM
const historyList = document.getElementById('historyList');
const saveToFileButton = document.getElementById('saveToFileButton');
const loadFromFileButton = document.getElementById('loadFromFileButton');
const fileInput = document.getElementById('fileInput');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const newAbstractButton = document.getElementById('newAbstractButton');

const SYSTEM_INSTRUCTION_BASE = `
Write a concise, compelling story writing plan.
Start your response with "Title: [Your Creative Title]".
It need to include the settings, the name of main characters and a detail plan for all {{chapters}} chapters

Create a detailed story idea. Use around 100 words to describe each chapter in the story planning.
`.trim();

const CHAPTER_PROMPT_TEMPLATE = `
Given the following complete story abstract (plan) and the chapters already written, please write Chapter {{chapter_num}} of the story.
Generate a short title for the chapter.
The chapter should be approximately {{words}} words. Focus on progressing the narrative as outlined in the abstract for this specific chapter.

--- Full Story Abstract (Plan) ---
{{abstract}}
--- End Full Story Abstract (Plan) ---

--- Previously Written Chapters (including abstract and previous chapters) ---
{{previous_chapters}}
--- End Previously Written Chapters ---

Write Chapter {{chapter_num}} now, ensuring it flows logically from previous chapters and adheres to the overall story plan.
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
        } else if (item.storyStatus === 'generating') {
            pollStoryChapter(item.id);
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

    if (toggleAbstractGen && abstractGenContent) {
        toggleAbstractGen.addEventListener('click', () => {
            const isCollapsed = abstractGenContent.classList.toggle('collapsed');
            toggleAbstractGen.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
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

    // Story Gen Events
    startStoryButton.addEventListener('click', startStoryGeneration);
    pauseStoryButton.addEventListener('click', pauseStoryGeneration);
    resumeStoryButton.addEventListener('click', resumeStoryGeneration);

    retryButton.addEventListener('click', () => {
        if (currentAbstractId) retryBatchJob(currentAbstractId);
    });
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

    const batchAbstract = localStorage.getItem(STORAGE_PREFIX + 'batchAbstract');
    if (batchAbstract !== null) useBatchAbstractCheckbox.checked = batchAbstract === 'true';

    const batchStory = localStorage.getItem(STORAGE_PREFIX + 'batchStory');
    if (batchStory !== null) useBatchStoryCheckbox.checked = batchStory === 'true';
}

function saveSettings() {
    localStorage.setItem(STORAGE_PREFIX + 'apiKey', currentApiKey);
    localStorage.setItem(STORAGE_PREFIX + 'model', selectedModel);
    localStorage.setItem(STORAGE_PREFIX + 'language', languageInput.value);
    localStorage.setItem(STORAGE_PREFIX + 'chapters', numChaptersInput.value);
    localStorage.setItem(STORAGE_PREFIX + 'batchAbstract', useBatchAbstractCheckbox.checked);
    localStorage.setItem(STORAGE_PREFIX + 'batchStory', useBatchStoryCheckbox.checked);
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
        } else if (item.storyStatus === 'generating') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#28a745';
            statusSpan.textContent = ` (Writing Ch ${item.currentChapterIndex}...)`;
            info.appendChild(statusSpan);
        } else if (item.storyStatus === 'paused') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#6c757d';
            statusSpan.textContent = ' (Paused)';
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
    const useBatch = useBatchAbstractCheckbox.checked;
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

    let finalPayload = request;
    let endpoint = `${model}:generateContent`;

    if (useBatch) {
        endpoint = `${model}:batchGenerateContent`;
        finalPayload = {
            batch: {
                display_name: `novel-gen-preview`,
                input_config: { requests: { requests: [{ request }] } }
            }
        };
    }

    const url = `${GEMINI_API_BASE_URL}${endpoint}?key=${currentApiKey || 'YOUR_API_KEY'}`;
    if (debugUrlPreview) debugUrlPreview.textContent = url;
    if (debugRequestPreview) debugRequestPreview.textContent = JSON.stringify(finalPayload, null, 2);
    
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
        retryArea.classList.add('hidden');
        tokenStats.textContent = 'Tokens: -';
        priceStats.textContent = 'Cost: -';

        // Ensure abstract gen is expanded when looking at a pending job
        if (abstractGenContent) {
            abstractGenContent.classList.remove('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(180deg)';
        }
    } else if (item.status === 'failed') {
        resultContent.textContent = 'Batch job failed: ' + (item.error || 'Unknown error');
        statusDiv.textContent = 'Job failed.';
        statusDiv.classList.remove('hidden');
        
        if (item.error === 'Failed to fetch') {
            retryArea.classList.remove('hidden');
        } else {
            retryArea.classList.add('hidden');
        }

        tokenStats.textContent = 'Tokens: -';
        priceStats.textContent = 'Cost: -';

        // Ensure abstract gen is expanded when looking at a failed job
        if (abstractGenContent) {
            abstractGenContent.classList.remove('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(180deg)';
        }
    } else {
        resultContent.textContent = item.content;
        updateStatsDisplay(item.stats);
        statusDiv.classList.add('hidden');
        retryArea.classList.add('hidden');

        // Auto collapse abstract generation session when completed
        if (abstractGenContent) {
            abstractGenContent.classList.add('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
        }
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

    if (item.status === 'completed') {
        storyGenControls.classList.remove('hidden');
        renderChapters(item);
        
        // Show/hide buttons based on story status
        if (item.storyStatus === 'generating') {
            startStoryButton.classList.add('hidden');
            pauseStoryButton.classList.remove('hidden');
            resumeStoryButton.classList.add('hidden');
        } else if (item.storyStatus === 'paused') {
            startStoryButton.classList.add('hidden');
            pauseStoryButton.classList.add('hidden');
            resumeStoryButton.classList.remove('hidden');
        } else {
            startStoryButton.classList.remove('hidden');
            pauseStoryButton.classList.add('hidden');
            resumeStoryButton.classList.add('hidden');
        }

        if (item.storyParams) {
            storyModelSelect.value = item.storyParams.model || 'gemini-3-pro-preview';
            wordsPerChapterInput.value = item.storyParams.words || 5000;
            storyAdditionalPromptInput.value = item.storyParams.prompt || '';
            useThoughtSignatureCheckbox.checked = !!item.storyParams.useThought;
        }
    } else {
        storyGenControls.classList.add('hidden');
        storyArea.classList.add('hidden');
    }

    renderHistory();
}

function renderChapters(item) {
    storyArea.innerHTML = '';
    if (!item.chapters || item.chapters.length === 0) {
        storyArea.classList.add('hidden');
        return;
    }
    storyArea.classList.remove('hidden');

    item.chapters.forEach((chapter, index) => {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        
        const header = document.createElement('div');
        header.className = 'chapter-header';
        
        const title = document.createElement('h2');
        title.textContent = chapter.title || `Chapter ${index + 1}`;
        
        const editBtn = document.createElement('button');
        editBtn.className = 'secondary';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => {
            const newContent = prompt(`Edit Chapter ${index + 1}:`, chapter.content);
            if (newContent !== null) {
                chapter.content = newContent;
                saveHistory();
                renderChapters(item);
            }
        };

        header.appendChild(title);
        header.appendChild(editBtn);
        
        const content = document.createElement('div');
        content.className = 'chapter-content';
        content.textContent = chapter.content;
        
        card.appendChild(header);
        card.appendChild(content);
        storyArea.appendChild(card);
    });
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

// Story Generation Logic
async function startStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;

    if (item.chapters && item.chapters.length > 0) {
        if (!confirm('This will clear existing chapters and start from Chapter 1. Continue?')) return;
    }

    item.chapters = [];
    item.currentChapterIndex = 1;
    item.storyStatus = 'generating';
    item.storyParams = {
        model: storyModelSelect.value,
        words: wordsPerChapterInput.value,
        prompt: storyAdditionalPromptInput.value,
        useThought: useThoughtSignatureCheckbox.checked,
        useBatch: useBatchStoryCheckbox.checked
    };
    saveHistory();
    loadAbstract(item.id);
    generateNextChapter(item.id);
}

function pauseStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;
    item.storyStatus = 'paused';
    saveHistory();
    loadAbstract(item.id);
    statusDiv.textContent = 'Story generation paused.';
}

function resumeStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;
    
    // Allow updating params on resume
    item.storyParams = {
        model: storyModelSelect.value,
        words: wordsPerChapterInput.value,
        prompt: storyAdditionalPromptInput.value,
        useThought: useThoughtSignatureCheckbox.checked,
        useBatch: useBatchStoryCheckbox.checked
    };
    
    item.storyStatus = 'generating';
    saveHistory();
    loadAbstract(item.id);
    
    if (item.storyParams.useBatch && item.currentChapterBatchName) {
        pollStoryChapter(item.id);
    } else {
        generateNextChapter(item.id);
    }
}

async function generateNextChapter(id) {
    const item = history.find(h => h.id === id);
    if (!item || item.storyStatus !== 'generating') return;

    // Check if we reached the max chapters (from abstract params)
    const maxChapters = parseInt(item.params.numChapters);
    if (item.currentChapterIndex > maxChapters) {
        item.storyStatus = 'completed';
        saveHistory();
        loadAbstract(id);
        alert('Full novel generation complete!');
        return;
    }

    const model = item.storyParams.model;
    const words = item.storyParams.words;
    const chapterNum = item.currentChapterIndex;
    const additionalPrompt = item.storyParams.prompt;
    const useThought = item.storyParams.useThought;
    const useBatch = item.storyParams.useBatch;

    const previousChaptersContent = "Abstract:\n" + item.content + "\n\n" + 
        item.chapters.map((c, i) => `Chapter ${i+1}: ${c.title}\n${c.content}`).join("\n\n");

    const prompt = CHAPTER_PROMPT_TEMPLATE
        .replace(/{{chapter_num}}/g, chapterNum)
        .replace('{{words}}', words)
        .replace('{{abstract}}', item.content)
        .replace('{{previous_chapters}}', previousChaptersContent);

    const fullPrompt = additionalPrompt ? `${prompt}\n\nAdditional Chapter Instructions: ${additionalPrompt}` : prompt;

    const request = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.7 }
    };

    if (useThought && model.startsWith('gemini-3')) {
        request.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    }

    let requestBody;
    let endpoint;

    if (useBatch) {
        endpoint = `${model}:batchGenerateContent`;
        requestBody = {
            batch: {
                display_name: `novel-story-ch${chapterNum}-${Date.now()}`,
                input_config: { requests: { requests: [{ request }] } }
            }
        };
    } else {
        endpoint = `${model}:generateContent`;
        requestBody = request;
    }

    // Show request in debug if current
    if (currentAbstractId === id) {
        const url = `${GEMINI_API_BASE_URL}${endpoint}?key=${currentApiKey}`;
        if (debugActualUrl) debugActualUrl.textContent = url;
        if (debugActualRequest) debugActualRequest.textContent = JSON.stringify(requestBody, null, 2);
        actualRequestGroup.classList.remove('hidden');
        requestPreviewGroup.classList.add('hidden');
        debugResponseGroup.classList.add('hidden');
    }

    try {
        const url = `${GEMINI_API_BASE_URL}${endpoint}?key=${currentApiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(await response.text());
        
        const data = await response.json();
        
        if (currentAbstractId === id) {
            debugResponse.textContent = JSON.stringify(data, null, 2);
            debugResponseGroup.classList.remove('hidden');
        }

        if (useBatch) {
            item.currentChapterBatchName = data.name;
            saveHistory();
            if (currentAbstractId === id) {
                statusDiv.textContent = `Chapter ${chapterNum} request submitted. Polling...`;
                statusDiv.classList.remove('hidden');
            }
            pollStoryChapter(id);
        } else {
            // Standard generation
            const candidate = data.candidates?.[0];
            if (!candidate) throw new Error('No candidate in response');

            const text = candidate.content.parts.map(p => p.text).join('');
            const { title, content } = parseChapterResponse(text, chapterNum);

            item.chapters.push({ title, content });
            item.currentChapterIndex++;
            saveHistory();

            if (currentAbstractId === id) {
                renderChapters(item);
                statusDiv.textContent = `Chapter ${chapterNum} complete. Starting next...`;
            }

            // Small delay before next to avoid rate limits maybe, or just go
            setTimeout(() => generateNextChapter(id), 1000);
        }

    } catch (e) {
        console.error(e);
        if (currentAbstractId === id) {
            statusDiv.textContent = `Error starting Chapter ${chapterNum}: ${e.message}`;
            alert(`Error starting Chapter ${chapterNum}: ${e.message}`);
        }
        item.storyStatus = 'paused';
        saveHistory();
        loadAbstract(id);
    }
}

// Helper for parsing chapter
function parseChapterResponse(text, chapterNum) {
    let title = `Chapter ${chapterNum}`;
    let content = text;
    const titleMatch = text.match(/^(?:Title|Chapter \d+):?\s*(.+)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim();
        content = text.replace(titleMatch[0], '').trim();
    }
    return { title, content };
}

async function pollStoryChapter(id) {
    const item = history.find(h => h.id === id);
    if (!item || !item.currentChapterBatchName || item.storyStatus !== 'generating') return;

    const batchName = item.currentChapterBatchName;
    
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
            
            // Check if user paused while polling
            const currentItem = history.find(h => h.id === id);
            if (!currentItem || currentItem.storyStatus !== 'generating') return;

            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll chapters every 5s
            
            const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${batchName}?key=${currentApiKey}`;
            
            if (isCurrent) {
                if (debugActualUrl) debugActualUrl.textContent = pollUrl;
                if (debugActualRequest) debugActualRequest.textContent = "Method: GET (Polling Batch State)";
                actualRequestGroup.classList.remove('hidden');
                requestPreviewGroup.classList.add('hidden');
            }

            const pollResponse = await fetch(pollUrl, {
                signal: isCurrent ? abortController?.signal : null
            });
            pollData = await pollResponse.json();
            
            if (pollData.error) throw new Error(pollData.error.message);
            
            if (isCurrent) {
                debugResponse.textContent = JSON.stringify(pollData, null, 2);
                debugResponseGroup.classList.remove('hidden');
                statusDiv.textContent = `Generating Chapter ${item.currentChapterIndex}... State: ${getBatchState(pollData) || 'Unknown'}`;
            }

            jobState = getBatchState(pollData);
            if (!jobState && pollData.response) jobState = 'BATCH_STATE_SUCCEEDED';
        }

        if (jobState !== 'BATCH_STATE_SUCCEEDED') throw new Error(`Batch job for Chapter ${item.currentChapterIndex} failed with state: ${jobState}`);

        // Process Result
        let results = null;
        if (pollData.response && pollData.response.inlinedResponses && pollData.response.inlinedResponses.inlinedResponses) {
            results = pollData.response.inlinedResponses.inlinedResponses;
        } else if (pollData.dest && pollData.dest.inlinedResponses) {
            results = pollData.dest.inlinedResponses;
        }
        
        if (!results || results.length === 0) throw new Error('No responses in batch result');

        const resItem = results[0];
        const candidateResponse = resItem.response || resItem;
        const candidate = candidateResponse.candidates?.[0];
        if (!candidate) throw new Error('No candidate in response');

        const text = candidate.content.parts.map(p => p.text).join('');
        const { title, content } = parseChapterResponse(text, item.currentChapterIndex);

        item.chapters.push({ title, content });
        item.currentChapterIndex++;
        item.currentChapterBatchName = null;
        saveHistory();

        if (currentAbstractId === id) {
            renderChapters(item);
            statusDiv.textContent = `Chapter ${item.currentChapterIndex - 1} complete.`;
        }

        // Start next chapter
        generateNextChapter(id);

    } catch (e) {
        console.error(e);
        if (currentAbstractId === id) {
            statusDiv.textContent = `Error during Chapter ${item.currentChapterIndex} generation: ${e.message}`;
            alert(`Error: ${e.message}`);
        }
        item.storyStatus = 'paused';
        saveHistory();
        loadAbstract(id);
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
    const useBatch = useBatchAbstractCheckbox.checked;
    const thinkingLevel = thinkingLevelSelect.value;

    let systemInst = SYSTEM_INSTRUCTION_BASE.replace('{{chapters}}', chapters);
    if (prompt) {
        systemInst += `\n\nThe story idea is: ${prompt}`;
    }
    systemInst += `\n\nThe story language is ${language}`;

    const request = {
        contents: [{ parts: [{ text: "Please generate the novel abstract as instructed." }] }],
        systemInstruction: { parts: [{ text: systemInst }] },
        generationConfig: {
            temperature: 0.7,
        }
    };

    if (useSearch) request.tools = [{ google_search: {} }];
    if (model.startsWith('gemini-3')) {
        request.generationConfig.thinkingConfig = { thinkingLevel };
    }

    let requestBody;
    let endpoint;

    if (useBatch) {
        endpoint = `${model}:batchGenerateContent`;
        requestBody = {
            batch: {
                display_name: `novel-gen-${Date.now()}`,
                input_config: { requests: { requests: [{ request }] } }
            }
        };
    } else {
        endpoint = `${model}:generateContent`;
        requestBody = request;
    }

    // Show actual request
    const url = `${GEMINI_API_BASE_URL}${endpoint}?key=${currentApiKey}`;
    if (debugActualUrl) debugActualUrl.textContent = url;
    if (debugActualRequest) debugActualRequest.textContent = JSON.stringify(requestBody, null, 2);
    actualRequestGroup.classList.remove('hidden');
    requestPreviewGroup.classList.add('hidden');
    debugResponseGroup.classList.add('hidden');

    generateButton.disabled = true;
    generateButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    statusDiv.textContent = useBatch ? 'Submitting Batch Request...' : 'Generating Abstract...';
    statusDiv.classList.remove('hidden');
    if (resultArea) resultArea.classList.add('hidden');
    
    abortController = new AbortController();

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        
        // Display response in debug
        if (useBatch) {
            const batchName = data.name;
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
            
            // Re-display submission response after loadAbstract might have hidden it
            if (debugResponse) debugResponse.textContent = JSON.stringify(data, null, 2);
            if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');
            
            pollBatchJob(newEntry.id);
        } else {
            // Standard generation result
            const candidate = data.candidates?.[0];
            if (!candidate) throw new Error('No candidate in response');

            const text = candidate.content.parts.map(p => p.text).join('');
            const { title, content } = parseAbstractResponse(text, getTimestampTitle());

            const usage = data.usageMetadata;
            const inputTokens = usage?.promptTokenCount || 0;
            const outputTokens = usage?.candidatesTokenCount || 0;
            const cost = calculateCost(model, inputTokens, outputTokens);

            const newEntry = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                title: title,
                status: 'completed',
                content: content,
                model: model,
                params: { language, model, numChapters: chapters, prompt },
                stats: { inputTokens, outputTokens, cost }
            };

            history.push(newEntry);
            saveHistory();
            loadAbstract(newEntry.id);
            
            // Re-display response after loadAbstract might have hidden it
            if (debugResponse) debugResponse.textContent = JSON.stringify(data, null, 2);
            if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');
            
            statusDiv.textContent = 'Generation Complete!';
            generateButton.disabled = false;
            generateButton.classList.remove('hidden');
            stopButton.classList.add('hidden');

            // Explicitly collapse after standard success
            if (abstractGenContent) {
                abstractGenContent.classList.add('collapsed');
                if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
            }
        }

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

// Helper for parsing abstract
function parseAbstractResponse(text, fallbackTitle) {
    let title = fallbackTitle;
    let content = text;
    // Match "Title: [Title]" or "# [Title]" or simply the first non-empty line
    const titleMatch = text.match(/^(?:Title:\s*|#\s*)(.+)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim();
        content = text.replace(titleMatch[0], '').trim();
    } else {
        // Fallback: use first line as title if it's reasonably short
        const lines = text.trim().split('\n');
        if (lines[0] && lines[0].length < 100) {
            title = lines[0].trim();
            content = lines.slice(1).join('\n').trim();
        }
    }
    
    if (content.startsWith('Abstract:')) {
        content = content.replace('Abstract:', '').trim();
    }
    return { title, content };
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

            if (isCurrent) {
                if (debugActualUrl) debugActualUrl.textContent = pollUrl;
                if (debugActualRequest) debugActualRequest.textContent = "Method: GET (Polling Batch State)";
                actualRequestGroup.classList.remove('hidden');
                requestPreviewGroup.classList.add('hidden');
            }

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
        const { title, content } = parseAbstractResponse(text, item.title);

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
            
            // Re-display the final poll result (with content) after loadAbstract might have hidden it
            if (debugResponse) debugResponse.textContent = JSON.stringify(pollData, null, 2);
            if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');
            
            statusDiv.textContent = 'Generation Complete!';
            generateButton.disabled = false;
            generateButton.classList.remove('hidden');
            stopButton.classList.add('hidden');

            // Explicitly collapse after batch success
            if (abstractGenContent) {
                abstractGenContent.classList.add('collapsed');
                if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
            }
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
useGoogleSearchCheckbox.addEventListener('change', () => { saveSettings(); updateDebugPreview(); });
useBatchAbstractCheckbox.addEventListener('change', () => { saveSettings(); updateDebugPreview(); });
useBatchStoryCheckbox.addEventListener('change', () => { saveSettings(); updateDebugPreview(); });
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

async function retryBatchJob(id) {
    const item = history.find(h => h.id === id);
    if (!item) return;

    statusDiv.textContent = 'Retrying fetch...';
    retryArea.classList.add('hidden');

    if (item.currentChapterBatchName) {
        item.storyStatus = 'generating';
        saveHistory();
        loadAbstract(id);
        pollStoryChapter(id);
    } else if (item.batchName) {
        item.status = 'pending';
        saveHistory();
        loadAbstract(id);
        pollBatchJob(id);
    }
}
