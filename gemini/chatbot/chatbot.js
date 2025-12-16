// chatbot.js

let chatHistory = [];
let currentApiKey = '';
let selectedModel = 'gemini-2.5-flash-lite';
let systemInstruction = ''; // New variable for system instruction, reflects current input field content

let totalInputTokens = 0;
let totalOutputTokens = 0;
let currentInputTokens = 0; // New: Tokens for the current request
let currentOutputTokens = 0; // New: Tokens for the current request

// New: Variables for thinking budget/level
let thinkingBudget = -1; // Default for non-gemini3 models
let thinkingLevel = 'low'; // Default for gemini3 models

// New: Variable for saving thought signature
let saveThoughtSignature = true; // Default to saving thought signature

// New: Variables for cost calculation
let currentRequestCost = 0; // Cost of the last API call
let totalCost = 0; // Cumulative cost of all API calls

// New: Variables to store raw API request/response for debugging
let lastRawRequestBody = null;
let lastRawResponseData = null;

// New: AbortController for stopping ongoing requests
let abortController = null;

// New: Variables for font size adjustment
let chatFontSize = 1.0; // Default font size multiplier (in em)
const MIN_FONT_SIZE = 0.4;
const MAX_FONT_SIZE = 4;
const FONT_SIZE_STEP = 0.1;


// Get DOM elements
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const geminiModelSelect = document.getElementById('geminiModel');
const chatHistoryDiv = document.getElementById('chatHistory');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessageButton');
const stopMessageButton = document.getElementById('stopMessageButton'); // New: Stop button
const errorMessageDiv = document.getElementById('errorMessage');
const tokenStatsDiv = document.getElementById('tokenStats');
const costStatsDiv = document.getElementById('costStats'); // New: Cost stats div

// DOM elements for raw chat history
const rawChatHistoryInput = document.getElementById('rawChatHistoryInput');
const applyRawHistoryButton = document.getElementById('applyRawHistoryButton');
const debugButton = document.getElementById('debugButton'); // New: Debug button
const rawChatContent = document.getElementById('rawChatContent'); // New: Raw chat content div

// New DOM elements for system instruction
const systemInstructionInput = document.getElementById('systemInstructionInput');
const clearSystemInstructionButton = document.getElementById('clearSystemInstructionButton'); // New: Clear system instruction button

// New DOM elements for chat save/load
const saveChatButton = document.getElementById('saveChatButton');
const loadChatButton = document.getElementById('loadChatButton');
const loadChatFileInput = document.getElementById('loadChatFileInput');

// New DOM elements for chat history actions
const removeLastEntryButton = document.getElementById('removeLastEntryButton'); // New
const clearAllHistoryButton = document.getElementById('clearAllHistoryButton'); // New
const regenerateSystemReplyButton = document.getElementById('regenerateSystemReplyButton'); // New
const cleanThinkingSignatureButton = document.getElementById('cleanThinkingSignatureButton'); // New

// New DOM elements for API Debugging
const showApiDebugButton = document.getElementById('showApiDebugButton');
const apiDebugContent = document.getElementById('apiDebugContent');
const apiRequestBody = document.getElementById('apiRequestBody');
const apiResponseBody = document.getElementById('apiResponseBody');

// New DOM elements for thinking config
const thinkingConfigSection = document.getElementById('thinkingConfigSection');
const thinkingBudgetInput = document.getElementById('thinkingBudgetInput');
const thinkingLevelSelect = document.getElementById('thinkingLevelSelect');

// New DOM element for thought signature checkbox
const saveThoughtSignatureCheckbox = document.getElementById('saveThoughtSignatureCheckbox');
const cleanupAllThoughtSignaturesButton = document.getElementById('cleanupAllThoughtSignaturesButton'); // New: Cleanup all thought signatures button

// New DOM elements for font size adjustment
const increaseFontSizeButton = document.getElementById('increaseFontSizeButton');
const decreaseFontSizeButton = document.getElementById('decreaseFontSizeButton');
const resetFontSizeButton = document.getElementById('resetFontSizeButton'); // New: Reset font size button


// Utility functions for localStorage
function setLocalStorageItem(name, value) {
    try {
        localStorage.setItem(name, value);
    } catch (e) {
        console.error(`Error saving to localStorage for ${name}:`, e);
        errorMessageDiv.textContent = `Error saving data locally: ${e.message}`;
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }
}

function getLocalStorageItem(name) {
    try {
        return localStorage.getItem(name);
    } catch (e) {
        console.error(`Error loading from localStorage for ${name}:`, e);
        errorMessageDiv.textContent = `Error loading data locally: ${e.message}`;
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return null;
    }
}

// Function to validate and store the API key
function setApiKey() {
    const apiKey = geminiApiKeyInput.value.trim();
    if (!apiKey) {
        errorMessageDiv.textContent = 'Please enter your Gemini API Key.';
        currentApiKey = '';
        return false;
    }
    currentApiKey = apiKey;
    setLocalStorageItem('geminiApiKey', apiKey); // Save API key to localStorage
    errorMessageDiv.textContent = 'API Key set successfully and saved!';
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
    console.log('API Key set.');
    return true;
}

// Function to load the API key from localStorage
function loadApiKeyFromLocalStorage() {
    const apiKey = getLocalStorageItem('geminiApiKey');
    if (apiKey) {
        geminiApiKeyInput.value = apiKey;
        currentApiKey = apiKey;
        errorMessageDiv.textContent = 'API Key loaded from local storage!';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        console.log('API Key loaded from local storage.');
    }
}

// Function to update the selected model
function updateSelectedModel() {
    selectedModel = geminiModelSelect.value;
    setLocalStorageItem('selectedModel', selectedModel); // Save selected model to localStorage
    updateThinkingControlsVisibility(); // Update visibility of thinking config controls
    console.log(`Selected model: ${selectedModel}`);
    errorMessageDiv.textContent = `Model set to: ${selectedModel}`;
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

// Function to load the selected model from localStorage
function loadSelectedModelFromLocalStorage() {
    const storedModel = getLocalStorageItem('selectedModel');
    if (storedModel) {
        selectedModel = storedModel;
        geminiModelSelect.value = storedModel;
        console.log(`Selected model loaded from local storage: ${selectedModel}`);
    } else {
        // If no model is stored, ensure the dropdown reflects the default
        geminiModelSelect.value = selectedModel;
    }
    updateThinkingControlsVisibility(); // Call after loading model to set initial visibility
}

// Function to load system instruction from localStorage (for initial pre-fill)
function loadSystemInstructionFromLocalStorage() {
    const loadedInstruction = getLocalStorageItem('systemInstruction');
    if (loadedInstruction) {
        systemInstruction = loadedInstruction; // Update global variable
        systemInstructionInput.value = loadedInstruction; // Update UI
        console.log('System instruction loaded from local storage.');
    }
}

// Function to clear system instruction from UI, variable, and localStorage
function clearSystemInstruction() {
    if (systemInstructionInput.value.trim() === '') {
        errorMessageDiv.textContent = "Background instruction is already empty.";
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }
    if (confirm('Are you sure you want to clear the background / system instruction?')) {
        systemInstructionInput.value = '';
        systemInstruction = ''; // Ensure global variable is also cleared
        setLocalStorageItem('systemInstruction', ''); // Directly clear from local storage
        updateRawHistoryInput(); // Update raw history display
        errorMessageDiv.textContent = "Background instruction cleared.";
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

// Function to save chat history to localStorage
function saveChatHistoryToLocalStorage() {
    setLocalStorageItem('chatHistory', JSON.stringify(chatHistory));
    console.log('Chat history saved to local storage.');
}

// Function to load chat history from localStorage
function loadChatHistoryFromLocalStorage() {
    const storedChatHistory = getLocalStorageItem('chatHistory');
    if (storedChatHistory) {
        try {
            const parsedHistory = JSON.parse(storedChatHistory);
            if (Array.isArray(parsedHistory)) {
                chatHistory = parsedHistory;
                console.log('Chat history loaded from local storage.');
            } else {
                console.warn('Stored chat history is not an array, initializing empty.');
                chatHistory = [];
            }
        } catch (e) {
            console.error('Error parsing stored chat history from local storage:', e);
            chatHistory = []; // Reset on error
        }
    }
    // If no history in localStorage or parsing error, or history is empty after loading,
    // and there's no system instruction already providing context, add the instruction message.
    if (chatHistory.length === 0 && !systemInstruction) {
        const initialInstruction = `Your task is to write the messages in this chat/roleplay.
  Use *asterisks* for actions, and (parantheses) for the internal thought processes of a character.
  NEVER try to "wrap up" the roleplay. This is a never-ending roleplay.
  Multi-line messages are not allowed - each individual message must be a single paragraph.
  Avoid unnecessary and unoriginal repetition of previous messages.
  Write the next message - remember to make them interesting, authentic, descriptive, natural, engaging, and creative.
  Use the same language as input or previous diaglog. Do not include the thought in repsonse text.`;
        chatHistory.push({ role: 'model', parts: [{ text: initialInstruction }] });
        console.log('Initialized chat history with the roleplay instruction.');
        saveChatHistoryToLocalStorage(); // Save this initial state
    }
}

// Function to save token and cost stats to localStorage
function saveStatsToLocalStorage() {
    setLocalStorageItem('totalInputTokens', totalInputTokens.toString());
    setLocalStorageItem('totalOutputTokens', totalOutputTokens.toString());
    setLocalStorageItem('totalCost', totalCost.toString()); // Save total cost
    console.log('Token and cost stats saved to local storage.');
}

// Function to load token and cost stats from localStorage
function loadStatsFromLocalStorage() {
    const storedInput = getLocalStorageItem('totalInputTokens');
    const storedOutput = getLocalStorageItem('totalOutputTokens');
    const storedTotalCost = getLocalStorageItem('totalCost');

    if (storedInput) {
        totalInputTokens = parseInt(storedInput, 10);
    }
    if (storedOutput) {
        totalOutputTokens = parseInt(storedOutput, 10);
    }
    if (storedTotalCost) {
        totalCost = parseFloat(storedTotalCost);
    }
    console.log(`Stats loaded: Input=${totalInputTokens}, Output=${totalOutputTokens}, TotalCost=$${totalCost.toFixed(5)}`);
}

// Function to load thinking config from localStorage
function loadThinkingConfigFromLocalStorage() {
    const storedBudget = getLocalStorageItem('thinkingBudget');
    if (storedBudget !== null) {
        thinkingBudget = parseInt(storedBudget, 10);
        thinkingBudgetInput.value = thinkingBudget;
        console.log(`Thinking budget loaded: ${thinkingBudget}`);
    }

    const storedLevel = getLocalStorageItem('thinkingLevel');
    if (storedLevel) {
        thinkingLevel = storedLevel;
        thinkingLevelSelect.value = thinkingLevel;
        console.log(`Thinking level loaded: ${thinkingLevel}`);
    }
}

// Function to load the saveThoughtSignature state from localStorage
function loadSaveThoughtSignatureStateFromLocalStorage() {
    const storedState = getLocalStorageItem('saveThoughtSignature');
    if (storedState !== null) {
        saveThoughtSignature = (storedState === 'true');
        saveThoughtSignatureCheckbox.checked = saveThoughtSignature;
        console.log(`Save thought signature state loaded: ${saveThoughtSignature}`);
    }
}

// New: Function to apply the current chat font size to the CSS variable
function updateChatFontSize() {
    document.documentElement.style.setProperty('--chat-font-size', `${chatFontSize}em`);
    setLocalStorageItem('chatFontSize', chatFontSize.toString());
}

// New: Functions to adjust font size
function increaseFontSize() {
    if (chatFontSize < MAX_FONT_SIZE) {
        chatFontSize = parseFloat((chatFontSize + FONT_SIZE_STEP).toFixed(1));
        updateChatFontSize();
    }
}

function decreaseFontSize() {
    if (chatFontSize > MIN_FONT_SIZE) {
        chatFontSize = parseFloat((chatFontSize - FONT_SIZE_STEP).toFixed(1));
        updateChatFontSize();
    }
}

// New: Function to reset font size
function resetFontSize() {
    chatFontSize = 1.0; // Reset to default
    updateChatFontSize();
    errorMessageDiv.textContent = 'Font size reset to default.';
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}


// New: Load font size from localStorage
function loadChatFontSizeFromLocalStorage() {
    const storedFontSize = getLocalStorageItem('chatFontSize');
    if (storedFontSize) {
        chatFontSize = parseFloat(storedFontSize);
        if (isNaN(chatFontSize)) { // Fallback if parsing fails
            chatFontSize = 1.0;
        }
        chatFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, chatFontSize)); // Clamp to min/max
        console.log(`Chat font size loaded: ${chatFontSize}`);
    } else {
        chatFontSize = 1.0; // Default if nothing in local storage
    }
    updateChatFontSize(); // Apply the loaded or default font size
}


// Function to update the raw chat history textarea
function updateRawHistoryInput() {
    if (rawChatHistoryInput) {
        try {
            const dataToDisplay = {
                systemInstruction: systemInstruction, // Use the global variable which reflects the input
                chatHistory: chatHistory
            };
            rawChatHistoryInput.value = JSON.stringify(dataToDisplay, null, 2); // Pretty print JSON
        } catch (e) {
            console.error("Error stringifying chat history for raw input:", e);
            rawChatHistoryInput.value = "Error: Could not display chat history as JSON.";
        }
    }
}

// Function to apply raw chat history from the textarea
function applyRawHistory() {
    if (!rawChatHistoryInput) return;

    chatHistory = []

    const rawText = rawChatHistoryInput.value;
    try {
        const parsedData = JSON.parse(rawText);

        if (typeof parsedData !== 'object' || parsedData === null) {
            throw new Error("Invalid JSON format. Expected an object with 'systemInstruction' and 'chatHistory'.");
        }

        // Apply system instruction
        const newSystemInstruction = parsedData.systemInstruction || '';
        if (typeof newSystemInstruction !== 'string') {
            throw new Error("Invalid 'systemInstruction' format. Expected a string.");
        }
        systemInstruction = newSystemInstruction; // Update global variable
        systemInstructionInput.value = systemInstruction; // Update UI
        setLocalStorageItem('systemInstruction', systemInstruction); // Save to local storage

        // Apply chat history
        const newChatHistory = parsedData.chatHistory;
        if (!Array.isArray(newChatHistory) || !newChatHistory.every(item => item.role && Array.isArray(item.parts))) {
            throw new Error("Invalid 'chatHistory' format. Expected an array of objects with 'role' and 'parts'.");
        }
        chatHistory = newChatHistory;
        renderChatHistory(); // Re-render chat bubbles based on new history
        saveChatHistoryToLocalStorage(); // Save updated history to local storage

        errorMessageDiv.textContent = 'Chat history and system instruction applied successfully!';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        console.log('Chat history and system instruction updated from raw input.');
    } catch (error) {
        console.error('Error applying raw chat history:', error);
        errorMessageDiv.textContent = `Error applying raw chat history: ${error.message}`;
    }
}

// Function to render chat history to the UI
function renderChatHistory() {
    chatHistoryDiv.innerHTML = ''; // Clear existing messages
    chatHistory.forEach((msg) => {
        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble');
        messageBubble.classList.add(msg.role === 'user' ? 'user-message' : 'model-message');
        
        // Handle multiple parts within a message, joining them
        const textContent = msg.parts.map(part => part.text).join('\n'); // Join parts with newline
        const paragraph = document.createElement('p');
        paragraph.textContent = textContent;
        messageBubble.appendChild(paragraph);

        chatHistoryDiv.appendChild(messageBubble);
    });
    // Scroll to the bottom
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;

    updateRawHistoryInput(); // Ensure raw history input is updated after rendering
}

// Function to render accumulated token stats
function renderTokenStats() {
    if (tokenStatsDiv) {
        tokenStatsDiv.innerHTML = `
            <div><strong>Input Tokens:</strong> Current: ${currentInputTokens} | Total: ${totalInputTokens}</div>
            <div><strong>Output Tokens:</strong> Current: ${currentOutputTokens} | Total: ${totalOutputTokens}</div>
        `;
    }
}

// Function to render cost stats
function renderCostStats() {
    if (costStatsDiv) {
        costStatsDiv.innerHTML = `
            <div><strong>Last Request Cost:</strong> $${currentRequestCost.toFixed(5)}</div>
            <div><strong>Total Cost:</strong> $${totalCost.toFixed(5)}</div>
        `;
    }
}

// Function to update visibility of thinking budget/level controls
function updateThinkingControlsVisibility() {
    if (!thinkingConfigSection || !thinkingBudgetInput || !thinkingLevelSelect) return;

    // Hide both containers initially
    thinkingBudgetInput.parentElement.classList.add('hidden');
    thinkingLevelSelect.parentElement.classList.add('hidden');

    if (selectedModel.startsWith('gemini-3')) {
        thinkingLevelSelect.parentElement.classList.remove('hidden');
    } else {
        thinkingBudgetInput.parentElement.classList.remove('hidden');
    }

    setLocalStorageItem('selectedModel', selectedModel); // Ensure model is saved
    setLocalStorageItem('thinkingBudget', thinkingBudget.toString()); // Save current thinkingBudget
    setLocalStorageItem('thinkingLevel', thinkingLevel); // Save current thinkingLevel
}


// Helper function to send content to the Gemini API
async function _sendContentToModel(userMessageTextForAPI, contentToSendForAPI) {
    if (!currentApiKey) {
        errorMessageDiv.textContent = 'Please set your Gemini API Key first.';
        return false; // Indicate failure
    }

    // Set up AbortController and enable stop button
    abortController = new AbortController();
    stopMessageButton.disabled = false;
    stopMessageButton.classList.remove('hidden');
    sendMessageButton.disabled = true; // Disable send button during request
    regenerateSystemReplyButton.disabled = true; // Disable regenerate button during request
    errorMessageDiv.textContent = 'Thinking... (Click Stop to cancel)'; // Show thinking indicator

    // Reset current request token counts and cost at the start of a new API call attempt
    currentInputTokens = 0;
    currentOutputTokens = 0;
    currentRequestCost = 0;
    renderTokenStats(); // Update UI to reflect reset
    renderCostStats(); // Update UI to reflect reset

    // Clear previous raw API debug data before a new request
    lastRawRequestBody = null;
    lastRawResponseData = null;
    apiRequestBody.textContent = 'No API request made yet.';
    apiResponseBody.textContent = 'No API response received yet.';


    try {
        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

        const requestBody = {
            contents: contentToSendForAPI, // This will be the actual history for the API call, potentially with appended system instruction part
            generationConfig: {
                maxOutputTokens: 5000,
                thinkingConfig: {} // Initialize thinkingConfig
            },
        };

        // Configure thinkingConfig based on the selected model
        if (selectedModel.startsWith('gemini-3')) {
            requestBody.generationConfig.thinkingConfig.thinkingLevel = thinkingLevel;
        } else {
            requestBody.generationConfig.thinkingConfig.thinkingBudget = thinkingBudget;
        }

        // Store the raw request body before sending
        lastRawRequestBody = JSON.stringify(requestBody, null, 2);


        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': currentApiKey,
            },
            body: lastRawRequestBody, // Use the stored stringified body
            signal: abortController.signal, // Pass the abort signal
        });

        if (!response.ok) {
            const errorData = await response.json();
            // Store the raw error response
            lastRawResponseData = JSON.stringify(errorData, null, 2);
            const errorMessage = errorData.error ? errorData.error.message : response.statusText;
            throw new Error(`API Error: ${errorMessage} (Status: ${response.status})`);
        }

        const data = await response.json();
        // Store the raw successful response
        lastRawResponseData = JSON.stringify(data, null, 2);
        
        let modelResponseText = 'No response from model.';
        let thoughtSignature = null;

        if (data.candidates && data.candidates.length > 0 &&
            data.candidates[0].content && data.candidates[0].content.parts &&
            data.candidates[0].content.parts.length > 0) {
            modelResponseText = data.candidates[0].content.parts[0].text;
            
            // Only capture thoughtSignature if the saveThoughtSignature flag is true
            if (saveThoughtSignature) {
                thoughtSignature = data.candidates[0].content.parts[0].thoughtSignature;
            }
        }

        // Update token counts and calculate cost
        if (data.usageMetadata) {
            currentInputTokens = data.usageMetadata.promptTokenCount || 0; // Update current request tokens
            currentOutputTokens = data.usageMetadata.candidatesTokenCount || 0; // Update current request tokens

            totalInputTokens += currentInputTokens;
            totalOutputTokens += currentOutputTokens;
            
            // Calculate cost for the current request
            const modelPricing = GEMINI_PRICING_CONFIG.TEXT[selectedModel];
            if (modelPricing && modelPricing.getPricing) {
                const { inputRate, outputRate } = modelPricing.getPricing(currentInputTokens);
                currentRequestCost = (currentInputTokens * inputRate) + (currentOutputTokens * outputRate);
                totalCost += currentRequestCost;
            } else {
                console.warn(`No valid pricing function found for model: ${selectedModel}`);
            }

            renderTokenStats();
            renderCostStats(); // Call renderCostStats
            saveStatsToLocalStorage(); // Save updated tokens and cost
        }

        // Add model response to history, including thoughtSignature if present (which is conditional now)
        const modelPart = { text: modelResponseText };
        if (thoughtSignature) { // This check is still necessary if thoughtSignature was null from the API
            modelPart.thoughtSignature = thoughtSignature;
        }
        chatHistory.push({ role: 'model', parts: [modelPart] });

        errorMessageDiv.textContent = ''; // Clear thinking message
        renderChatHistory(); // Render the new model message and update raw history input
        saveChatHistoryToLocalStorage(); // Save updated history
        return true; // Indicate success

    } catch (error) {
        if (error.name === 'AbortError') {
            errorMessageDiv.textContent = 'Request cancelled by user.';
            console.log('Fetch request aborted by user.');
        } else {
            console.error('Error sending message:', error);
            errorMessageDiv.textContent = `Error sending message: ${error.message}`;
        }
        // On error, current tokens and cost should be 0 as the request failed or was incomplete.
        currentInputTokens = 0;
        currentOutputTokens = 0;
        currentRequestCost = 0; // Reset current request cost on error
        renderTokenStats(); // Update UI to reflect 0 for current
        renderCostStats(); // Update UI to reflect 0 for current request cost
        return false; // Indicate failure
    } finally {
        abortController = null; // Clear the controller
        stopMessageButton.disabled = true;
        stopMessageButton.classList.add('hidden'); // Hide it again
        sendMessageButton.disabled = false; // Re-enable send button
        regenerateSystemReplyButton.disabled = false; // Re-enable regenerate button

        // Clear 'Thinking...' message after a brief delay if it wasn't a user cancellation
        if (errorMessageDiv.textContent === 'Thinking... (Click Stop to cancel)') {
            errorMessageDiv.textContent = '';
        }
        // If it was cancelled, the message "Request cancelled by user." will remain, clear it after a timeout.
        if (errorMessageDiv.textContent === 'Request cancelled by user.') {
            setTimeout(() => errorMessageDiv.textContent = '', 3000);
        }
    }
}


// Function to send a message directly via HTTP request to Gemini endpoint
async function sendMessage() {
    const userMessageText = messageInput.value.trim();
    const activeSystemInstruction = systemInstructionInput.value.trim();

    // Allow sending an empty user message if there's an active system instruction
    if (!userMessageText && !activeSystemInstruction) {
        errorMessageDiv.textContent = 'Please type a message or provide a background instruction.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    if (!currentApiKey) {
        errorMessageDiv.textContent = 'Please set your Gemini API Key first.';
        return;
    }

    // Combine user input and system instruction into a single message part
    let combinedMessageText = userMessageText;
    if (activeSystemInstruction) {
        // Add a clear separator for the system context within the user message
        combinedMessageText += (userMessageText ? '\n\n' : '') + `SYSTEM CONTEXT: ${activeSystemInstruction}`;
    }
    // Ensure combinedMessageText is not empty if only system instruction was present (though the initial check handles it)
    if (!combinedMessageText) {
        combinedMessageText = '...'; // Fallback if somehow empty, though shouldn't happen with initial check
    }

    // 1. ALWAYS save the user input message AND context into chatHistory BEFORE the API call.
    chatHistory.push({ role: 'user', parts: [{ text: combinedMessageText }] });
    renderChatHistory(); // Render the new user message (with embedded instruction)
    saveChatHistoryToLocalStorage(); // Save updated history

    // 2. Clear input fields for the next turn, AFTER the content has been saved to history.
    messageInput.value = ''; // Clear message input
    adjustTextareaHeight(); // Reset textarea height

    // Clear system instruction input field and its localStorage entry if it was active,
    // as it's typically a 'one-shot' instruction per user message.
    if (activeSystemInstruction) {
        systemInstructionInput.value = ''; // Clear UI
        systemInstruction = ''; // Clear global variable
        setLocalStorageItem('systemInstruction', ''); // Clear from local storage
        updateRawHistoryInput(); // Update raw history display
        errorMessageDiv.textContent = "Background instruction applied and cleared.";
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }

    // The _sendContentToModel function will now use the *already updated* chatHistory.
    // It will implicitly process the last user message which now contains the embedded system instruction.
    await _sendContentToModel(combinedMessageText, chatHistory);

    // If the API call fails, the user message (which includes the system context)
    // remains in chatHistory, allowing the user to regenerate the response later
    // using the 'Re-generate Reply' button. No `pop()` needed here on failure.
}

// Adjust textarea height based on content
function adjustTextareaHeight() {
    messageInput.style.height = 'auto'; // Reset height to recalculate
    messageInput.style.height = messageInput.scrollHeight + 'px';
    if (messageInput.scrollHeight > 150) { // Max height limit for textarea
        messageInput.style.height = '150px';
        messageInput.style.overflowY = 'auto';
    } else {
        messageInput.style.overflowY = 'hidden';
    }
}

// Function to download chat history as a JSON file
function downloadChatHistory() {
    if (chatHistory.length === 0 && systemInstruction.trim() === '') {
        errorMessageDiv.textContent = "No chat history or system instruction to save.";
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    const dataToSave = {
        systemInstruction: systemInstruction, // Use the current value of the global variable
        chatHistory: chatHistory
    };

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const filename = `gch_${timestamp}.json`;
    
    const jsonStr = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    errorMessageDiv.textContent = "Chat history and system instruction saved to file.";
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

// Function to handle loading chat history from a file
function handleChatFileLoad(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            // Validate the structure
            if (typeof loadedData !== 'object' || loadedData === null || !Array.isArray(loadedData.chatHistory)) {
                throw new Error("Invalid chat history file format. Expected an object with 'systemInstruction' and an array 'chatHistory'.");
            }

            // Update system instruction
            systemInstruction = loadedData.systemInstruction || ''; // Update global variable
            systemInstructionInput.value = systemInstruction; // Update UI
            setLocalStorageItem('systemInstruction', systemInstruction); // Save to local storage

            // Update chat history
            const newChatHistory = loadedData.chatHistory;
            if (!newChatHistory.every(item => item.role && Array.isArray(item.parts))) {
                throw new Error("Invalid chat history entries within the file.");
            }
            chatHistory = newChatHistory;
            
            renderChatHistory(); // This will also call updateRawHistoryInput indirectly
            saveChatHistoryToLocalStorage(); // Save loaded chatHistory to local storage
            errorMessageDiv.textContent = "Chat history and system instruction loaded from file successfully!";
        } catch (error) {
            console.error('Error loading chat history from file:', error);
            errorMessageDiv.textContent = `Error loading chat history from file: ${error.message}`;
        } finally {
            setTimeout(() => errorMessageDiv.textContent = '', 5000);
            loadChatFileInput.value = ''; // Clear the file input
        }
    };
    reader.onerror = (e) => {
        console.error('Error reading file:', e);
        errorMessageDiv.textContent = `Error reading file: ${e.target.error.message}`;
        setTimeout(() => errorMessageDiv.textContent = '', 5000);
        loadChatFileInput.value = ''; // Clear the file input
    };
    reader.readAsText(file);
}

// Function to toggle raw chat history visibility
function toggleRawChatHistory() {
    if (rawChatContent) {
        const isHidden = rawChatContent.classList.toggle('hidden');
        setLocalStorageItem('rawChatHistoryHidden', isHidden.toString()); // Save the state
        console.log('Raw chat history visibility saved:', !isHidden);
    }
}

// Function to load raw chat history toggle state from localStorage
function loadRawChatHistoryToggleStateFromLocalStorage() {
    const isHidden = getLocalStorageItem('rawChatHistoryHidden');
    if (isHidden === 'true') {
        rawChatContent.classList.add('hidden');
    } else {
        rawChatContent.classList.remove('hidden'); // Ensure it's shown if 'false' or not set
    }
    console.log('Raw chat history visibility loaded:', isHidden === 'true' ? 'hidden' : 'visible');
}

// Function to toggle raw API request/response visibility
function toggleApiDebugDisplay() {
    if (apiDebugContent.classList.contains('hidden')) { // If it's about to be shown
        apiRequestBody.textContent = lastRawRequestBody || 'No API request made yet. Send a message to see the request.';
        apiResponseBody.textContent = lastRawResponseData || 'No API response received yet. Send a message to see the response.';
    }
    apiDebugContent.classList.toggle('hidden');
}


// Function to remove the last entry from chat history
function removeLastEntry() {
    if (chatHistory.length > 0) {
        const lastEntry = chatHistory.pop(); // Remove the last entry
        renderChatHistory(); // Re-render chat bubbles
        saveChatHistoryToLocalStorage(); // Save updated history
        errorMessageDiv.textContent = `Last entry (${lastEntry.role}) removed.`;
    } else {
        errorMessageDiv.textContent = 'No chat history to remove.';
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

// Function to regenerate the last system reply
async function regenerateSystemReply() {
    if (!currentApiKey) {
        errorMessageDiv.textContent = 'Please set your Gemini API Key first.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    errorMessageDiv.textContent = 'Thinking...';

    const newActiveSystemInstruction = systemInstructionInput.value.trim();

    // 1. Remove last model reply if it exists in chatHistory (to regenerate it).
    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'model') {
        chatHistory.pop(); // Remove the last model reply
        renderChatHistory(); // Update UI
        saveChatHistoryToLocalStorage(); // Save updated history
    }

    // Check if there's a user message to regenerate from.
    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== 'user') {
        errorMessageDiv.textContent = 'Cannot regenerate: No previous user message to reply to.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    // 2. If a new system instruction is provided, incorporate it into the LAST USER message in chatHistory.
    // This ensures the full context for the API call is saved in history BEFORE the call.
    if (newActiveSystemInstruction !== '') {
        const lastUserMessage = chatHistory[chatHistory.length - 1]; // This is the actual object in chatHistory
        if (lastUserMessage.parts.length > 0) {
            lastUserMessage.parts[lastUserMessage.parts.length - 1].text += `\n\nSYSTEM CONTEXT: ${newActiveSystemInstruction}`;
        } else {
            lastUserMessage.parts.push({ text: `SYSTEM CONTEXT: ${newActiveSystemInstruction}` });
        }

        // 3. Clear system instruction input field and its localStorage entry AFTER it's appended to chatHistory.
        systemInstructionInput.value = ''; // Clear UI
        systemInstruction = ''; // Clear global variable
        setLocalStorageItem('systemInstruction', ''); // Clear from local storage
        
        // 4. Re-render chat history to show the user message with the newly appended system context.
        // This ensures the UI reflects the history exactly as it will be sent to the API.
        renderChatHistory(); // This will also call updateRawHistoryInput indirectly
        saveChatHistoryToLocalStorage(); // Save updated history
        
        errorMessageDiv.textContent = "Background instruction applied to user message for regeneration and cleared.";
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
    }

    // Now, chatHistory already contains the system instruction within the last user message (if provided).
    // The `_sendContentToModel` function will use this updated `chatHistory`.
    const lastUserMessageText = chatHistory[chatHistory.length - 1].parts.map(part => part.text).join('\n');
    await _sendContentToModel(lastUserMessageText, chatHistory); // Send the modified chatHistory
    adjustTextareaHeight(); // Re-adjust
}

// Function to clean the thinking signature from the last model response
function cleanThinkingSignature() {
    if (chatHistory.length === 0) {
        errorMessageDiv.textContent = 'No chat history to clean.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    // Find the last model entry that has a thoughtSignature
    let lastModelEntryIndex = -1;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        const entry = chatHistory[i];
        if (entry.role === 'model' && entry.parts && entry.parts.length > 0) {
            // Check all parts for thoughtSignature, typically it's in the first part
            const partWithSignature = entry.parts.find(p => p.thoughtSignature);
            if (partWithSignature) {
                lastModelEntryIndex = i;
                break;
            }
        }
    }

    if (lastModelEntryIndex !== -1) {
        const entryToClean = chatHistory[lastModelEntryIndex];
        const newParts = entryToClean.parts.map(part => {
            if (part.thoughtSignature) {
                // Destructure to exclude thoughtSignature
                // eslint-disable-next-line no-unused-vars
                const { thoughtSignature, ...rest } = part; 
                return rest;
            }
            return part;
        });
        chatHistory[lastModelEntryIndex].parts = newParts;
        
        renderChatHistory(); // Update raw history view (since thoughtSignature is in the data)
        saveChatHistoryToLocalStorage();
        errorMessageDiv.textContent = 'Thinking signature removed from the last model response.';
    } else {
        errorMessageDiv.textContent = 'No model response with a thinking signature found in history.';
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}

// Function to cleanup ALL thinking signatures from chat history
function cleanupAllThoughtSignaturesInHistory() {
    if (chatHistory.length === 0) {
        errorMessageDiv.textContent = 'No chat history to clean.';
        setTimeout(() => errorMessageDiv.textContent = '', 3000);
        return;
    }

    let cleanedCount = 0;
    const newChatHistory = chatHistory.map(entry => {
        if (entry.role === 'model' && entry.parts && entry.parts.length > 0) {
            const newParts = entry.parts.map(part => {
                if (part.thoughtSignature) {
                    cleanedCount++;
                    // Destructure to exclude thoughtSignature
                    // eslint-disable-next-line no-unused-vars
                    const { thoughtSignature, ...rest } = part;
                    return rest;
                }
                return part;
            });
            return { ...entry, parts: newParts };
        }
        return entry;
    });

    if (cleanedCount > 0) {
        chatHistory = newChatHistory; // Replace with the cleaned history
        renderChatHistory();
        saveChatHistoryToLocalStorage();
        errorMessageDiv.textContent = `Removed ${cleanedCount} thinking signature(s) from history.`;
    } else {
        errorMessageDiv.textContent = 'No thinking signatures found in history to clean.';
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}


// Function to clear all chat history
function clearAllHistory() {
    if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
        chatHistory = []; // Clear the array
        totalInputTokens = 0; // Reset tokens
        totalOutputTokens = 0; // Reset tokens
        currentInputTokens = 0; // Reset current tokens
        currentOutputTokens = 0; // Reset current tokens
        currentRequestCost = 0; // Reset current request cost
        totalCost = 0; // Reset total cost
        lastRawRequestBody = null; // Clear raw API debug data
        lastRawResponseData = null; // Clear raw API debug data
        renderChatHistory(); // Re-render (will be empty)
        renderTokenStats(); // Update token display
        renderCostStats(); // Update cost display
        saveChatHistoryToLocalStorage(); // Save empty history
        saveStatsToLocalStorage(); // Save reset token and cost stats
        errorMessageDiv.textContent = 'All chat history cleared.';
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
}


// Event Listeners
setApiKeyButton.addEventListener('click', setApiKey);
geminiModelSelect.addEventListener('change', updateSelectedModel);
sendMessageButton.addEventListener('click', sendMessage);
stopMessageButton.addEventListener('click', () => { // New: Stop button listener
    if (abortController) {
        abortController.abort();
        errorMessageDiv.textContent = 'Request cancelled by user.';
        stopMessageButton.disabled = true;
        stopMessageButton.classList.add('hidden');
        sendMessageButton.disabled = false;
        regenerateSystemReplyButton.disabled = false;
    }
    setTimeout(() => errorMessageDiv.textContent = '', 3000);
});
applyRawHistoryButton.addEventListener('click', applyRawHistory);
debugButton.addEventListener('click', toggleRawChatHistory); // New: Debug button listener

// New: API Debug button listener
showApiDebugButton.addEventListener('click', toggleApiDebugDisplay);


// System Instruction events
// Keep the global 'systemInstruction' variable in sync with the input field for UI display (e.g., raw history)
systemInstructionInput.addEventListener('input', () => {
    systemInstruction = systemInstructionInput.value.trim();
    updateRawHistoryInput();
});
clearSystemInstructionButton.addEventListener('click', clearSystemInstruction); // New: Clear system instruction button listener

// Thinking Config events
thinkingBudgetInput.addEventListener('input', () => {
    const value = parseInt(thinkingBudgetInput.value, 10);
    if (!isNaN(value)) {
        thinkingBudget = value;
        setLocalStorageItem('thinkingBudget', thinkingBudget.toString());
    } else if (thinkingBudgetInput.value.trim() === '') {
        thinkingBudget = -1; // Default if cleared
        setLocalStorageItem('thinkingBudget', '-1');
    }
});
thinkingLevelSelect.addEventListener('change', () => {
    thinkingLevel = thinkingLevelSelect.value;
    setLocalStorageItem('thinkingLevel', thinkingLevel);
});

// Thought Signature checkbox event
saveThoughtSignatureCheckbox.addEventListener('change', () => {
    saveThoughtSignature = saveThoughtSignatureCheckbox.checked;
    setLocalStorageItem('saveThoughtSignature', saveThoughtSignature.toString());
});
// New: Cleanup All Thought Signatures button event
cleanupAllThoughtSignaturesButton.addEventListener('click', cleanupAllThoughtSignaturesInHistory);


// Chat Save/Load events
saveChatButton.addEventListener('click', downloadChatHistory);
loadChatButton.addEventListener('click', () => loadChatFileInput.click()); // Trigger file input click
loadChatFileInput.addEventListener('change', handleChatFileLoad);

// Chat history action events
removeLastEntryButton.addEventListener('click', removeLastEntry); // New
clearAllHistoryButton.addEventListener('click', clearAllHistory); // New
regenerateSystemReplyButton.addEventListener('click', regenerateSystemReply); // New
cleanThinkingSignatureButton.addEventListener('click', cleanThinkingSignature); // New

// New: Font size adjustment events
increaseFontSizeButton.addEventListener('click', increaseFontSize);
decreaseFontSizeButton.addEventListener('click', decreaseFontSize);
resetFontSizeButton.addEventListener('click', resetFontSize); // New: Reset font size button listener


messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent new line
        sendMessage();
    }
});
messageInput.addEventListener('input', adjustTextareaHeight);

// Initial setup on page load
document.addEventListener('DOMContentLoaded', () => {
    loadApiKeyFromLocalStorage(); // Load API key
    loadSystemInstructionFromLocalStorage(); // Load system instruction (pre-fills UI and global variable)
    loadSelectedModelFromLocalStorage(); // Load selected model
    loadThinkingConfigFromLocalStorage(); // Load thinking config (before updating visibility)
    loadSaveThoughtSignatureStateFromLocalStorage(); // Load thought signature checkbox state
    loadChatHistoryFromLocalStorage(); // Load chat history (or initialize with welcome)
    loadStatsFromLocalStorage(); // Load token and cost stats
    loadRawChatHistoryToggleStateFromLocalStorage(); // Load raw chat toggle state
    loadChatFontSizeFromLocalStorage(); // Load and apply font size
    
    renderChatHistory(); // Render the initial history (including welcome message) and update raw input
    adjustTextareaHeight(); // Adjust textarea height on page load

    // Set the initial selected model based on dropdown and update global variable
    updateSelectedModel(); // This will now also call updateThinkingControlsVisibility()
    renderTokenStats(); // Render initial token stats
    renderCostStats(); // Render initial cost stats

    // Ensure stop button is hidden and disabled on load
    stopMessageButton.disabled = true;
    stopMessageButton.classList.add('hidden');
});