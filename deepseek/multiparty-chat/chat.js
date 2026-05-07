// chat.js - DeepSeek version

let chatHistory = []; // Array of { speaker: string, text: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name
let currentApiKey = '';
let selectedModel = 'deepseek-chat';
let systemInstruction = 'Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character. NEVER try to "wrap up" the roleplay. This is a never-ending roleplay. Multi-line messages are not allowed - each individual message must be a single paragraph. Avoid unnecessary and unoriginal repetition of previous messages. Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative. Use the same language as input or previous diaglog. Do not include the thought in repsonse text.'; 

let totalInputTokens = 0;
let totalOutputTokens = 0;
let currentInputTokens = 0;
let currentOutputTokens = 0;

const STORAGE_PREFIX = 'ds_mpc_'; 

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
const deepseekApiKeyInput = document.getElementById('deepseekApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const deepseekModelSelect = document.getElementById('deepseekModel');
const chatHistoryBox = document.getElementById('chatHistoryBox'); 
const messageInput = document.getElementById('messageInput');
const sendUserMessageButton = document.getElementById('sendUserMessageButton');
const narratorMessageInput = document.getElementById('narratorMessageInput');
const sendNarratorMessageButton = document.getElementById('sendNarratorMessageButton');

const stopMessageButton = document.getElementById('stopMessageButton');
const errorMessageDiv = document.getElementById('errorMessage');
const tokenStatsDiv = document.getElementById('tokenStats');
const costStatsDiv = document.getElementById('costStats');

const systemInstructionInput = document.getElementById('systemInstructionInput');
const clearSystemInstructionButton = document.getElementById('clearSystemInstructionButton');

const saveChatButton = document.getElementById('saveChatButton');
const loadChatButton = document.getElementById('loadChatButton');
const loadChatFileInput = document.getElementById('loadChatFileInput');

const removeLastEntryButton = document.getElementById('removeLastEntryButton');
const regenerateLastLineButton = document.getElementById('regenerateLastLineButton');
const clearAllHistoryButton = document.getElementById('clearAllHistoryButton');

const showApiDebugButton = document.getElementById('showApiDebugButton');
const apiDebugContent = document.getElementById('apiDebugContent');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');

const increaseFontSizeButton = document.getElementById('increaseFontSizeButton');
const decreaseFontSizeButton = document.getElementById('decreaseFontSizeButton');
const resetFontSizeButton = document.getElementById('resetFontSizeButton');

const newRoleNameInput = document.getElementById('newRoleNameInput');
const addRoleButton = document.getElementById('addRoleButton');
const activeRolesList = document.getElementById('activeRolesList');
const responseGenerationButtonsContainer = document.getElementById('responseGenerationButtonsContainer'); 

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
    const apiKey = deepseekApiKeyInput.value.trim();
    if (!apiKey) {
        errorMessageDiv.textContent = 'Please enter your DeepSeek API Key.';
        return false;
    }
    currentApiKey = apiKey;
    setLocalStorageItem('deepseekApiKey', apiKey);
    errorMessageDiv.textContent = 'API Key set!';
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
    return true;
}

function loadApiKey() {
    const apiKey = getLocalStorageItem('deepseekApiKey');
    if (apiKey) {
        deepseekApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
    }
}

function updateSelectedModel() {
    selectedModel = deepseekModelSelect.value;
    setLocalStorageItem('selectedModel', selectedModel);
}

function loadSelectedModel() {
    const stored = getLocalStorageItem('selectedModel');
    if (stored) {
        selectedModel = stored;
        deepseekModelSelect.value = stored;
    }
}

// --- User Name Management ---
function loadUserName() {
    const storedName = getLocalStorageItem('userName');
    if (storedName !== null) { 
        userName = storedName; 
        userNameInput.value = storedName;
    } else {
        userName = 'User'; 
        userNameInput.value = userName;
    }
    updateUserMessagePlaceholder();
}

function setUserName() {
    const newName = userNameInput.value.trim();
    userName = newName; 
    setLocalStorageItem('userName', userName);
    updateUserMessagePlaceholder(); 
    renderBotResponseButtons(); 
}

function updateUserMessagePlaceholder() {
    const displayUserName = userName || 'User'; 
    messageInput.placeholder = `Type a message for ${displayUserName}...`;
}

// --- Font Size ---
function updateChatFontSize() {
    document.documentElement.style.setProperty('--chat-font-size', `${chatFontSize}em`);
    setLocalStorageItem('chatFontSize', chatFontSize.toString());
    adjustChatHistoryHeight(); 
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
    if (botRoles.includes(name) || name === userName || name === 'Narrator' || name === 'System') { 
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

    const userBtn = document.createElement('button');
    userBtn.textContent = `${userName || 'User'}`;
    userBtn.className = 'bot-action-button';
    userBtn.onclick = () => generateResponseForRole(userName);
    responseGenerationButtonsContainer.appendChild(userBtn);

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

function syncChatHistoryFromUI() {
    const text = chatHistoryBox.value;
    const lines = text.split('\n');
    const newHistory = [];
    
    let currentSpeaker = null;
    let buffer = [];

    const flush = () => {
        if (currentSpeaker) {
            const entryText = buffer.join('\n').trim();
            newHistory.push({ speaker: currentSpeaker, text: entryText });
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
    syncChatHistoryFromUI(); 
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

// --- API Interaction ---

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
        let historyStr = "";
        chatHistory.forEach(entry => {
            historyStr += `${entry.speaker}: ${entry.text}\n\n`;
        });
        
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        
        messages.push({ 
            role: 'user', 
            content: `Current chat history:\n\n${historyStr}\n\nPlease write the next message as ${targetRole}. Return only the message text, starting immediately with the content of the message.` 
        });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048,
            stop: [`\n${userName}:`, `\nNarrator:`, `\nSystem:`].concat(botRoles.filter(r => r !== targetRole).map(r => `\n${r}:`))
        };

        lastRawRequestBody = JSON.stringify(requestBody, null, 2);

        const API_ENDPOINT = `https://api.deepseek.com/chat/completions`;

        currentInputTokens = 0; currentOutputTokens = 0; currentRequestCost = 0;

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${currentApiKey}` 
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

        if (data.usage) {
            currentInputTokens = data.usage.prompt_tokens || 0;
            currentOutputTokens = data.usage.completion_tokens || 0;
            totalInputTokens += currentInputTokens;
            totalOutputTokens += currentOutputTokens;
            calculateCost();
            renderStats();
            saveStats();
        }

        let responseText = '';
        if (data.choices?.[0]?.message?.content) {
            responseText = data.choices[0].message.content.trim();
        }

        if (responseText.startsWith(targetRole + ':')) {
            responseText = responseText.substring(targetRole.length + 1).trim();
        }

        if (responseText) {
            chatHistory.push({ speaker: targetRole, text: responseText });
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
    const modelConfig = DEEPSEEK_PRICING_CONFIG.TEXT[selectedModel];
    if (modelConfig) {
        const { inputRate, outputRate } = modelConfig.getPricing(currentInputTokens);
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
}

function adjustNarratorTextareaHeight() {
    narratorMessageInput.style.height = 'auto';
    narratorMessageInput.style.height = (narratorMessageInput.scrollHeight) + 'px';
}

// --- File I/O ---

function downloadChat() {
    syncChatHistoryFromUI();
    const data = { systemInstruction, roles: botRoles, chatHistory, userName }; 
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deepseek_chat_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
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
            if (Array.isArray(data.roles)) botRoles = data.roles;
            if (Array.isArray(data.chatHistory)) chatHistory = data.chatHistory;
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
deepseekModelSelect.addEventListener('change', updateSelectedModel);

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

showApiDebugButton.addEventListener('click', toggleApiDebug);

increaseFontSizeButton.addEventListener('click', increaseFontSize);
decreaseFontSizeButton.addEventListener('click', decreaseFontSize);
resetFontSizeButton.addEventListener('click', resetFontSize);

userNameInput.addEventListener('input', setUserName);

chatHistoryBox.addEventListener('blur', saveChatHistory);
chatHistoryBox.addEventListener('input', adjustChatHistoryHeight);

// --- Boot ---
window.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    loadUserName(); 
    loadRolesFromLocalStorage();
    loadChatHistory(); 
    loadSelectedModel();
    loadStats();
    loadChatFontSize();
    adjustChatHistoryHeight();
    adjustTextareaHeight(); 
    adjustNarratorTextareaHeight(); 
    adjustSystemInstructionHeight(); 
    updateUserMessagePlaceholder(); 
});
