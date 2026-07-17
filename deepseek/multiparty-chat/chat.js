// chat.js - DeepSeek version

let chatHistory = []; // Array of { speaker: string, text: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name
let currentApiKey = '';
let selectedModel = 'deepseek-chat';

const defaultSystemInstructionNoReactions = '你的任务是编写此聊天/角色扮演中的消息。使用 *星号* 表示动作，使用 (括号) 表示角色的内心想法。永远不要尝试“结束”角色扮演。这是一个永无止境的角色扮演。不允许发送多行消息 - 每条独立消息必须是一个段落。避免不必要且无新意的重复。编写下一条消息 - 记住要让它们有趣、真实、具描述性、自然、吸引人且富有创意。使用与输入或之前对话相同的语言。不要在回复文本中包含想法。'; 

const defaultSystemInstructionWithReactions = `你的任务是编写此聊天/角色扮演中的消息。使用 *星号* 表示动作。
永远不要尝试“结束”角色扮演。这是一个永无止境的角色扮演。
不允许发送多行消息 - 每条独立消息必须是一个段落。
避免不必要且无新意的重复。
编写下一条消息 - 记住要让它们有趣、真实、具描述性、自然、吸引人且富有创意。
使用与输入或之前对话相同的语言。
你还必须确定该角色的内心真实想法以及当前对玩家（用户）的看法。
重要：你必须严格返回合法的 JSON 对象结构，字段严格如下：
{
  "MESSAGE": "[该角色说出的聊天回复消息]",
  "CHARACTER_REACTION": {
    "name": "[角色名字]",
    "internal_thought": "[该角色对其刚才对话的内心真实想法或秘密反应]",
    "view_of_the_player": "[该角色当前对玩家（用户）的看法、态度或认知]"
  }
}`;

let systemInstruction = defaultSystemInstructionNoReactions;
let lastCharacterReaction = null; // { name: string, internal_thought: string, view_of_the_player: string }

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

// Character Reaction elements
const useReactionsCheckbox = document.getElementById('useReactionsCheckbox');
const characterReactionContainer = document.getElementById('characterReactionContainer');

const targetWordCountInput = document.getElementById('targetWordCount');

const systemInstructionInput = document.getElementById('systemInstructionInput');
const resetSystemInstructionButton = document.getElementById('resetSystemInstructionButton');
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

// --- Config & Init ---
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
    const apiKey = getLocalStorageItem('deepseekApiKey') || localStorage.getItem('deepseekApiKey');
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
    const displayUserName = userName || '用户'; 
    messageInput.placeholder = `输入 ${displayUserName} 的消息...`;
    sendUserMessageButton.textContent = `作为 ${displayUserName} 添加`;
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
    if (botRoles.includes(name) || name === userName || name === '旁白' || name === 'System') { 
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

// --- UI Adjustments ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
    messageInput.style.overflowY = 'hidden';
}

function adjustChatHistoryHeight() {
    if (!chatHistoryBox) return;
    chatHistoryBox.style.height = 'auto';
    chatHistoryBox.style.height = (chatHistoryBox.scrollHeight + 10) + 'px';
}

function adjustSystemInstructionHeight() {
    systemInstructionInput.style.height = 'auto';
    systemInstructionInput.style.height = (systemInstructionInput.scrollHeight) + 'px';
}

function adjustNarratorTextareaHeight() {
    narratorMessageInput.style.height = 'auto';
    narratorMessageInput.style.height = (narratorMessageInput.scrollHeight) + 'px';
    narratorMessageInput.style.overflowY = 'hidden';
}

// --- History Parsing & LocalStorage Sync ---
function syncChatHistoryFromUI() {
    if (!chatHistoryBox) return;
    const rawText = chatHistoryBox.value;
    const lines = rawText.split('\n\n').map(line => line.trim()).filter(line => line !== '');
    
    const newHistory = [];
    const roleRegex = /^([^:]+):([\s\S]*)$/;
    
    let currentSpeaker = null;
    let buffer = [];
    
    const flush = () => {
        if (currentSpeaker && buffer.length > 0) {
            newHistory.push({ speaker: currentSpeaker, text: buffer.join('\n\n').trim() });
        }
        buffer = [];
        currentSpeaker = null;
    };
    
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
    if (useReactionsCheckbox.checked) {
        setLocalStorageItem('systemInstruction', systemInstruction);
    } else {
        setLocalStorageItem('systemInstructionNoReactions', systemInstruction);
    }
}

function loadChatHistory() {
    const h = getLocalStorageItem('chatHistory');
    
    const useReactions = getLocalStorageItem('useReactions') === 'true';
    useReactionsCheckbox.checked = useReactions;
    
    if (useReactions) {
        systemInstruction = getLocalStorageItem('systemInstruction') || defaultSystemInstructionWithReactions;
        characterReactionContainer.classList.remove('hidden');
    } else {
        systemInstruction = getLocalStorageItem('systemInstructionNoReactions') || defaultSystemInstructionNoReactions;
        characterReactionContainer.classList.add('hidden');
    }
    systemInstructionInput.value = systemInstruction;

    const lastReactionStr = getLocalStorageItem('lastCharacterReaction');
    if (lastReactionStr) {
        try {
            lastCharacterReaction = JSON.parse(lastReactionStr);
        } catch (e) {
            lastCharacterReaction = null;
        }
    } else {
        lastCharacterReaction = null;
    }
    renderLastCharacterReaction();

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

    chatHistory.push({ speaker: '旁白', text: text });

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
    const generatableRoles = [userName, '旁白', ...botRoles];
    if (generatableRoles.includes(lastEntry.speaker)) {
        chatHistory.pop();
        renderChatHistory();
        saveChatHistory();
        await generateResponseForRole(lastEntry.speaker);
    } else {
        errorMessageDiv.textContent = '无法重新生成：最后一行消息的发言角色不可自动生成。';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }
}

function clearAllHistory() {
    if (confirm('确定要清空所有聊天记录和角色吗？')) {
        chatHistory = [];
        botRoles = []; 
        userName = 'User'; 
        userNameInput.value = userName; 
        setUserName(); 
        updateUserMessagePlaceholder(); 
        
        lastCharacterReaction = null;
        setLocalStorageItem('lastCharacterReaction', '');
        renderLastCharacterReaction();

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

// --- Character Reaction Render Helper ---
function renderLastCharacterReaction() {
    if (!characterReactionContainer) return;
    characterReactionContainer.innerHTML = '';
    
    if (!useReactionsCheckbox.checked || !lastCharacterReaction) {
        characterReactionContainer.classList.add('hidden');
        return;
    }
    
    characterReactionContainer.classList.remove('hidden');
    
    const card = document.createElement('div');
    card.className = 'character-reaction-card';
    
    const name = lastCharacterReaction.name || '角色';
    const thought = lastCharacterReaction.internal_thought || '';
    const view = lastCharacterReaction.view_of_the_player || '';
    
    card.innerHTML = `
        <div class="collapsible-header character-header">
            <div class="char-name-label">上一个发言角色反应: <span class="char-name-display">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
            <span class="toggle-icon">▼</span>
        </div>
        <div class="collapsible-content char-content">
            <div class="char-subitem">
                <label class="sub-label">内心想法:</label>
                <textarea rows="3" class="char-thought-input">${thought}</textarea>
            </div>
            <div class="char-subitem">
                <label class="sub-label">对玩家看法:</label>
                <textarea rows="3" class="char-view-input">${view}</textarea>
            </div>
        </div>
    `;
    
    const header = card.querySelector('.collapsible-header');
    header.addEventListener('click', (e) => {
        if (window.getSelection().toString().trim().length > 0) return;
        const content = header.nextElementSibling;
        if (content && content.classList.contains('collapsible-content')) {
            const isCollapsed = content.classList.toggle('collapsed');
            const icon = header.querySelector('.toggle-icon');
            if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            setLocalStorageItem('reactionCollapsed', isCollapsed);
        }
    });
    
    const isCollapsed = getLocalStorageItem('reactionCollapsed') === 'true';
    if (isCollapsed) {
        card.querySelector('.collapsible-content').classList.add('collapsed');
        card.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
    }
    
    const inputs = card.querySelectorAll('textarea');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const thoughtInput = card.querySelector('.char-thought-input');
            const viewInput = card.querySelector('.char-view-input');
            lastCharacterReaction.internal_thought = thoughtInput.value;
            lastCharacterReaction.view_of_the_player = viewInput.value;
            setLocalStorageItem('lastCharacterReaction', JSON.stringify(lastCharacterReaction));
        });
    });
    
    characterReactionContainer.appendChild(card);
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
    errorMessageDiv.textContent = `正在为 ${targetRole} 生成回复...`;
    stopMessageButton.disabled = false;
    stopMessageButton.classList.remove('hidden');

    abortController = new AbortController();

    const activeReactions = useReactionsCheckbox.checked;

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
        
        if (activeReactions) {
            promptText += `Please write a response from role ${targetRole} and output strictly in valid JSON containing MESSAGE and CHARACTER_REACTION keys.\n\n`;
        } else {
            promptText += `Please write a response from role ${targetRole}\n\n`;
        }

        const targetWordCount = targetWordCountInput ? targetWordCountInput.value.trim() : '';
        if (targetWordCount) {
            promptText += `新回复的目标字数：大约 ${targetWordCount} 字。\n\n`;
        }

        promptText += `${targetRole}:`;

        const stopSequences = [];
        const MAX_STOP_SEQUENCES = 5;

        const allPossibleSpeakers = new Set();
        allPossibleSpeakers.add(userName);
        allPossibleSpeakers.add('旁白');
        allPossibleSpeakers.add('System');
        botRoles.forEach(role => allPossibleSpeakers.add(role));
        
        const sortedSpeakers = Array.from(allPossibleSpeakers).sort((a, b) => {
            if (a === 'System') return -1;
            if (b === 'System') return 1;
            if (a === '旁白') return -1;
            if (b === '旁白') return 1;
            if (a === userName && b !== 'System' && b !== '旁白') return -1;
            if (b === userName && a !== 'System' && a !== '旁白') return 1;
            return a.localeCompare(b);
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
        
        const messages = [];
        messages.push({ role: 'user', content: promptText });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.7,
            stop: stopSequences
        };

        if (activeReactions && selectedModel !== 'deepseek-reasoner') {
            requestBody.response_format = { type: "json_object" };
        }

        lastRawRequestBody = JSON.stringify(requestBody, null, 2);

        const API_ENDPOINT = 'https://api.deepseek.com/chat/completions';

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

        let responseText = data.choices?.[0]?.message?.content || '';
        responseText = responseText.trim();

        let generatedMessage = '';
        if (activeReactions) {
            let msgPart = '';
            let reactionPart = null;
            try {
                const parsedJson = JSON.parse(responseText.replace(/^```json\s*|```$/g, ''));
                msgPart = (parsedJson.MESSAGE || parsedJson.message || '').trim();
                const rawReaction = parsedJson.CHARACTER_REACTION || parsedJson.character_reaction || parsedJson.reaction;
                if (rawReaction && typeof rawReaction === 'object') {
                    reactionPart = rawReaction;
                }
            } catch (jsonError) {
                console.warn('Failed to parse JSON response, falling back to regex:', jsonError);
                const msgMatch = responseText.match(/"MESSAGE"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
                if (msgMatch) msgPart = msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                else msgPart = responseText.trim();
            }

            generatedMessage = msgPart;
            
            if (reactionPart) {
                lastCharacterReaction = {
                    name: targetRole,
                    internal_thought: reactionPart.internal_thought || reactionPart.internalThought || '',
                    view_of_the_player: reactionPart.view_of_the_player || reactionPart.viewOfThePlayer || ''
                };
            } else {
                lastCharacterReaction = {
                    name: targetRole,
                    internal_thought: '',
                    view_of_the_player: ''
                };
            }
            setLocalStorageItem('lastCharacterReaction', JSON.stringify(lastCharacterReaction));
            renderLastCharacterReaction();
        } else {
            generatedMessage = responseText;
            lastCharacterReaction = null;
            setLocalStorageItem('lastCharacterReaction', '');
            renderLastCharacterReaction();
        }

        // Remove leading "Role Name:" if the model added it
        if (generatedMessage.startsWith(targetRole + ':')) {
            generatedMessage = generatedMessage.substring(targetRole.length + 1).trim();
        }

        if (generatedMessage) {
            chatHistory.push({ speaker: targetRole, text: generatedMessage });
            renderChatHistory();
            saveChatHistory();
        }

        errorMessageDiv.textContent = '';

    } catch (e) {
        if (e.name !== 'AbortError') {
            errorMessageDiv.textContent = `Error: ${e.message}`;
            console.error(e);
        } else {
            errorMessageDiv.textContent = '已取消';
        }
    } finally {
        toggleInputs(true);
        stopMessageButton.disabled = true;
        stopMessageButton.classList.add('hidden');
        abortController = null;
        setTimeout(() => { if (errorMessageDiv.textContent === '已取消') errorMessageDiv.textContent = ''; }, 3000);
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

// --- Stats & Costs ---
function calculateCost() {
    const prices = DEEPSEEK_PRICING_CONFIG.TEXT[selectedModel];
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
    const i = getLocalStorageItem('totalInputTokens');
    if (i !== null) totalInputTokens = parseInt(i, 10);
    const o = getLocalStorageItem('totalOutputTokens');
    if (o !== null) totalOutputTokens = parseInt(o, 10);
    const c = getLocalStorageItem('totalCost');
    if (c !== null) totalCost = parseFloat(c);
    renderStats();
}

// --- File I/O ---
function downloadChat() {
    syncChatHistoryFromUI();
    const data = { 
        systemInstruction, 
        systemInstructionNoReactions: getLocalStorageItem('systemInstructionNoReactions') || defaultSystemInstructionNoReactions,
        useReactions: useReactionsCheckbox.checked,
        lastCharacterReaction,
        targetWordCount: targetWordCountInput.value.trim(),
        roles: botRoles, 
        chatHistory, 
        userName 
    };
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
            if (typeof data.useReactions === 'boolean') {
                useReactionsCheckbox.checked = data.useReactions;
                setLocalStorageItem('useReactions', data.useReactions);
            }
            if (typeof data.systemInstructionNoReactions === 'string') {
                setLocalStorageItem('systemInstructionNoReactions', data.systemInstructionNoReactions);
            }
            if (typeof data.targetWordCount === 'string') {
                targetWordCountInput.value = data.targetWordCount;
                setLocalStorageItem('targetWordCount', data.targetWordCount);
            }
            if (data.lastCharacterReaction !== undefined) {
                lastCharacterReaction = data.lastCharacterReaction;
                if (lastCharacterReaction) {
                    setLocalStorageItem('lastCharacterReaction', JSON.stringify(lastCharacterReaction));
                } else {
                    setLocalStorageItem('lastCharacterReaction', '');
                }
            }
            renderLastCharacterReaction();

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
            errorMessageDiv.textContent = '加载文件失败: ' + err.message;
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

// --- Event Listeners ---
useReactionsCheckbox.addEventListener('change', () => {
    const active = useReactionsCheckbox.checked;
    setLocalStorageItem('useReactions', active);
    if (active) {
        setLocalStorageItem('systemInstructionNoReactions', systemInstructionInput.value);
        systemInstruction = getLocalStorageItem('systemInstruction') || defaultSystemInstructionWithReactions;
        systemInstructionInput.value = systemInstruction;
        characterReactionContainer.classList.remove('hidden');
        renderLastCharacterReaction();
    } else {
        setLocalStorageItem('systemInstruction', systemInstructionInput.value);
        systemInstruction = getLocalStorageItem('systemInstructionNoReactions') || defaultSystemInstructionNoReactions;
        systemInstructionInput.value = systemInstruction;
        characterReactionContainer.classList.add('hidden');
    }
    adjustSystemInstructionHeight();
});

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
    if (useReactionsCheckbox.checked) {
        setLocalStorageItem('systemInstruction', systemInstruction);
    } else {
        setLocalStorageItem('systemInstructionNoReactions', systemInstruction);
    }
    adjustSystemInstructionHeight();
});

resetSystemInstructionButton.addEventListener('click', () => {
    if (confirm('确定要重置系统指令为默认值吗？')) {
        if (useReactionsCheckbox.checked) {
            systemInstruction = defaultSystemInstructionWithReactions;
            setLocalStorageItem('systemInstruction', defaultSystemInstructionWithReactions);
        } else {
            systemInstruction = defaultSystemInstructionNoReactions;
            setLocalStorageItem('systemInstructionNoReactions', defaultSystemInstructionNoReactions);
        }
        systemInstructionInput.value = systemInstruction;
        adjustSystemInstructionHeight();
    }
});

clearSystemInstructionButton.addEventListener('click', () => {
    systemInstruction = '';
    systemInstructionInput.value = '';
    if (useReactionsCheckbox.checked) {
        setLocalStorageItem('systemInstruction', '');
    } else {
        setLocalStorageItem('systemInstructionNoReactions', '');
    }
    adjustSystemInstructionHeight();
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

// Target Word Count config
targetWordCountInput.addEventListener('input', () => {
    const val = targetWordCountInput.value.trim();
    setLocalStorageItem('targetWordCount', val);
});

function loadTargetWordCount() {
    const stored = getLocalStorageItem('targetWordCount');
    if (stored !== null) {
        targetWordCountInput.value = stored;
    } else {
        targetWordCountInput.value = '200';
    }
}

// --- Boot ---
window.addEventListener('DOMContentLoaded', () => {
    loadApiKey();
    loadUserName(); 
    loadRolesFromLocalStorage();
    loadChatHistory(); 
    loadSelectedModel();
    loadTargetWordCount();
    loadStats();
    loadChatFontSize();
    adjustChatHistoryHeight();
    adjustTextareaHeight(); 
    adjustNarratorTextareaHeight(); 
    adjustSystemInstructionHeight(); 
    updateUserMessagePlaceholder(); 
});
