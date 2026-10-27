// chat.js - Local LLM Multi-Party Chat

let chatHistory = []; // Array of { speaker: string, text: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name

const defaultSystemInstructionNoReactions = 'Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character. NEVER try to "wrap up" the roleplay. This is a never-ending roleplay. Multi-line messages are not allowed - each individual message must be a single paragraph. Avoid unnecessary and unoriginal repetition of previous messages. Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative. Use the same language (Chinese, English, etc.) as input or previous dialog. Do not include the thought in response text.';

const defaultSystemInstructionWithReactions = `Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions.
NEVER try to "wrap up" the roleplay. This is a never-ending roleplay.
Multi-line messages are not allowed - the message must be a single paragraph.
Avoid unnecessary and unoriginal repetition of previous messages.
Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative.
Use the same language as input or previous dialog.
If there are other characters present in the scene, determine their structured reactions.
IMPORTANT: You must return your response in a valid JSON structure strictly matching the following format:
{
  "MESSAGE": "[The message spoken by the character]",
  "CHARACTERS_REACTIONS": [
    {
      "name": "[Character Name]",
      "internal_thought": "[Their secret internal thought or reaction to the conversation so far]",
      "view_of_the_player": "[Their current view, attitude, or perception of the user]"
    }
  ]
}`;

let systemInstruction = defaultSystemInstructionNoReactions;
let characterReactionsList = [];

const STORAGE_PREFIX = 'local_llm_mpc_';

let lastRawRequestBody = null;
let lastRawResponseData = null;
let abortController = null;

// Token Usage & Latency Tracking
let currentInputTokens = 0;
let currentCachedTokens = 0;
let currentUncachedTokens = 0;
let currentOutputTokens = 0;
let currentDelaySeconds = '0.00';
let totalInputTokens = 0;
let totalCachedTokens = 0;
let totalUncachedTokens = 0;
let totalOutputTokens = 0;

let chatFontSize = 1.0;
const MIN_FONT_SIZE = 0.4;
const MAX_FONT_SIZE = 4;
const FONT_SIZE_STEP = 0.1;

// DOM Elements
const chatHistoryBox = document.getElementById('chatHistoryBox');
const messageInput = document.getElementById('messageInput');
const sendUserMessageButton = document.getElementById('sendUserMessageButton');
const narratorMessageInput = document.getElementById('narratorMessageInput');
const sendNarratorMessageButton = document.getElementById('sendNarratorMessageButton');

const stopMessageButton = document.getElementById('stopMessageButton');
const errorMessageDiv = document.getElementById('errorMessage');

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
const tokenStatsDiv = document.getElementById('tokenStats');

const increaseFontSizeButton = document.getElementById('increaseFontSizeButton');
const decreaseFontSizeButton = document.getElementById('decreaseFontSizeButton');
const resetFontSizeButton = document.getElementById('resetFontSizeButton');

const newRoleNameInput = document.getElementById('newRoleNameInput');
const addRoleButton = document.getElementById('addRoleButton');
const activeRolesList = document.getElementById('activeRolesList');
const responseGenerationButtonsContainer = document.getElementById('responseGenerationButtonsContainer');

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
    sendUserMessageButton.textContent = `Add as ${displayUserName}`;
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
        span.innerHTML = `${role} <span class="delete-role">&times;</span>`;
        span.querySelector('.delete-role').onclick = () => removeRole(role);
        activeRolesList.appendChild(span);
    });
}

function renderBotResponseButtons() {
    responseGenerationButtonsContainer.innerHTML = '';

    const displayUserName = userName || 'User';
    const userGenBtn = document.createElement('button');
    userGenBtn.className = 'bot-action-button';
    userGenBtn.textContent = displayUserName;
    userGenBtn.onclick = () => generateResponseForRole(userName);
    responseGenerationButtonsContainer.appendChild(userGenBtn);

    const narratorGenBtn = document.createElement('button');
    narratorGenBtn.className = 'bot-action-button';
    narratorGenBtn.textContent = 'Narrator';
    narratorGenBtn.onclick = () => generateResponseForRole('Narrator');
    responseGenerationButtonsContainer.appendChild(narratorGenBtn);

    botRoles.forEach(role => {
        const btn = document.createElement('button');
        btn.className = 'bot-action-button';
        btn.textContent = role;
        btn.onclick = () => generateResponseForRole(role);
        responseGenerationButtonsContainer.appendChild(btn);
    });
}

// --- Chat History & Sync ---
function renderChatHistory() {
    const textContent = chatHistory.map(entry => {
        return entry.speaker ? `${entry.speaker}: ${entry.text}` : `${entry.text}`;
    }).join('\n\n');

    chatHistoryBox.value = textContent;
    adjustChatHistoryHeight();
    if (findInput && findInput.value) {
        updateFindMatchCount();
    }
}

function adjustChatHistoryHeight() {
    const scrollPos = window.scrollY;
    chatHistoryBox.style.height = 'auto';
    chatHistoryBox.style.height = (chatHistoryBox.scrollHeight + 5) + 'px';
    window.scrollTo(0, scrollPos);
}

function syncChatHistoryFromUI() {
    const rawText = chatHistoryBox.value.trim();
    if (!rawText) {
        chatHistory = [];
        return;
    }

    const blocks = rawText.split(/\n\n+/);
    const newHistory = blocks.map(block => {
        const colonIndex = block.indexOf(':');
        if (colonIndex !== -1) {
            const speaker = block.substring(0, colonIndex).trim();
            const text = block.substring(colonIndex + 1).trim();
            return { speaker, text };
        }
        return { speaker: 'System', text: block.trim() };
    });

    chatHistory = newHistory;
}

function saveChatHistory() {
    syncChatHistoryFromUI();
    setLocalStorageItem('chatHistory', JSON.stringify(chatHistory));
}

function loadChatHistory() {
    const stored = getLocalStorageItem('chatHistory');
    if (stored) {
        try {
            chatHistory = JSON.parse(stored);
            if (!Array.isArray(chatHistory)) chatHistory = [];
        } catch (e) { chatHistory = []; }
    }
    renderChatHistory();
}

// --- Adding Messages ---
function addUserMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    syncChatHistoryFromUI();
    chatHistory.push({ speaker: userName, text });
    messageInput.value = '';
    adjustTextareaHeight(messageInput);
    renderChatHistory();
    saveChatHistory();
}

function addNarratorMessage() {
    const text = narratorMessageInput.value.trim();
    if (!text) return;

    syncChatHistoryFromUI();
    chatHistory.push({ speaker: 'Narrator', text });
    narratorMessageInput.value = '';
    adjustTextareaHeight(narratorMessageInput);
    renderChatHistory();
    saveChatHistory();
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

        characterReactionsList = [];
        setLocalStorageItem('characterReactionsList', '[]');
        renderCharactersReactions([]);

        renderChatHistory();
        renderRolesList();
        renderBotResponseButtons();

        currentInputTokens = 0;
        currentCachedTokens = 0;
        currentUncachedTokens = 0;
        currentOutputTokens = 0;
        currentDelaySeconds = '0.00';
        totalInputTokens = 0;
        totalCachedTokens = 0;
        totalUncachedTokens = 0;
        totalOutputTokens = 0;
        renderStats();
        saveStats();

        saveChatHistory();
        saveRolesToLocalStorage();
    }
}

// --- Token Usage Display & Persistence ---
function renderStats() {
    if (!tokenStatsDiv) return;
    const nowBreakdown = (currentCachedTokens > 0 || currentUncachedTokens > 0)
        ? ` (Cached: ${currentCachedTokens}, Non-Cached: ${currentUncachedTokens})`
        : '';
    const totalBreakdown = (totalCachedTokens > 0 || totalUncachedTokens > 0)
        ? ` (Cached: ${totalCachedTokens}, Non-Cached: ${totalUncachedTokens})`
        : '';
    const currentTotal = currentInputTokens + currentOutputTokens;
    const grandTotal = totalInputTokens + totalOutputTokens;
    tokenStatsDiv.innerHTML = `
        <div><strong>Input Tokens:</strong> Now: ${currentInputTokens}${nowBreakdown} | Total: ${totalInputTokens}${totalBreakdown}</div>
        <div><strong>Output Tokens:</strong> Now: ${currentOutputTokens} | Total: ${totalOutputTokens}</div>
        <div><strong>Total Tokens:</strong> Now: ${currentTotal} | Total: ${grandTotal}</div>
        <div><strong>Last API Call Delay:</strong> ${currentDelaySeconds}s</div>
    `;
}

function saveStats() {
    setLocalStorageItem('totalInputTokens', totalInputTokens);
    setLocalStorageItem('totalUncachedTokens', totalUncachedTokens);
    setLocalStorageItem('totalCachedTokens', totalCachedTokens);
    setLocalStorageItem('totalOutputTokens', totalOutputTokens);
}

function loadStats() {
    const i = getLocalStorageItem('totalInputTokens');
    if (i !== null) totalInputTokens = parseInt(i, 10) || 0;
    const cached = getLocalStorageItem('totalCachedTokens');
    if (cached !== null) totalCachedTokens = parseInt(cached, 10) || 0;
    const uncached = getLocalStorageItem('totalUncachedTokens');
    if (uncached !== null) {
        totalUncachedTokens = parseInt(uncached, 10) || 0;
    } else {
        totalUncachedTokens = Math.max(0, totalInputTokens - totalCachedTokens);
    }
    if (totalInputTokens < totalCachedTokens + totalUncachedTokens) {
        totalInputTokens = totalCachedTokens + totalUncachedTokens;
    }
    const o = getLocalStorageItem('totalOutputTokens');
    if (o !== null) totalOutputTokens = parseInt(o, 10) || 0;
    renderStats();
}

// --- Character Reaction Render Helper ---
function getCharactersReactionsFromDOM() {
    if (!characterReactionContainer) return [];
    const cards = characterReactionContainer.querySelectorAll('.character-reaction-card');
    const list = [];
    cards.forEach(card => {
        const nameDisplay = card.querySelector('.char-name-display');
        const thoughtInput = card.querySelector('.char-thought-input');
        const viewInput = card.querySelector('.char-view-input');
        list.push({
            name: nameDisplay ? nameDisplay.textContent.trim() : 'Character',
            internal_thought: thoughtInput ? thoughtInput.value.trim() : '',
            view_of_the_player: viewInput ? viewInput.value.trim() : ''
        });
    });
    return list;
}

function renderCharactersReactions(list) {
    if (!characterReactionContainer) return;
    characterReactionContainer.innerHTML = '';

    if (!useReactionsCheckbox.checked || !list || !Array.isArray(list) || list.length === 0) {
        characterReactionContainer.classList.add('hidden');
        return;
    }

    characterReactionContainer.classList.remove('hidden');

    list.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = 'character-reaction-card';

        const name = char.name || `Character ${idx + 1}`;
        const thought = char.internal_thought || char.internalThought || char.thought || '';
        const view = char.view_of_the_player || char.viewOfThePlayer || char.view || '';

        card.innerHTML = `
            <div class="collapsible-header character-header">
                <div class="char-name-label">Character: <span class="char-name-display">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
                <div style="display: flex; align-items: center;">
                    <button type="button" class="delete-char-btn" style="background: none; border: none; color: #d9534f; cursor: pointer; font-size: 1.1em; padding: 2px 6px; font-weight: bold; margin-right: 8px;" title="Delete Character">✕</button>
                    <span class="toggle-icon">▼</span>
                </div>
            </div>
            <div class="collapsible-content char-content">
                <div class="char-subitem">
                    <label class="sub-label">Internal Thought:</label>
                    <textarea rows="3" class="char-thought-input">${thought}</textarea>
                </div>
                <div class="char-subitem">
                    <label class="sub-label">View of the Player:</label>
                    <textarea rows="3" class="char-view-input">${view}</textarea>
                </div>
            </div>
        `;

        const deleteBtn = card.querySelector('.delete-char-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                card.remove();
                characterReactionsList = getCharactersReactionsFromDOM();
                setLocalStorageItem('characterReactionsList', JSON.stringify(characterReactionsList));
                if (characterReactionsList.length === 0) {
                    characterReactionContainer.classList.add('hidden');
                }
            });
        }

        const header = card.querySelector('.collapsible-header');
        header.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const content = header.nextElementSibling;
            if (content && content.classList.contains('collapsible-content')) {
                const isCollapsed = content.classList.toggle('collapsed');
                const icon = header.querySelector('.toggle-icon');
                if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            }
        });

        const inputs = card.querySelectorAll('textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                characterReactionsList = getCharactersReactionsFromDOM();
                setLocalStorageItem('characterReactionsList', JSON.stringify(characterReactionsList));
            });
        });

        characterReactionContainer.appendChild(card);
    });

    setLocalStorageItem('characterReactionsList', JSON.stringify(getCharactersReactionsFromDOM()));
}

// --- API Interaction with Local Backend (/api/chat) ---
async function generateResponseForRole(targetRole) {
    if (document.activeElement) document.activeElement.blur();

    syncChatHistoryFromUI();

    toggleInputs(false);
    errorMessageDiv.textContent = `Generating response for ${targetRole}...`;
    stopMessageButton.disabled = false;
    stopMessageButton.classList.remove('hidden');

    abortController = new AbortController();
    const activeReactions = useReactionsCheckbox.checked;

    try {
        let promptText = '## Begin of chat history\n\n';
        chatHistory.forEach(entry => {
            promptText += entry.speaker ? `${entry.speaker}: ${entry.text}\n\n` : `${entry.text}\n\n`;
        });
        promptText += '## End of chat history\n\n';

        const targetWordCount = targetWordCountInput ? targetWordCountInput.value.trim() : '';

        if (activeReactions) {
            let msgInstruction = `Please write a response from role ${targetRole} and output strictly in valid JSON containing MESSAGE and CHARACTERS_REACTIONS keys.`;
            if (targetWordCount) {
                msgInstruction += ` Target word count for the MESSAGE field in JSON: around ${targetWordCount} words.`;
            }
            promptText += msgInstruction + '\n\n';
        } else {
            promptText += `Please write a response from role ${targetRole}\n\n`;
            if (targetWordCount) {
                promptText += `Target word count for the response: around ${targetWordCount} words.\n\n`;
            }
        }

        promptText += `${targetRole}:`;

        const stopSequences = [];
        const MAX_STOP_SEQUENCES = 5;

        const allPossibleSpeakers = new Set([userName, 'Narrator', 'System', ...botRoles]);
        const sortedSpeakers = Array.from(allPossibleSpeakers).sort((a, b) => {
            if (a === 'System') return -1;
            if (b === 'System') return 1;
            if (a === 'Narrator') return -1;
            if (b === 'Narrator') return 1;
            if (a === userName) return -1;
            if (b === userName) return 1;
            return a.localeCompare(b);
        });

        for (const speaker of sortedSpeakers) {
            if (speaker && speaker !== targetRole) {
                if (stopSequences.length < MAX_STOP_SEQUENCES) {
                    stopSequences.push(`\n${speaker}:`);
                } else {
                    break;
                }
            }
        }

        const requestBody = {
            system: systemInstruction || '',
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.7,
            max_tokens: 4096,
            stop: stopSequences,
            json_mode: activeReactions
        };

        lastRawRequestBody = JSON.stringify(requestBody, null, 2);

        const requestStartTime = performance.now();
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: lastRawRequestBody,
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || err.error?.message || response.statusText);
        }

        const data = await response.json();
        const elapsedMs = performance.now() - requestStartTime;
        currentDelaySeconds = (elapsedMs / 1000).toFixed(2);
        lastRawResponseData = JSON.stringify(data, null, 2);

        if (data.usage) {
            currentInputTokens = data.usage.prompt_tokens || 0;
            currentCachedTokens = data.usage.cached_tokens || 0;
            currentUncachedTokens = data.usage.uncached_tokens !== undefined
                ? data.usage.uncached_tokens
                : Math.max(0, currentInputTokens - currentCachedTokens);
            currentOutputTokens = data.usage.completion_tokens || 0;

            totalInputTokens += currentInputTokens;
            totalCachedTokens += currentCachedTokens;
            totalUncachedTokens += currentUncachedTokens;
            totalOutputTokens += currentOutputTokens;
        }
        renderStats();
        saveStats();

        let responseText = (data.text || '').trim();
        let generatedMessage = '';

        if (activeReactions) {
            let msgPart = '';
            let rawReactions = null;
            try {
                const parsedJson = JSON.parse(responseText.replace(/^```json\s*|```$/g, ''));
                msgPart = (parsedJson.MESSAGE || parsedJson.message || '').trim();
                rawReactions = parsedJson.CHARACTERS_REACTIONS || parsedJson.characters_reactions || parsedJson.charactersReactions || parsedJson.CHARACTER_REACTION || parsedJson.character_reaction || parsedJson.reaction;
            } catch (jsonError) {
                console.warn('Failed to parse JSON response, falling back to regex:', jsonError);
                const msgMatch = responseText.match(/"MESSAGE"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
                if (msgMatch) msgPart = msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                else msgPart = responseText.trim();
            }

            generatedMessage = msgPart;

            let reactionsList = [];
            if (Array.isArray(rawReactions)) {
                reactionsList = rawReactions;
            } else if (rawReactions && typeof rawReactions === 'object') {
                reactionsList = [rawReactions];
            }

            characterReactionsList = reactionsList.map(r => ({
                name: r.name || targetRole,
                internal_thought: r.internal_thought || r.internalThought || r.thought || '',
                view_of_the_player: r.view_of_the_player || r.viewOfThePlayer || r.view || ''
            }));

            setLocalStorageItem('characterReactionsList', JSON.stringify(characterReactionsList));
            renderCharactersReactions(characterReactionsList);
        } else {
            generatedMessage = responseText;
        }

        if (generatedMessage.startsWith(`${targetRole}:`)) {
            generatedMessage = generatedMessage.substring(`${targetRole}:`.length).trim();
        }

        if (generatedMessage) {
            chatHistory.push({
                speaker: targetRole,
                text: generatedMessage
            });
            renderChatHistory();
            saveChatHistory();
            errorMessageDiv.textContent = '';
        } else {
            errorMessageDiv.textContent = 'Model returned empty response.';
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            errorMessageDiv.textContent = 'Generation stopped.';
        } else {
            errorMessageDiv.textContent = `Error: ${e.message}`;
            console.error(e);
        }
    } finally {
        toggleInputs(true);
        stopMessageButton.disabled = true;
        stopMessageButton.classList.add('hidden');
        abortController = null;
    }
}

function toggleInputs(enabled) {
    sendUserMessageButton.disabled = !enabled;
    sendNarratorMessageButton.disabled = !enabled;
    addRoleButton.disabled = !enabled;
    const botBtns = responseGenerationButtonsContainer.querySelectorAll('button');
    botBtns.forEach(b => b.disabled = !enabled);
    chatHistoryBox.disabled = !enabled;
    userNameInput.disabled = !enabled;
}

// --- File Save/Load ---
function saveToFile() {
    syncChatHistoryFromUI();
    const data = {
        userName,
        botRoles,
        systemInstruction,
        useReactions: useReactionsCheckbox ? useReactionsCheckbox.checked : false,
        characterReactionsList: getCharactersReactionsFromDOM(),
        targetWordCount: targetWordCountInput ? targetWordCountInput.value : '100',
        chatHistory
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `local_multiparty_chat_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function loadFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
                chatHistory = data.chatHistory;
                botRoles = data.botRoles || [];
                systemInstruction = data.systemInstruction !== undefined ? data.systemInstruction : defaultSystemInstructionNoReactions;
                userName = data.userName !== undefined ? data.userName : 'User';

                if (useReactionsCheckbox) {
                    useReactionsCheckbox.checked = !!data.useReactions;
                    setLocalStorageItem('useReactions', useReactionsCheckbox.checked ? 'true' : 'false');
                }

                characterReactionsList = Array.isArray(data.characterReactionsList) ? data.characterReactionsList : [];
                setLocalStorageItem('characterReactionsList', JSON.stringify(characterReactionsList));
                renderCharactersReactions(characterReactionsList);

                if (targetWordCountInput) {
                    const loadedCount = data.targetWordCount !== undefined ? data.targetWordCount : '100';
                    targetWordCountInput.value = loadedCount;
                    setLocalStorageItem('targetWordCount', loadedCount);
                }

                systemInstructionInput.value = systemInstruction;
                userNameInput.value = userName;
                setUserName();
                adjustTextareaHeight(systemInstructionInput);

                saveChatHistory();
                saveRolesToLocalStorage();
                if (useReactionsCheckbox && useReactionsCheckbox.checked) {
                    setLocalStorageItem('sysInstWithReactions', systemInstruction);
                } else {
                    setLocalStorageItem('sysInstNoReactions', systemInstruction);
                }

                renderChatHistory();
                renderRolesList();
                renderBotResponseButtons();
                errorMessageDiv.textContent = 'Loaded successfully!';
                setTimeout(() => errorMessageDiv.textContent = '', 3000);
            }
        } catch (err) {
            errorMessageDiv.textContent = 'Invalid file format.';
        }
    };
    reader.readAsText(file);
}

function adjustTextareaHeight(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

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
        adjustChatHistoryHeight();
        saveChatHistory();

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
    adjustChatHistoryHeight();
    saveChatHistory();

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

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadUserName();
    loadChatFontSize();
    loadRolesFromLocalStorage();
    loadChatHistory();
    loadStats();

    const savedReactionsToggle = getLocalStorageItem('useReactions') === 'true';
    if (useReactionsCheckbox) {
        useReactionsCheckbox.checked = savedReactionsToggle;
    }

    const savedReactionsListStr = getLocalStorageItem('characterReactionsList');
    if (savedReactionsListStr) {
        try {
            characterReactionsList = JSON.parse(savedReactionsListStr);
            if (!Array.isArray(characterReactionsList)) characterReactionsList = [];
        } catch (e) { characterReactionsList = []; }
    }
    renderCharactersReactions(characterReactionsList);

    const savedWordCount = getLocalStorageItem('targetWordCount');
    if (targetWordCountInput) {
        targetWordCountInput.value = savedWordCount !== null ? savedWordCount : '100';
        targetWordCountInput.addEventListener('input', () => {
            setLocalStorageItem('targetWordCount', targetWordCountInput.value);
        });
    }

    if (savedReactionsToggle) {
        systemInstruction = getLocalStorageItem('sysInstWithReactions') || defaultSystemInstructionWithReactions;
    } else {
        systemInstruction = getLocalStorageItem('sysInstNoReactions') || getLocalStorageItem('sysInst') || defaultSystemInstructionNoReactions;
    }
    systemInstructionInput.value = systemInstruction;
    adjustTextareaHeight(systemInstructionInput);

    if (useReactionsCheckbox) {
        useReactionsCheckbox.addEventListener('change', () => {
            const active = useReactionsCheckbox.checked;
            setLocalStorageItem('useReactions', active ? 'true' : 'false');

            if (active) {
                setLocalStorageItem('sysInstNoReactions', systemInstructionInput.value);
                systemInstruction = getLocalStorageItem('sysInstWithReactions') || defaultSystemInstructionWithReactions;
                systemInstructionInput.value = systemInstruction;
                renderCharactersReactions(characterReactionsList);
            } else {
                setLocalStorageItem('sysInstWithReactions', systemInstructionInput.value);
                systemInstruction = getLocalStorageItem('sysInstNoReactions') || defaultSystemInstructionNoReactions;
                systemInstructionInput.value = systemInstruction;
                if (characterReactionContainer) characterReactionContainer.classList.add('hidden');
            }
            adjustTextareaHeight(systemInstructionInput);
        });
    }

    userNameInput.addEventListener('input', setUserName);
    addRoleButton.addEventListener('click', addRole);

    sendUserMessageButton.addEventListener('click', addUserMessage);
    messageInput.addEventListener('input', () => adjustTextareaHeight(messageInput));

    sendNarratorMessageButton.addEventListener('click', addNarratorMessage);
    narratorMessageInput.addEventListener('input', () => adjustTextareaHeight(narratorMessageInput));

    chatHistoryBox.addEventListener('input', () => {
        adjustChatHistoryHeight();
        saveChatHistory();
        if (findInput && findInput.value) {
            updateFindMatchCount();
        }
    });

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

    systemInstructionInput.addEventListener('input', () => {
        systemInstruction = systemInstructionInput.value;
        if (useReactionsCheckbox && useReactionsCheckbox.checked) {
            setLocalStorageItem('sysInstWithReactions', systemInstruction);
        } else {
            setLocalStorageItem('sysInstNoReactions', systemInstruction);
        }
        adjustTextareaHeight(systemInstructionInput);
    });

    if (resetSystemInstructionButton) {
        resetSystemInstructionButton.addEventListener('click', () => {
            if (confirm('Reset System Context to default?')) {
                if (useReactionsCheckbox && useReactionsCheckbox.checked) {
                    systemInstruction = defaultSystemInstructionWithReactions;
                    setLocalStorageItem('sysInstWithReactions', systemInstruction);
                } else {
                    systemInstruction = defaultSystemInstructionNoReactions;
                    setLocalStorageItem('sysInstNoReactions', systemInstruction);
                }
                systemInstructionInput.value = systemInstruction;
                adjustTextareaHeight(systemInstructionInput);
            }
        });
    }

    clearSystemInstructionButton.addEventListener('click', () => {
        systemInstruction = '';
        systemInstructionInput.value = '';
        if (useReactionsCheckbox && useReactionsCheckbox.checked) {
            setLocalStorageItem('sysInstWithReactions', '');
        } else {
            setLocalStorageItem('sysInstNoReactions', '');
        }
        adjustTextareaHeight(systemInstructionInput);
    });

    stopMessageButton.addEventListener('click', () => {
        if (abortController) abortController.abort();
    });

    removeLastEntryButton.addEventListener('click', removeLastEntry);
    regenerateLastLineButton.addEventListener('click', regenerateLastLine);
    clearAllHistoryButton.addEventListener('click', clearAllHistory);

    saveChatButton.addEventListener('click', saveToFile);
    loadChatButton.addEventListener('click', () => loadChatFileInput.click());
    loadChatFileInput.addEventListener('change', loadFromFile);

    increaseFontSizeButton.addEventListener('click', increaseFontSize);
    decreaseFontSizeButton.addEventListener('click', decreaseFontSize);
    resetFontSizeButton.addEventListener('click', resetFontSize);

    showApiDebugButton.addEventListener('click', () => {
        apiDebugContent.classList.toggle('hidden');
        apiRequestBody.textContent = lastRawRequestBody || 'None';
        apiResponseBody.textContent = lastRawResponseData || 'None';
    });
});
