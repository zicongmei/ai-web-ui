// chatbot.js

let chatHistory = []; // Array of { speaker: string, text: string, thoughtSignature?: string }
let botRoles = []; // Array of strings representing role names
let userName = 'User'; // Default user name
let currentApiKey = '';
let selectedModel = 'gemini-2.5-flash-lite';

const defaultSystemInstructionNoReactions = 'Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character. NEVER try to "wrap up" the roleplay. This is a never-ending roleplay. Multi-line messages are not allowed - each individual message must be a single paragraph. Avoid unnecessary and unoriginal repetition of previous messages. Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative. Use the same language (Chinese , English, etc.) as input or previous diaglog. Do not include the thought in repsonse text.'; 

const defaultSystemInstructionWithReactions = `Your task is to write the messages in this chat/roleplay. Use *asterisks* for actions.
NEVER try to "wrap up" the roleplay. This is a never-ending roleplay.
Multi-line messages are not allowed - the message must be a single paragraph.
Avoid unnecessary and unoriginal repetition of previous messages.
Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative.
Use the same language as input or previous dialog.
You must also determine the character's internal thought and current view of the player.
IMPORTANT: You must return your response in a valid JSON structure strictly matching the following format:
{
  "MESSAGE": "[The message spoken by the character]",
  "CHARACTER_REACTION": {
    "name": "[Character Name]",
    "internal_thought": "[Their secret internal thought or reaction to the conversation so far]",
    "view_of_the_player": "[Their current view, attitude, or perception of the user]"
  }
}`;

let systemInstruction = defaultSystemInstructionNoReactions;
let lastCharacterReaction = null; // { name: string, internal_thought: string, view_of_the_player: string }

let totalInputTokens = 0;
let totalOutputTokens = 0;
let currentInputTokens = 0;
let currentOutputTokens = 0;

let thinkingBudget = -1;
let thinkingLevel = 'low';

let saveThoughtSignature = true;

const STORAGE_PREFIX = 'mpc_'; // Prefix to separate storage from other pages

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

// Character Reaction elements
const useReactionsCheckbox = document.getElementById('useReactionsCheckbox');
const characterReactionContainer = document.getElementById('characterReactionContainer');

const systemInstructionInput = document.getElementById('systemInstructionInput');
const resetSystemInstructionButton = document.getElementById('resetSystemInstructionButton');
const clearSystemInstructionButton = document.getElementById('clearSystemInstructionButton');

const saveChatButton = document.getElementById('saveChatButton');
const loadChatButton = document.getElementById('loadChatButton');
const loadChatFileInput = document.getElementById('loadChatFileInput');

const removeLastEntryButton = document.getElementById('removeLastEntryButton');
const regenerateLastLineButton = document.getElementById('regenerateLastLineButton');
const clearAllHistoryButton = document.getElementById('clearAllHistoryButton');
const cleanThinkingSignatureButton = document.getElementById('cleanThinkingSignatureButton');
const cleanupAllThoughtSignaturesButton = document.getElementById('cleanupAllThoughtSignaturesButton');

const showApiDebugButton = document.getElementById('showApiDebugButton');
const apiDebugContent = document.getElementById('apiDebugContent');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');

const thinkingConfigSection = document.getElementById('thinkingConfigSection');
const thinkingBudgetInput = document.getElementById('thinkingBudgetInput');
const thinkingLevelSelect = document.getElementById('thinkingLevelSelect');

const saveThoughtSignatureCheckbox = document.getElementById('saveThoughtSignatureCheckbox');

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

// Reuse API key from standard settings if possible
function loadApiKey() {
    const apiKey = getLocalStorageItem('geminiApiKey') || localStorage.getItem('geminiApiKey');
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

// --- Bot Roles (Party Members) ---
function loadRolesFromLocalStorage() {
    const r = getLocalStorageItem('botRoles');
    if (r) {
        try {
            botRoles = JSON.parse(r);
            if (!Array.isArray(botRoles)) botRoles = [];
        } catch (e) { botRoles = []; }
    } else {
        botRoles = []; // Empty default
    }
    renderRolesList();
    renderBotResponseButtons();
}

function saveRolesToLocalStorage() {
    setLocalStorageItem('botRoles', JSON.stringify(botRoles));
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

// --- Textarea Height Adjustments ---
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

// --- Chat History Parser & Manager ---
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
            const speakerText = buffer.join('\n\n').trim();
            // Preserve thought signature if we already had one for this entry index
            const originalEntry = chatHistory[newHistory.length];
            const signature = (originalEntry && originalEntry.speaker === currentSpeaker) ? originalEntry.thoughtSignature : undefined;
            
            const entry = { speaker: currentSpeaker, text: speakerText };
            if (signature) entry.thoughtSignature = signature;
            newHistory.push(entry);
        }
        buffer = [];
        currentSpeaker = null;
    };
    
    for (const line of lines) {
        const match = line.match(roleRegex);
        if (match) {
            const possibleRole = match[1].trim();
            if (possibleRole.length < 50) { // Prevent matching long lines as roles
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
    adjustTextareaHeight(); // Adjust height for the user input box
    
    renderChatHistory(); // Update chat history box and handle scroll
    saveChatHistory();
}

function addNarratorMessage() {
    const text = narratorMessageInput.value.trim();
    if (!text) return;

    if (document.activeElement) document.activeElement.blur();

    chatHistory.push({ speaker: 'Narrator', text: text });

    narratorMessageInput.value = '';
    adjustNarratorTextareaHeight(); // Adjust height for the narrator input box

    renderChatHistory(); // Update chat history box and handle scroll
    saveChatHistory();
}

function renderChatHistory() {
    if (!chatHistoryBox) return;
    
    // Capture current window scroll position
    const scrollY = window.scrollY;

    // Update content
    const text = chatHistory.map(entry => `${entry.speaker}: ${entry.text}`).join('\n\n');
    chatHistoryBox.value = text;

    // Adjust textarea's CSS height
    adjustChatHistoryHeight(); 

    // Restore window scroll position to prevent jumps
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
        
        lastCharacterReaction = null;
        setLocalStorageItem('lastCharacterReaction', '');
        renderLastCharacterReaction();

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
    
    const name = lastCharacterReaction.name || 'Character';
    const thought = lastCharacterReaction.internal_thought || '';
    const view = lastCharacterReaction.view_of_the_player || '';
    
    card.innerHTML = `
        <div class="collapsible-header character-header">
            <div class="char-name-label">Last Speaker Reaction: <span class="char-name-display">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
            <span class="toggle-icon">▼</span>
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
    errorMessageDiv.textContent = `Thinking for ${targetRole}...`;
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
        promptText += `${targetRole}:`;

        // Ensure stop_sequences does not exceed 5
        const stopSequences = [];
        const MAX_STOP_SEQUENCES = 5;

        // Collect all possible speakers for stop sequences
        const allPossibleSpeakers = new Set();
        allPossibleSpeakers.add(userName);
        allPossibleSpeakers.add('Narrator');
        allPossibleSpeakers.add('System');
        botRoles.forEach(role => allPossibleSpeakers.add(role));
        
        // Add speakers as stop sequences, excluding the targetRole
        const sortedSpeakers = Array.from(allPossibleSpeakers).sort((a, b) => {
            if (a === 'System') return -1;
            if (b === 'System') return 1;
            if (a === 'Narrator') return -1;
            if (b === 'Narrator') return 1;
            if (a === userName && b !== 'System' && b !== 'Narrator') return -1;
            if (b === userName && a !== 'System' && a !== 'Narrator') return 1;
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

        if (activeReactions) {
            requestBody.generationConfig.responseMimeType = "application/json";
            requestBody.generationConfig.responseSchema = {
                type: "OBJECT",
                properties: {
                    MESSAGE: { type: "STRING" },
                    CHARACTER_REACTION: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING" },
                            internal_thought: { type: "STRING" },
                            view_of_the_player: { type: "STRING" }
                        },
                        required: ["name", "internal_thought", "view_of_the_player"]
                    }
                },
                required: ["MESSAGE", "CHARACTER_REACTION"]
            };
        }

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
            const newEntry = { speaker: targetRole, text: generatedMessage };
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
            if (typeof data.userName === 'string') { // Load userName
                userName = data.userName;
                userNameInput.value = userName;
                updateUserMessagePlaceholder();
            }
            
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

// --- Debugging and Events ---
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
        // Save current instruction edits to NoReactions key
        setLocalStorageItem('systemInstructionNoReactions', systemInstructionInput.value);
        // Load reactions instruction
        systemInstruction = getLocalStorageItem('systemInstruction') || defaultSystemInstructionWithReactions;
        systemInstructionInput.value = systemInstruction;
        characterReactionContainer.classList.remove('hidden');
        renderLastCharacterReaction();
    } else {
        // Save current instruction edits to Reactions key
        setLocalStorageItem('systemInstruction', systemInstructionInput.value);
        // Load no-reactions instruction
        systemInstruction = getLocalStorageItem('systemInstructionNoReactions') || defaultSystemInstructionNoReactions;
        systemInstructionInput.value = systemInstruction;
        characterReactionContainer.classList.add('hidden');
    }
    adjustSystemInstructionHeight();
});

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
    if (useReactionsCheckbox.checked) {
        setLocalStorageItem('systemInstruction', systemInstruction);
    } else {
        setLocalStorageItem('systemInstructionNoReactions', systemInstruction);
    }
    adjustSystemInstructionHeight();
});

resetSystemInstructionButton.addEventListener('click', () => {
    if (confirm('Reset System Instruction to default?')) {
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
    adjustSystemInstructionHeight(); // Adjust for system instruction on load
    updateUserMessagePlaceholder(); // Ensure placeholder is correct on load
});
