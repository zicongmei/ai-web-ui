// chatbot.js

let chatHistory = []; // Array of { speaker: string, text: string, thoughtSignature?: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name
let currentApiKey = '';
let selectedModel = 'gemini-2.5-flash-lite';
let systemInstruction = 'Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character. NEVER try to "wrap up" the roleplay. This is a never-ending roleplay. Multi-line messages are not allowed - each individual message must be a single paragraph. Avoid unnecessary and unoriginal repetition of previous messages. Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative. Use the same language as input or previous diaglog. Do not include the thought in repsonse text.'; 

let totalInputTokens = 0;
let totalOutputTokens = 0;
let currentInputTokens = 0;
let currentOutputTokens = 0;

let thinkingBudget = -1;
let thinkingLevel = 'low';

let saveThoughtSignature = true;

const STORAGE_PREFIX = 'mpc_'; // Prefix to separate storage from other pages

const MODEL_PRICES = {
    'gemini-2.5-flash': { 
        getPricing: (promptTokenCount) => ({ inputRate: 0.30 / 1_000_000, outputRate: 2.50 / 1_000_000 })
    },
    'gemini-2.5-pro': { 
        getPricing: (promptTokenCount) => ({ inputRate: 1.25 / 1_000_000, outputRate: 10.00 / 1_000_000 })
    },
    'gemini-2.5-flash-lite': { 
        getPricing: (promptTokenCount) => ({ inputRate: 0.10 / 1_000_000, outputRate: 0.40 / 1_000_000 })
    },
    'gemini-3-pro-preview': {
        getPricing: (promptTokenCount) => {
            const PROMPT_THRESHOLD_TOKENS = 200_000;
            let inputRate = promptTokenCount <= PROMPT_THRESHOLD_TOKENS ? 2.00 / 1_000_000 : 4.00 / 1_000_000;
            let outputRate = promptTokenCount <= PROMPT_THRESHOLD_TOKENS ? 12.00 / 1_000_000 : 18.00 / 1_000_000;
            return { inputRate, outputRate };
        }
    }
};
let currentRequestCost = 0;
let totalCost = 0;

let lastRawRequestBody = null;
let lastRawResponseData = null;
let abortController = null;

let chatFontSize = 1.0;
const MIN_FONT_SIZE = 0.4;
const MAX_FONT_SIZE = 4;
const FONT_SIZE_STEP = 0.1;

// DOM Elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const chatHistoryBox = document.getElementById('chatHistoryBox'); // Changed to TextArea
const messageInput = document.getElementById('messageInput');
const sendUserMessageButton = document.getElementById('sendUserMessageButton');
// New Narrator elements
const narratorMessageInput = document.getElementById('narratorMessageInput');
const sendNarratorMessageButton = document.getElementById('sendNarratorMessageButton');

const stopMessageButton = document.getElementById('stopMessageButton');
const errorMessageDiv = document.getElementById('errorMessage');
const tokenStatsDiv = document.getElementById('tokenStats');
const costStatsDiv = document.getElementById('costStats');

// JSON Editor elements removed

const systemInstructionInput = document.getElementById('systemInstructionInput');
const clearSystemInstructionButton = document.getElementById('clearSystemInstructionButton');

const saveChatButton = document.getElementById('saveChatButton');
const loadChatButton = document.getElementById('loadChatButton');
const loadChatFileInput = document.getElementById('loadChatFileInput');

const removeLastEntryButton = document.getElementById('removeLastEntryButton');
const regenerateLastLineButton = document.getElementById('regenerateLastLineButton');
const clearAllHistoryButton = document.getElementById('clearAllHistoryButton');
const cleanThinkingSignatureButton = document.getElementById('cleanThinkingSignatureButton');

const showApiDebugButton = document.getElementById('showApiDebugButton');
const apiDebugContent = document.getElementById('apiDebugContent');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');

const thinkingConfigSection = document.getElementById('thinkingConfigSection');
const thinkingBudgetInput = document.getElementById('thinkingBudgetInput');
const thinkingLevelSelect = document.getElementById('thinkingLevelSelect');

const saveThoughtSignatureCheckbox = document.getElementById('saveThoughtSignatureCheckbox');
const cleanupAllThoughtSignaturesButton = document.getElementById('cleanupAllThoughtSignaturesButton');

const increaseFontSizeButton = document.getElementById('increaseFontSizeButton');
const decreaseFontSizeButton = document.getElementById('decreaseFontSizeButton');
const resetFontSizeButton = document.getElementById('resetFontSizeButton');

// New DOM Elements for Role Management
const newRoleNameInput = document.getElementById('newRoleNameInput');
const addRoleButton = document.getElementById('addRoleButton');
const activeRolesList = document.getElementById('activeRolesList');
const responseGenerationButtonsContainer = document.getElementById('responseGenerationButtonsContainer'); // Renamed

// New DOM Element for User Name
const userNameInput = document.getElementById('userNameInput');

// --- LocalStorage Utils ---
function setLocalStorageItem(name, value) {
    try { localStorage.setItem(STORAGE_PREFIX + name, value); } catch (e) { console.error(e); }
}

function getLocalStorageItem(name) {
    try { return localStorage.getItem(STORAGE_PREFIX + name); } catch (e) { return null; }
}

// --- Initialization & Config ---
function setApiKey() {
    const apiKey = geminiApiKeyInput.value.trim();
    if (!apiKey) {
        errorMessageDiv.textContent = 'Please enter your Gemini API Key.';
        return false;
    }
    currentApiKey = apiKey;
    setLocalStorageItem('geminiApiKey', apiKey);
    errorMessageDiv.textContent = 'API Key set!';
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
    return true;
}

function loadApiKey() {
    const apiKey = getLocalStorageItem('geminiApiKey');
    if (apiKey) {
        geminiApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
    }
}

function updateSelectedModel() {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedModel', selectedModel);
    updateThinkingControlsVisibility();
}

function loadSelectedModel() {
    const stored = getLocalStorageItem('selectedModel');
    if (stored) {
        selectedModel = stored;
        geminiModelSelect.value = stored;
    }
    updateThinkingControlsVisibility();
}

function loadThinkingConfig() {
    const b = getLocalStorageItem('thinkingBudget');
    if (b !== null) thinkingBudget = parseInt(b, 10);
    thinkingBudgetInput.value = thinkingBudget;
    
    const l = getLocalStorageItem('thinkingLevel');
    if (l) thinkingLevel = l;
    thinkingLevelSelect.value = thinkingLevel;

    const s = getLocalStorageItem('saveThoughtSignature');
    if (s !== null) {
        saveThoughtSignature = (s === 'true');
        saveThoughtSignatureCheckbox.checked = saveThoughtSignature;
    }
}

function updateThinkingControlsVisibility() {
    thinkingBudgetInput.parentElement.classList.add('hidden');
    thinkingLevelSelect.parentElement.classList.add('hidden');
    if (selectedModel.startsWith('gemini-3')) {
        thinkingLevelSelect.parentElement.classList.remove('hidden');
    } else {
        thinkingBudgetInput.parentElement.classList.remove('hidden');
    }
}

// --- User Name Management ---
function loadUserName() {
    const storedName = getLocalStorageItem('userName');
    if (storedName !== null) { // Check if 'userName' key exists in localStorage
        userName = storedName; // Can be an empty string
        userNameInput.value = storedName;
    } else {
        userName = 'User'; // Default if no entry in localStorage
        userNameInput.value = userName;
    }
    updateUserMessagePlaceholder();
}

function setUserName() {
    const newName = userNameInput.value.trim();
    userName = newName; // Allow userName to be an empty string
    setLocalStorageItem('userName', userName);
    updateUserMessagePlaceholder(); // This will ensure the placeholder reflects 'User' if userName is empty
    renderBotResponseButtons(); // Re-render buttons to update User's name if changed
}

function updateUserMessagePlaceholder() {
    const displayUserName = userName || 'User'; // Use 'User' for display if userName is empty
    messageInput.placeholder = `Type a message for ${displayUserName}...`;
}

// --- Font Size ---
function updateChatFontSize() {
    document.documentElement.style.setProperty('--chat-font-size', `${chatFontSize}em`);
    setLocalStorageItem('chatFontSize', chatFontSize.toString());
    adjustChatHistoryHeight(); // Adjust height if font size changes
}
function increaseFontSize() { if (chatFontSize < MAX_FONT_SIZE) { chatFontSize += FONT_SIZE_STEP; updateChatFontSize(); } }
function decreaseFontSize() { if (chatFontSize > MIN_FONT_SIZE) { chatFontSize -= FONT_SIZE_STEP; updateChatFontSize(); } }
function resetFontSize() { chatFontSize = 1.0; updateChatFontSize(); }
function loadChatFontSize() {
    const s = getLocalStorageItem('chatFontSize');
    if (s) chatFontSize = parseFloat(s) || 1.0;
    updateChatFontSize();
}

// --- Role Management ---
function saveRolesToLocalStorage() {
    setLocalStorageItem('botRoles', JSON.stringify(botRoles));
}

function loadRolesFromLocalStorage() {
    const stored = getLocalStorageItem('botRoles');
    if (stored) {
        try {
            botRoles = JSON.parse(stored);
            if (!Array.isArray(botRoles)) botRoles = [];
        } catch (e) { botRoles = []; }
    }
    renderRolesList();
    renderBotResponseButtons();
}

function addRole() {
    const name = newRoleNameInput.value.trim();
    if (!name) return;
    if (botRoles.includes(name) || name === userName || name === 'Narrator' || name === 'System') { // Prevent role name conflict with user/narrator/system
        errorMessageDiv.textContent = `Role name "${name}" is reserved or already exists.`;
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }
    botRoles.push(name);
    newRoleNameInput.value = '';
    saveRolesToLocalStorage();
    renderRolesList();
    renderBotResponseButtons();
}

function removeRole(name) {
    botRoles = botRoles.filter(r => r !== name);
    saveRolesToLocalStorage();
    renderRolesList();
    renderBotResponseButtons();
}

function renderRolesList() {
    activeRolesList.innerHTML = '';
    botRoles.forEach(role => {
        const span = document.createElement('span');
        span.className = 'role-tag';
        span.innerHTML = `${role} <span class="delete-role" onclick="removeRole('${role}')">&times;</span>`;
        span.querySelector('.delete-role').onclick = () => removeRole(role);
        activeRolesList.appendChild(span);
    });
}

function renderBotResponseButtons() {
    responseGenerationButtonsContainer.innerHTML = '';

    // Add User response button
    const userBtn = document.createElement('button');
    userBtn.textContent = `${userName || 'User'}`;
    userBtn.className = 'bot-action-button';
    userBtn.onclick = () => generateResponseForRole(userName);
    responseGenerationButtonsContainer.appendChild(userBtn);

    // Add Bot roles response buttons
    botRoles.forEach(role => {
        const btn = document.createElement('button');
        btn.textContent = `${role}`; 
        btn.className = 'bot-action-button';
        btn.onclick = () => generateResponseForRole(role);
        responseGenerationButtonsContainer.appendChild(btn);
    });
}

// --- Chat History Management ---

function adjustChatHistoryHeight() {
    if (!chatHistoryBox) return;
    chatHistoryBox.style.height = 'auto';
    chatHistoryBox.style.height = (chatHistoryBox.scrollHeight + 10) + 'px';
}

// Syncs the content of the editable text area back into the chatHistory array
function syncChatHistoryFromUI() {
    const text = chatHistoryBox.value;
    const lines = text.split('\n');
    const newHistory = [];
    
    let currentSpeaker = null;
    let buffer = [];

    const flush = () => {
        if (currentSpeaker) {
            const entryText = buffer.join('\n').trim();
            const newEntry = { speaker: currentSpeaker, text: entryText };
            
            // Try to preserve thoughtSignature if an existing entry matches
            const existing = chatHistory.find(h => h.speaker === currentSpeaker && h.text === entryText && h.thoughtSignature);
            if (existing) {
                newEntry.thoughtSignature = existing.thoughtSignature;
            }
            
            newHistory.push(newEntry);
        }
        buffer = [];
    };

    // Modified regex to support Chinese and other characters in role names
    // It captures anything up to the first colon as the role name
    const roleRegex = /^([^:\n]+):(.*)$/;

    for (const line of lines) {
        const match = line.match(roleRegex);
        if (match) {
            const possibleRole = match[1].trim();
            if (possibleRole.length < 50) { // Arbitrary limit to prevent matching long lines as roles
                flush();
                currentSpeaker = possibleRole;
                buffer.push(match[2].trimStart()); // Trim start to remove leading space after colon
                continue;
            }
        }
        
        if (currentSpeaker) {
            buffer.push(line);
        }
    }
    flush();
    
    chatHistory = newHistory;
}

function saveChatHistory() {
    syncChatHistoryFromUI(); // Ensure array matches text box
    setLocalStorageItem('chatHistory', JSON.stringify(chatHistory));
    setLocalStorageItem('systemInstruction', systemInstruction);
}

function loadChatHistory() {
    const h = getLocalStorageItem('chatHistory');
    const s = getLocalStorageItem('systemInstruction');
    
    if (s) {
        systemInstruction = s;
        systemInstructionInput.value = s;
    } else { 
        systemInstructionInput.value = systemInstruction;
    }

    if (h) {
        try {
            chatHistory = JSON.parse(h);
            if (!Array.isArray(chatHistory)) chatHistory = [];
        } catch (e) { chatHistory = []; }
    }

    renderChatHistory();
}

function addUserMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    chatHistory.push({ speaker: userName, text: text });
    
    messageInput.value = '';
    adjustTextareaHeight(); // Adjust height for the user input box
    
    renderChatHistory(); // Update chat history box and handle scroll
    saveChatHistory();
}

function addNarratorMessage() {
    const text = narratorMessageInput.value.trim();
    if (!text) return;

    chatHistory.push({ speaker: 'Narrator', text: text });

    narratorMessageInput.value = '';
    adjustNarratorTextareaHeight(); // Adjust height for the narrator input box

    renderChatHistory(); // Update chat history box and handle scroll
    saveChatHistory();
}

function renderChatHistory() {
    if (!chatHistoryBox) return;
    
    // 1. Capture current scroll state *before* content changes
    const currentScrollTop = chatHistoryBox.scrollTop;
    const currentScrollHeight = chatHistoryBox.scrollHeight;
    const currentClientHeight = chatHistoryBox.clientHeight;
    // We consider it "scrolled to bottom" if the scrollbar is within a few pixels of its max position.
    const isScrolledToBottom = (currentScrollHeight - currentScrollTop - currentClientHeight) < 5; 

    // 2. Update content
    const text = chatHistory.map(entry => `${entry.speaker}: ${entry.text}`).join('\n\n');
    chatHistoryBox.value = text;

    // 3. Adjust textarea's CSS height (this might change scrollHeight and clientHeight)
    adjustChatHistoryHeight(); 

    // 4. Restore/adjust scroll position
    if (isScrolledToBottom) {
        // If user was at the bottom, scroll to the new bottom
        chatHistoryBox.scrollTop = chatHistoryBox.scrollHeight;
    } else {
        // Otherwise, attempt to restore the previous scroll position
        // This is robust for content additions/removals at the end or middle
        chatHistoryBox.scrollTop = currentScrollTop;
    }
}

function removeLastEntry() {
    syncChatHistoryFromUI();
    if (chatHistory.length > 0) {
        chatHistory.pop();
        renderChatHistory();
        saveChatHistory();
    }
}

async function regenerateLastLine() {
    syncChatHistoryFromUI();
    if (chatHistory.length === 0) return;
    
    const lastEntry = chatHistory[chatHistory.length - 1];
    // Allow regeneration for any role that can be generated (User, Narrator, or BotRoles)
    const generatableRoles = [userName, 'Narrator', ...botRoles];
    if (generatableRoles.includes(lastEntry.speaker)) {
        chatHistory.pop();
        renderChatHistory();
        saveChatHistory();
        await generateResponseForRole(lastEntry.speaker);
    } else {
        errorMessageDiv.textContent = 'Cannot regenerate: Last message is not from a generatable role (User, Narrator, or Bot).';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }
}

function clearAllHistory() {
    if (confirm('Clear all chat history and remove all roles?')) {
        chatHistory = [];
        botRoles = []; // Clear roles
        userName = 'User'; // Reset user name to default
        userNameInput.value = userName; // Update the input field
        setUserName(); // Save the default user name to local storage, and re-render buttons
        updateUserMessagePlaceholder(); // Update the placeholder text
        
        totalInputTokens = 0; 
        totalOutputTokens = 0; 
        totalCost = 0;
        
        renderChatHistory();
        renderRolesList(); // Update UI for roles
        renderBotResponseButtons(); // Update UI for buttons
        renderStats();
        
        saveChatHistory(); // Save the cleared history (and syncs from empty UI)
        saveRolesToLocalStorage(); // Save the cleared roles
        saveStats();
    }
}

// --- API Interaction ---

async function generateResponseForRole(targetRole) {
    if (!currentApiKey) {
        errorMessageDiv.textContent = 'Set API Key first.';
        return;
    }

    syncChatHistoryFromUI();

    toggleInputs(false);
    errorMessageDiv.textContent = `Thinking for ${targetRole}...`;
    stopMessageButton.disabled = false;
    stopMessageButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        let promptText = "";
        if (systemInstruction) {
            promptText += systemInstruction + "\n\n";
        }
        
        promptText += "## Begin of chat history\n\n";

        chatHistory.forEach(entry => {
            promptText += `${entry.speaker}: ${entry.text}\n\n`;
        });
        
        promptText += "## End of chat history\n\n";
        promptText += `Please write a response from role ${targetRole}\n\n`;
        promptText += `${targetRole}:`;

        // Ensure stop_sequences does not exceed 5
        const stopSequences = [];
        const MAX_STOP_SEQUENCES = 5;

        // Collect all possible speakers for stop sequences
        const allPossibleSpeakers = new Set();
        allPossibleSpeakers.add(userName);
        allPossibleSpeakers.add('Narrator');
        allPossibleSpeakers.add('System'); // System is not a speaker in chatHistory but good for stop sequence
        botRoles.forEach(role => allPossibleSpeakers.add(role));
        
        // Add speakers as stop sequences, excluding the targetRole
        // Prioritize System, Narrator, then User, then botRoles alphabetically
        const sortedSpeakers = Array.from(allPossibleSpeakers).sort((a, b) => {
            if (a === 'System') return -1;
            if (b === 'System') return 1;
            if (a === 'Narrator') return -1;
            if (b === 'Narrator') return 1;
            if (a === userName && b !== 'System' && b !== 'Narrator') return -1; // User is next priority
            if (b === userName && a !== 'System' && a !== 'Narrator') return 1;
            return a.localeCompare(b); // Alphabetical for other roles
        });

        for (const speaker of sortedSpeakers) {
            if (speaker !== targetRole) {
                if (stopSequences.length < MAX_STOP_SEQUENCES) {
                    stopSequences.push(`\n${speaker}:`);
                } else {
                    break; 
                }
            }
        }
        
        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                maxOutputTokens: 8192,
                stopSequences: stopSequences,
                thinkingConfig: selectedModel.startsWith('gemini-3') 
                    ? { thinkingLevel: thinkingLevel } 
                    : { thinkingBudget: thinkingBudget }
            }
        };

        lastRawRequestBody = JSON.stringify(requestBody, null, 2);

        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

        currentInputTokens = 0; currentOutputTokens = 0; currentRequestCost = 0;

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': currentApiKey },
            body: lastRawRequestBody,
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        lastRawResponseData = JSON.stringify(data, null, 2);

        if (data.usageMetadata) {
            currentInputTokens = data.usageMetadata.promptTokenCount || 0;
            currentOutputTokens = data.usageMetadata.candidatesTokenCount || 0;
            totalInputTokens += currentInputTokens;
            totalOutputTokens += currentOutputTokens;
            calculateCost();
            renderStats();
            saveStats();
        }

        let responseText = '';
        let thoughtSignature = null;

        if (data.candidates?.[0]?.content?.parts?.[0]) {
            responseText = data.candidates[0].content.parts[0].text || '';
            if (saveThoughtSignature) {
                thoughtSignature = data.candidates[0].content.parts[0].thoughtSignature;
            }
        }

        responseText = responseText.trim();
        // Remove leading "Role Name:" if the model added it
        if (responseText.startsWith(targetRole + ':')) {
            responseText = responseText.substring(targetRole.length + 1).trim();
        }

        if (responseText) {
            const newEntry = { speaker: targetRole, text: responseText };
            if (thoughtSignature) newEntry.thoughtSignature = thoughtSignature;
            chatHistory.push(newEntry);
            
            renderChatHistory();
            saveChatHistory();

            setTimeout(() => {
                chatHistoryBox.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        }

        errorMessageDiv.textContent = '';

    } catch (e) {
        if (e.name !== 'AbortError') {
            errorMessageDiv.textContent = `Error: ${e.message}`;
            console.error(e);
        } else {
            errorMessageDiv.textContent = 'Cancelled.';
        }
    } finally {
        toggleInputs(true);
        stopMessageButton.disabled = true;
        stopMessageButton.classList.add('hidden');
        abortController = null;
        setTimeout(() => { if (errorMessageDiv.textContent === 'Cancelled.') errorMessageDiv.textContent = ''; }, 3000);
    }
}

function toggleInputs(enable) {
    messageInput.disabled = !enable; // Added: disable user message input
    sendUserMessageButton.disabled = !enable;
    narratorMessageInput.disabled = !enable; // New
    sendNarratorMessageButton.disabled = !enable; // New
    const botButtons = document.querySelectorAll('.bot-action-button');
    botButtons.forEach(b => b.disabled = !enable);
    if (chatHistoryBox) chatHistoryBox.disabled = !enable;
    removeLastEntryButton.disabled = !enable;
    regenerateLastLineButton.disabled = !enable;
}

// --- Utils & Stats ---

function calculateCost() {
    const prices = MODEL_PRICES[selectedModel];
    if (prices) {
        const { inputRate, outputRate } = prices.getPricing(currentInputTokens);
        currentRequestCost = (currentInputTokens * inputRate) + (currentOutputTokens * outputRate);
        totalCost += currentRequestCost;
    }
}

function renderStats() {
    tokenStatsDiv.innerHTML = `
        <div><strong>Input:</strong> Now: ${currentInputTokens} | Total: ${totalInputTokens}</div>
        <div><strong>Output:</strong> Now: ${currentOutputTokens} | Total: ${totalOutputTokens}</div>
    `;
    costStatsDiv.innerHTML = `
        <div><strong>Last Cost:</strong> $${currentRequestCost.toFixed(5)}</div>
        <div><strong>Total Cost:</strong> $${totalCost.toFixed(5)}</div>
    `;
}

function saveStats() {
    setLocalStorageItem('totalInputTokens', totalInputTokens);
    setLocalStorageItem('totalOutputTokens', totalOutputTokens);
    setLocalStorageItem('totalCost', totalCost);
}

function loadStats() {
    totalInputTokens = parseInt(getLocalStorageItem('totalInputTokens')) || 0;
    totalOutputTokens = parseInt(getLocalStorageItem('totalOutputTokens')) || 0;
    totalCost = parseFloat(getLocalStorageItem('totalCost')) || 0;
    renderStats();
}

function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    if (messageInput.scrollHeight > 150) {
        messageInput.style.height = '150px';
        messageInput.style.overflowY = 'auto';
    } else {
        messageInput.style.overflowY = 'hidden';
    }
}

function adjustNarratorTextareaHeight() {
    narratorMessageInput.style.height = 'auto';
    narratorMessageInput.style.height = (narratorMessageInput.scrollHeight) + 'px';
    if (narratorMessageInput.scrollHeight > 150) {
        narratorMessageInput.style.height = '150px';
        narratorMessageInput.style.overflowY = 'auto';
    } else {
        narratorMessageInput.style.overflowY = 'hidden';
    }
}

// --- File I/O ---

function downloadChat() {
    syncChatHistoryFromUI();
    const data = { systemInstruction, roles: botRoles, chatHistory, userName }; // Include userName in save
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat_history_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
}

function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = JSON.parse(evt.target.result);
            if (typeof data.systemInstruction === 'string') {
                systemInstruction = data.systemInstruction;
                systemInstructionInput.value = systemInstruction;
            }
            if (Array.isArray(data.roles)) {
                botRoles = data.roles;
            }
            if (Array.isArray(data.chatHistory)) {
                chatHistory = data.chatHistory;
            }
            if (typeof data.userName === 'string') { // Load userName
                userName = data.userName;
                userNameInput.value = userName;
                updateUserMessagePlaceholder();
            }
            
            // Fix: Render UI first so that the UI state matches the loaded data.
            // saveChatHistory calls syncChatHistoryFromUI, which reads from the UI.
            // If we save before rendering, we overwrite the loaded data with the old UI state.
            renderRolesList();
            renderBotResponseButtons();
            renderChatHistory();

            saveRolesToLocalStorage();
            saveChatHistory();
            setUserName(); // Call setUserName to ensure new userName is saved and reflected
        } catch (err) {
            errorMessageDiv.textContent = 'Error loading file: ' + err.message;
            setTimeout(() => errorMessageDiv.textContent = '', 3000);
        }
        loadChatFileInput.value = '';
    };
    reader.readAsText(file);
}

function cleanThinkingSignature() {
    syncChatHistoryFromUI(); // Sync first to make sure we're working on current text
    let count = 0;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].thoughtSignature) {
            delete chatHistory[i].thoughtSignature;
            count++;
            break; 
        }
    }
    if (count > 0) {
        saveChatHistory(); // This will re-render, but text looks same, just internal obj changed
        errorMessageDiv.textContent = 'Removed last thinking signature.';
    } else {
        errorMessageDiv.textContent = 'No thinking signature found.';
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

function cleanupAllThoughtSignatures() {
    syncChatHistoryFromUI();
    let count = 0;
    chatHistory.forEach(msg => {
        if (msg.thoughtSignature) {
            delete msg.thoughtSignature;
            count++;
        }
    });
    saveChatHistory();
    errorMessageDiv.textContent = `Removed ${count} signatures.`;
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

function toggleApiDebug() {
    apiDebugContent.classList.toggle('hidden');
    if (!apiDebugContent.classList.contains('hidden')) {
        apiRequestBody.textContent = lastRawRequestBody || 'None';
        apiResponseBody.textContent = lastRawResponseData || 'None';
    }
}

// --- Event Listeners ---
setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', updateSelectedModel);
thinkingBudgetInput.addEventListener('input', () => {
    thinkingBudget = parseInt(thinkingBudgetInput.value, 10) || -1;
    setLocalStorageItem('thinkingBudget', thinkingBudget);
});
thinkingLevelSelect.addEventListener('change', () => {
    thinkingLevel = thinkingLevelSelect.value;
    setLocalStorageItem('thinkingLevel', thinkingLevel);
});
saveThoughtSignatureCheckbox.addEventListener('change', () => {
    saveThoughtSignature = saveThoughtSignatureCheckbox.checked;
    setLocalStorageItem('saveThoughtSignature', saveThoughtSignature);
});

addRoleButton.addEventListener('click', addRole);
sendUserMessageButton.addEventListener('click', addUserMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addUserMessage(); }
});
messageInput.addEventListener('input', adjustTextareaHeight);

sendNarratorMessageButton.addEventListener('click', addNarratorMessage);
narratorMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNarratorMessage(); }
});
narratorMessageInput.addEventListener('input', adjustNarratorTextareaHeight);

stopMessageButton.addEventListener('click', () => abortController?.abort());

systemInstructionInput.addEventListener('input', () => {
    systemInstruction = systemInstructionInput.value;
    setLocalStorageItem('systemInstruction', systemInstruction);
});
clearSystemInstructionButton.addEventListener('click', () => {
    systemInstruction = '';
    systemInstructionInput.value = '';
    setLocalStorageItem('systemInstruction', '');
});

saveChatButton.addEventListener('click', downloadChat);
loadChatButton.addEventListener('click', () => loadChatFileInput.click());
loadChatFileInput.addEventListener('change', handleFileLoad);

removeLastEntryButton.addEventListener('click', removeLastEntry);
regenerateLastLineButton.addEventListener('click', regenerateLastLine);
clearAllHistoryButton.addEventListener('click', clearAllHistory);
cleanThinkingSignatureButton.addEventListener('click', cleanThinkingSignature);
cleanupAllThoughtSignaturesButton.addEventListener('click', cleanupAllThoughtSignatures);

showApiDebugButton.addEventListener('click', toggleApiDebug);

increaseFontSizeButton.addEventListener('click', increaseFontSize);
decreaseFontSizeButton.addEventListener('click', decreaseFontSize);
resetFontSizeButton.addEventListener('click', resetFontSize);

// Event listener for User Name input
userNameInput.addEventListener('input', setUserName);

// Auto-save on manual edit of the chat box
chatHistoryBox.addEventListener('blur', saveChatHistory);
chatHistoryBox.addEventListener('input', adjustChatHistoryHeight);

// --- Boot ---
window.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    loadUserName(); // Load user name first
    loadRolesFromLocalStorage();
    loadChatHistory(); // This also renders chat
    loadSelectedModel();
    loadThinkingConfig();
    loadStats();
    loadChatFontSize();
    adjustChatHistoryHeight();
    adjustTextareaHeight(); // Adjust for user message input on load
    adjustNarratorTextareaHeight(); // Adjust for narrator message input on load
    updateUserMessagePlaceholder(); // Ensure placeholder is correct on load
});