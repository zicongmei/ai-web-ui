// chatbot.js

let chatHistory = []; // Array of { speaker: string, text: string, thoughtSignature?: string, interactionId?: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name
let currentApiKey = '';
let selectedModel = 'gemini-2.0-flash';
let systemInstruction = 'Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character. NEVER try to "wrap up" the roleplay. This is a never-ending roleplay. Multi-line messages are not allowed - each individual message must be a single paragraph. Avoid unnecessary and unoriginal repetition of previous messages. Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative. Use the same language (Chinese , English, etc.) as input or previous diaglog. Do not include the thought in repsonse text.'; 

let totalInputTokens = 0;
let totalOutputTokens = 0;
let currentInputTokens = 0;
let currentOutputTokens = 0;

let thinkingBudget = -1;
let thinkingLevel = 'low';

let saveThoughtSignature = true;

const STORAGE_PREFIX = 'mpc_int_'; // Prefix to separate storage from other pages

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

// Find and Replace DOM Elements
const toggleFindReplace = document.getElementById('toggleFindReplace');
const findReplaceContent = document.getElementById('findReplaceContent');
const findReplaceToggleIcon = document.getElementById('findReplaceToggleIcon');
const findInput = document.getElementById('findInput');
const replaceInput = document.getElementById('replaceInput');
const findMatchCaseCheckbox = document.getElementById('findMatchCaseCheckbox');
const findWholeWordCheckbox = document.getElementById('findWholeWordCheckbox');
const findRegexCheckbox = document.getElementById('findRegexCheckbox');
const findReplaceStatus = document.getElementById('findReplaceStatus');
const findPrevButton = document.getElementById('findPrevButton');
const findNextButton = document.getElementById('findNextButton');
const replaceButton = document.getElementById('replaceButton');
const replaceAllButton = document.getElementById('replaceAllButton');

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
    sendUserMessageButton.textContent = `Add as ${displayUserName}`;
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
    let entryIndex = 0;

    const flush = () => {
        if (currentSpeaker) {
            const entryText = buffer.join('\n').trim();
            const newEntry = { speaker: currentSpeaker, text: entryText };
            
            // Try to preserve interactionId and thoughtSignature from existing history if match at same index
            const existing = chatHistory[entryIndex];
            if (existing && existing.speaker === currentSpeaker && existing.text === entryText) {
                newEntry.interactionId = existing.interactionId;
                newEntry.thoughtSignature = existing.thoughtSignature;
            }
            
            newHistory.push(newEntry);
            entryIndex++;
        }
        buffer = [];
    };

    const roleRegex = /^([^:\n]+):(.*)$/;

    for (const line of lines) {
        const match = line.match(roleRegex);
        if (match) {
            const possibleRole = match[1].trim();
            if (possibleRole.length < 50) { 
                flush();
                currentSpeaker = possibleRole;
                buffer.push(match[2].trimStart());
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
    
    if (document.activeElement) document.activeElement.blur();

    chatHistory.push({ speaker: userName, text: text });
    
    messageInput.value = '';
    adjustTextareaHeight(); 
    
    renderChatHistory(); 
    saveChatHistory();
}

function addNarratorMessage() {
    const text = narratorMessageInput.value.trim();
    if (!text) return;

    if (document.activeElement) document.activeElement.blur();

    chatHistory.push({ speaker: 'Narrator', text: text });

    narratorMessageInput.value = '';
    adjustNarratorTextareaHeight(); 

    renderChatHistory(); 
    saveChatHistory();
}

function renderChatHistory() {
    if (!chatHistoryBox) return;
    
    const scrollY = window.scrollY;

    const text = chatHistory.map(entry => `${entry.speaker}: ${entry.text}`).join('\n\n');
    chatHistoryBox.value = text;

    adjustChatHistoryHeight(); 

    window.scrollTo(0, scrollY);

    if (findInput && findInput.value) {
        updateFindMatchCount();
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
    const generatableRoles = [userName, 'Narrator', ...botRoles];
    if (generatableRoles.includes(lastEntry.speaker)) {
        chatHistory.pop();
        renderChatHistory();
        saveChatHistory();
        await generateResponseForRole(lastEntry.speaker);
    } else {
        errorMessageDiv.textContent = 'Cannot regenerate: Last message is not from a generatable role.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }
}

function clearAllHistory() {
    if (confirm('Clear all chat history and remove all roles?')) {
        chatHistory = [];
        botRoles = []; 
        userName = 'User'; 
        userNameInput.value = userName; 
        setUserName(); 
        updateUserMessagePlaceholder(); 
        
        totalInputTokens = 0; 
        totalOutputTokens = 0; 
        totalCost = 0;
        
        renderChatHistory();
        renderRolesList(); 
        renderBotResponseButtons(); 
        renderStats();
        
        saveChatHistory(); 
        saveRolesToLocalStorage(); 
        saveStats();
    }
}

// --- API Interaction (Interactions API) ---

async function generateResponseForRole(targetRole) {
    if (!currentApiKey) {
        errorMessageDiv.textContent = 'Set API Key first.';
        return;
    }

    if (document.activeElement) document.activeElement.blur();

    syncChatHistoryFromUI();

    toggleInputs(false);
    errorMessageDiv.textContent = `Thinking for ${targetRole}...`;
    stopMessageButton.disabled = false;
    stopMessageButton.classList.remove('hidden');

    abortController = new AbortController();

    try {
        let lastId = null;
        let startIndex = 0;
        
        // Find the last entry with a valid interactionId
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].interactionId) {
                lastId = chatHistory[i].interactionId;
                startIndex = i + 1;
                break;
            }
        }

        let inputSteps = [];
        if (!lastId) {
            // New interaction: Include System Instruction if present
            if (systemInstruction) {
                inputSteps.push({
                    type: 'user_input',
                    content: [{ type: 'text', text: systemInstruction }]
                });
            }
            // Include all history
            for (let i = 0; i < chatHistory.length; i++) {
                inputSteps.push({
                    type: 'user_input',
                    content: [{ type: 'text', text: `${chatHistory[i].speaker}: ${chatHistory[i].text}` }]
                });
            }
        } else {
            // Continue interaction: Only include steps since lastId
            for (let i = startIndex; i < chatHistory.length; i++) {
                inputSteps.push({
                    type: 'user_input',
                    content: [{ type: 'text', text: `${chatHistory[i].speaker}: ${chatHistory[i].text}` }]
                });
            }
        }

        // Add the generation trigger
        inputSteps.push({
            type: 'user_input',
            content: [{ type: 'text', text: `Please write a response from role ${targetRole}\n\n${targetRole}:` }]
        });

        const stopSequences = [];
        const MAX_STOP_SEQUENCES = 5;
        const allPossibleSpeakers = new Set([userName, 'Narrator', 'System', ...botRoles]);
        const sortedSpeakers = Array.from(allPossibleSpeakers).sort((a, b) => {
            if (a === 'System') return -1; if (b === 'System') return 1;
            if (a === 'Narrator') return -1; if (b === 'Narrator') return 1;
            if (a === userName) return -1; if (b === userName) return 1;
            return a.localeCompare(b);
        });

        for (const speaker of sortedSpeakers) {
            if (speaker !== targetRole && stopSequences.length < MAX_STOP_SEQUENCES) {
                stopSequences.push(`\n${speaker}:`);
            }
        }
        
        const requestBody = {
            model: `models/${selectedModel}`,
            store: true,
            previous_interaction_id: lastId || undefined,
            input: inputSteps,
            generation_config: {
                max_output_tokens: 8192,
                stop_sequences: stopSequences,
                ...(selectedModel.startsWith('gemini-3') 
                    ? { thinking_level: thinkingLevel } 
                    : { thinking_budget: thinkingBudget })
            }
        };

        lastRawRequestBody = JSON.stringify(requestBody, null, 2);

        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${currentApiKey}`;

        currentInputTokens = 0; currentOutputTokens = 0; currentRequestCost = 0;

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Api-Revision': '2026-05-20'
            },
            body: lastRawRequestBody,
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        lastRawResponseData = JSON.stringify(data, null, 2);

        const interactionId = data.id;
        let responseText = '';
        let thoughtSignature = null;

        // Interaction API returns steps. 
        // Find the model_output step for text
        const modelStep = data.steps.find(s => s.type === 'model_output');
        if (modelStep && modelStep.content?.[0]) {
            responseText = modelStep.content[0].text || '';
        }

        // Find the thought step for signature
        const thoughtStep = data.steps.find(s => s.type === 'thought');
        if (thoughtStep && saveThoughtSignature) {
            thoughtSignature = thoughtStep.signature;
        }

        // Handle token usage: Interactions API uses 'usage' instead of 'usageMetadata'
        if (data.usage) {
            currentInputTokens = data.usage.total_input_tokens || 0;
            currentOutputTokens = data.usage.total_output_tokens || 0;
            totalInputTokens += currentInputTokens;
            totalOutputTokens += currentOutputTokens;
            calculateCost();
            renderStats();
            saveStats();
        }

        responseText = responseText.trim();
        if (responseText.startsWith(targetRole + ':')) {
            responseText = responseText.substring(targetRole.length + 1).trim();
        }

        if (responseText) {
            const newEntry = { speaker: targetRole, text: responseText, interactionId: interactionId };
            if (thoughtSignature) newEntry.thoughtSignature = thoughtSignature;
            chatHistory.push(newEntry);
            
            renderChatHistory();
            saveChatHistory();
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
    messageInput.disabled = !enable; 
    sendUserMessageButton.disabled = !enable;
    narratorMessageInput.disabled = !enable; 
    sendNarratorMessageButton.disabled = !enable; 
    const botButtons = document.querySelectorAll('.bot-action-button');
    botButtons.forEach(b => b.disabled = !enable);
    if (chatHistoryBox) chatHistoryBox.disabled = !enable;
    removeLastEntryButton.disabled = !enable;
    regenerateLastLineButton.disabled = !enable;
}

// --- Utils & Stats ---

function calculateCost() {
    const prices = GEMINI_PRICING_CONFIG.TEXT[selectedModel];
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
    messageInput.style.overflowY = 'hidden';
}

function adjustNarratorTextareaHeight() {
    narratorMessageInput.style.height = 'auto';
    narratorMessageInput.style.height = (narratorMessageInput.scrollHeight) + 'px';
    narratorMessageInput.style.overflowY = 'hidden';
}

// --- File I/O ---

function downloadChat() {
    syncChatHistoryFromUI();
    const data = { systemInstruction, roles: botRoles, chatHistory, userName }; 
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat_interaction_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
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
            if (typeof data.userName === 'string') { 
                userName = data.userName;
                userNameInput.value = userName;
                updateUserMessagePlaceholder();
            }
            
            renderRolesList();
            renderBotResponseButtons();
            renderChatHistory();

            saveRolesToLocalStorage();
            saveChatHistory();
            setUserName(); 
        } catch (err) {
            errorMessageDiv.textContent = 'Error loading file: ' + err.message;
            setTimeout(() => errorMessageDiv.textContent = '', 3000);
        }
        loadChatFileInput.value = '';
    };
    reader.readAsText(file);
}

function cleanThinkingSignature() {
    syncChatHistoryFromUI(); 
    let count = 0;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].thoughtSignature) {
            delete chatHistory[i].thoughtSignature;
            count++;
            break; 
        }
    }
    if (count > 0) {
        saveChatHistory(); 
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

function adjustSystemInstructionHeight() {
    systemInstructionInput.style.height = 'auto';
    systemInstructionInput.style.height = (systemInstructionInput.scrollHeight) + 'px';
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
    adjustSystemInstructionHeight();
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

// --- Find and Replace in Chat History ---
function setFindReplaceStatus(msg, type = 'info') {
    if (!findReplaceStatus) return;
    findReplaceStatus.textContent = msg;
    findReplaceStatus.className = 'find-replace-status ' + type;
}

function getFindRegex(global = true) {
    if (!findInput) return null;
    const query = findInput.value;
    if (!query) return null;

    const matchCase = findMatchCaseCheckbox ? findMatchCaseCheckbox.checked : false;
    const wholeWord = findWholeWordCheckbox ? findWholeWordCheckbox.checked : false;
    const useRegex = findRegexCheckbox ? findRegexCheckbox.checked : false;

    let flags = matchCase ? '' : 'i';
    if (global) flags += 'g';

    if (useRegex) {
        try {
            return new RegExp(query, flags);
        } catch (e) {
            setFindReplaceStatus('Invalid Regex: ' + e.message, 'error');
            return null;
        }
    } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
        try {
            return new RegExp(pattern, flags);
        } catch (e) {
            setFindReplaceStatus('Search pattern error', 'error');
            return null;
        }
    }
}

function getAllMatches(text, regex) {
    if (!text || !regex) return [];
    const matches = [];
    let match;
    const maxSafety = 10000;
    let count = 0;
    while ((match = regex.exec(text)) !== null && count < maxSafety) {
        count++;
        matches.push({ index: match.index, length: match[0].length, text: match[0] });
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
    }
    return matches;
}

function updateFindMatchCount() {
    if (!findInput || !chatHistoryBox) return;
    const query = findInput.value;
    if (!query) {
        setFindReplaceStatus('');
        return;
    }
    const regex = getFindRegex(true);
    if (!regex) return;
    const text = chatHistoryBox.value;
    const matches = getAllMatches(text, regex);
    if (matches.length === 0) {
        setFindReplaceStatus('No matches', 'error');
    } else {
        setFindReplaceStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`, 'info');
    }
}

function scrollToMatch(matchIndex) {
    if (!chatHistoryBox) return;
    const textBefore = chatHistoryBox.value.substring(0, matchIndex);
    const linesBefore = textBefore.split('\n').length;
    const totalLines = Math.max(1, chatHistoryBox.value.split('\n').length);
    
    const boxRect = chatHistoryBox.getBoundingClientRect();
    const boxTop = boxRect.top + window.scrollY;
    const estimatedOffset = (linesBefore / totalLines) * chatHistoryBox.clientHeight;
    const targetScrollY = boxTop + estimatedOffset - (window.innerHeight / 2);
    
    window.scrollTo({
        top: Math.max(0, targetScrollY),
        behavior: 'smooth'
    });
}

function findNext(silent = false) {
    if (!chatHistoryBox || !findInput) return;
    const query = findInput.value;
    if (!query) {
        if (!silent) setFindReplaceStatus('Please enter text to find', 'error');
        return;
    }
    const regex = getFindRegex(true);
    if (!regex) return;

    const text = chatHistoryBox.value;
    const matches = getAllMatches(text, regex);
    if (matches.length === 0) {
        setFindReplaceStatus('No matches found', 'error');
        return;
    }

    const currentSelEnd = chatHistoryBox.selectionEnd || 0;
    let targetIdx = matches.findIndex(m => m.index >= currentSelEnd);
    if (targetIdx === -1) {
        targetIdx = 0;
    }

    const targetMatch = matches[targetIdx];
    chatHistoryBox.focus();
    chatHistoryBox.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
    scrollToMatch(targetMatch.index);
    setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
}

function findPrev() {
    if (!chatHistoryBox || !findInput) return;
    const query = findInput.value;
    if (!query) {
        setFindReplaceStatus('Please enter text to find', 'error');
        return;
    }
    const regex = getFindRegex(true);
    if (!regex) return;

    const text = chatHistoryBox.value;
    const matches = getAllMatches(text, regex);
    if (matches.length === 0) {
        setFindReplaceStatus('No matches found', 'error');
        return;
    }

    const currentSelStart = chatHistoryBox.selectionStart || 0;
    let targetIdx = -1;
    for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].index < currentSelStart) {
            targetIdx = i;
            break;
        }
    }
    if (targetIdx === -1) {
        targetIdx = matches.length - 1;
    }

    const targetMatch = matches[targetIdx];
    chatHistoryBox.focus();
    chatHistoryBox.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
    scrollToMatch(targetMatch.index);
    setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
}

function replaceCurrent() {
    if (!chatHistoryBox || !findInput || !replaceInput) return;
    const query = findInput.value;
    if (!query) {
        setFindReplaceStatus('Please enter text to find', 'error');
        return;
    }
    const regex = getFindRegex(true);
    if (!regex) return;

    const text = chatHistoryBox.value;
    const matches = getAllMatches(text, regex);
    if (matches.length === 0) {
        setFindReplaceStatus('No matches found to replace', 'error');
        return;
    }

    const selStart = chatHistoryBox.selectionStart;
    const selEnd = chatHistoryBox.selectionEnd;
    const isCurrentMatch = matches.some(m => m.index === selStart && (m.index + m.length) === selEnd);

    if (isCurrentMatch) {
        const replaceVal = replaceInput.value;
        const matchedText = text.substring(selStart, selEnd);
        const useRegex = findRegexCheckbox ? findRegexCheckbox.checked : false;
        
        let replacement = replaceVal;
        if (useRegex) {
            const singleRegex = getFindRegex(false);
            if (singleRegex) {
                replacement = matchedText.replace(singleRegex, replaceVal);
            }
        }
        
        const newText = text.substring(0, selStart) + replacement + text.substring(selEnd);
        chatHistoryBox.value = newText;
        
        syncChatHistoryFromUI();
        saveChatHistory();
        adjustChatHistoryHeight();

        chatHistoryBox.setSelectionRange(selStart + replacement.length, selStart + replacement.length);
        findNext(true);
        setFindReplaceStatus('Replaced 1 occurrence', 'success');
    } else {
        findNext();
    }
}

function replaceAll() {
    if (!chatHistoryBox || !findInput || !replaceInput) return;
    const query = findInput.value;
    if (!query) {
        setFindReplaceStatus('Please enter text to find', 'error');
        return;
    }
    const regex = getFindRegex(true);
    if (!regex) return;

    const text = chatHistoryBox.value;
    const matches = getAllMatches(text, regex);
    if (matches.length === 0) {
        setFindReplaceStatus('No matches found to replace', 'error');
        return;
    }

    const replaceVal = replaceInput.value;
    const useRegex = findRegexCheckbox ? findRegexCheckbox.checked : false;
    
    let newText;
    if (useRegex) {
        newText = text.replace(regex, replaceVal);
    } else {
        newText = text.replace(regex, () => replaceVal);
    }

    const count = matches.length;
    chatHistoryBox.value = newText;
    
    syncChatHistoryFromUI();
    saveChatHistory();
    adjustChatHistoryHeight();
    
    setFindReplaceStatus(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`, 'success');
}

function toggleFindReplaceMenu(forceOpen) {
    if (!findReplaceContent) return;
    const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : findReplaceContent.classList.contains('collapsed');
    if (shouldOpen) {
        findReplaceContent.classList.remove('collapsed');
        if (toggleFindReplace) toggleFindReplace.classList.add('expanded');
        if (findReplaceToggleIcon) findReplaceToggleIcon.style.transform = 'rotate(0deg)';
        if (findInput) {
            findInput.focus();
            findInput.select();
        }
        updateFindMatchCount();
    } else {
        findReplaceContent.classList.add('collapsed');
        if (toggleFindReplace) toggleFindReplace.classList.remove('expanded');
        if (findReplaceToggleIcon) findReplaceToggleIcon.style.transform = 'rotate(-90deg)';
    }
}

// Auto-save on manual edit of the chat box
chatHistoryBox.addEventListener('blur', saveChatHistory);
chatHistoryBox.addEventListener('input', () => {
    adjustChatHistoryHeight();
    if (findInput && findInput.value) {
        updateFindMatchCount();
    }
});

// Find and Replace event listeners
if (toggleFindReplace) {
    toggleFindReplace.addEventListener('click', () => toggleFindReplaceMenu());
}
if (findInput) {
    findInput.addEventListener('input', updateFindMatchCount);
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) findPrev();
            else findNext();
        } else if (e.key === 'Escape') {
            toggleFindReplaceMenu(false);
        }
    });
}
if (replaceInput) {
    replaceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) replaceAll();
            else replaceCurrent();
        } else if (e.key === 'Escape') {
            toggleFindReplaceMenu(false);
        }
    });
}
if (findMatchCaseCheckbox) findMatchCaseCheckbox.addEventListener('change', updateFindMatchCount);
if (findWholeWordCheckbox) findWholeWordCheckbox.addEventListener('change', updateFindMatchCount);
if (findRegexCheckbox) findRegexCheckbox.addEventListener('change', updateFindMatchCount);

if (findNextButton) findNextButton.addEventListener('click', () => findNext());
if (findPrevButton) findPrevButton.addEventListener('click', () => findPrev());
if (replaceButton) replaceButton.addEventListener('click', replaceCurrent);
if (replaceAllButton) replaceAllButton.addEventListener('click', replaceAll);

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFindReplaceMenu(true);
    }
});

// --- Boot ---
window.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    loadUserName(); 
    loadRolesFromLocalStorage();
    loadChatHistory(); 
    loadSelectedModel();
    loadThinkingConfig();
    loadStats();
    loadChatFontSize();
    adjustChatHistoryHeight();
    adjustTextareaHeight(); 
    adjustNarratorTextareaHeight(); 
    adjustSystemInstructionHeight(); 
    updateUserMessagePlaceholder(); 
});
