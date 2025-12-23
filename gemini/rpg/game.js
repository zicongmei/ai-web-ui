document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextMovePromptTextarea = document.getElementById('nextMovePrompt');
    const gameHistoryTextarea = document.getElementById('gameHistory');
    const inventoryDisplayTextarea = document.getElementById('inventoryDisplay');
    const generateBtn = document.getElementById('generateBtn');
    const stopBtn = document.getElementById('stopBtn');
    const revertLastMoveBtn = document.getElementById('revertLastMoveBtn'); 
    const clearAllBtn = document.getElementById('clearAllBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const clearNextMovePromptBtn = document.getElementById('clearNextMovePromptBtn');

    // Token display elements
    const currentRequestInputTokensDisplay = document.getElementById('currentRequestInputTokens');
    const currentRequestOutputTokensDisplay = document.getElementById('currentRequestOutputTokens');
    const accumulatedInputTokensDisplay = document.getElementById('accumulatedInputTokens'); 
    const accumulatedOutputTokensDisplay = document.getElementById('accumulatedOutputTokens'); 
    const accumulatedTokensDisplay = document.getElementById('accumulatedTokens'); 
    
    // Cost display elements
    const currentRequestCostDisplay = document.getElementById('currentRequestCost');
    const accumulatedCostDisplay = document.getElementById('accumulatedCost');

    // Debug elements
    const debugToggleBtn = document.getElementById('debugToggleBtn');
    const debugPanel = document.getElementById('debugPanel');
    const debugLogsContainer = document.getElementById('debugLogs');
    const clearDebugLogsBtn = document.getElementById('clearDebugLogsBtn');

    // Global array to store request/response pairs for debugging
    const geminiLogs = [];

    // Global AbortController for stopping fetch requests
    let abortController = null;

    // Load accumulated tokens from localStorage
    let totalAccumulatedInputTokens = parseInt(localStorage.getItem('geminiRpgAccumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem('geminiRpgAccumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    
    // Load accumulated cost
    let totalAccumulatedCost = parseFloat(localStorage.getItem('geminiRpgAccumulatedCost') || '0');

    const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

    const defaultSystemInstruction = `You are a Dungeon Master for a text-based RPG.
Describe the outcomes of the user's actions vividly and maintain a consistent world.
Keep responses relatively concise but engaging.
IMPORTANT: You must return your response in the following format:
STORY: [Your description of what happens next]
INVENTORY: [A comma-separated list of ALL items the player currently has in their inventory]`

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('geminiApiKey') || ''; // Reuse API key from other tools
    modelSelect.value = localStorage.getItem('geminiRpgModel') || 'gemini-3-flash-preview';
    systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstruction') || defaultSystemInstruction;
    nextMovePromptTextarea.value = localStorage.getItem('geminiRpgNextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem('geminiRpgGameHistory') || ''; 
    inventoryDisplayTextarea.value = localStorage.getItem('geminiRpgInventory') || 'Empty';
    
    // Display loaded accumulated tokens
    accumulatedInputTokensDisplay.textContent = totalAccumulatedInputTokens;
    accumulatedOutputTokensDisplay.textContent = totalAccumulatedOutputTokens;
    if (accumulatedTokensDisplay) { 
        accumulatedTokensDisplay.textContent = totalAccumulatedTokens;
    }
    // Display loaded accumulated cost
    if (accumulatedCostDisplay) {
        accumulatedCostDisplay.textContent = `$${totalAccumulatedCost.toFixed(6)}`;
    }

    // Initialize button state
    revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();

    // Save settings to localStorage on change
    apiKeyInput.addEventListener('input', () => localStorage.setItem('geminiApiKey', apiKeyInput.value));
    modelSelect.addEventListener('change', () => localStorage.setItem('geminiRpgModel', modelSelect.value));
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem('geminiRpgSystemInstruction', systemInstructionTextarea.value));
    nextMovePromptTextarea.addEventListener('input', () => localStorage.setItem('geminiRpgNextMovePrompt', nextMovePromptTextarea.value));
    
    gameHistoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
    });

    inventoryDisplayTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgInventory', inventoryDisplayTextarea.value);
    });

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem('geminiRpgNextMovePrompt');
    });

    generateBtn.addEventListener('click', submitMove);
    revertLastMoveBtn.addEventListener('click', removeLastTurn);
    clearAllBtn.addEventListener('click', clearAllContents);

    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            showError('Action stopped by user.');
            resetUI();
        }
    });

    debugToggleBtn.addEventListener('click', () => {
        debugPanel.classList.toggle('hidden');
        if (!debugPanel.classList.contains('hidden')) {
            debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight;
        }
    });

    clearDebugLogsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all debug logs?')) {
            geminiLogs.length = 0;
            debugLogsContainer.innerHTML = '';
        }
    });

    function resetUI() {
        generateBtn.disabled = false;
        generateBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
        abortController = null;
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
    }

    function clearAllContents() {
        if (!confirm('Are you sure you want to clear all contents and settings? This cannot be undone.')) {
            return;
        }

        modelSelect.value = 'gemini-3-flash-preview'; 
        systemInstructionTextarea.value = defaultSystemInstruction; 
        nextMovePromptTextarea.value = '';
        gameHistoryTextarea.value = '';
        inventoryDisplayTextarea.value = 'Empty';

        revertLastMoveBtn.disabled = true;

        localStorage.removeItem('geminiRpgModel');
        localStorage.removeItem('geminiRpgSystemInstruction');
        localStorage.removeItem('geminiRpgNextMovePrompt');
        localStorage.removeItem('geminiRpgGameHistory'); 
        localStorage.removeItem('geminiRpgInventory');
        localStorage.removeItem('geminiRpgAccumulatedInputTokens'); 
        localStorage.removeItem('geminiRpgAccumulatedOutputTokens'); 
        localStorage.removeItem('geminiRpgAccumulatedCost');

        totalAccumulatedInputTokens = 0; 
        totalAccumulatedOutputTokens = 0; 
        totalAccumulatedTokens = 0; 
        totalAccumulatedCost = 0;

        currentRequestInputTokensDisplay.textContent = '0';
        currentRequestOutputTokensDisplay.textContent = '0';
        accumulatedInputTokensDisplay.textContent = '0';
        accumulatedOutputTokensDisplay.textContent = '0';
        if (accumulatedTokensDisplay) accumulatedTokensDisplay.textContent = '0';
        if (currentRequestCostDisplay) currentRequestCostDisplay.textContent = '$0.000000';
        if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = '$0.000000';

        showError(''); 
    }

    function removeLastTurn() {
        let currentHistory = gameHistoryTextarea.value.trim();
        if (!currentHistory) {
            revertLastMoveBtn.disabled = true;
            return;
        }

        let parts = currentHistory.split(/\n\n/).map(p => p.trim()).filter(p => p !== '');

        if (parts.length > 0) {
            // A "turn" usually consists of the user's move (starts with '>') and the DM response.
            // If the last part doesn't start with '>', it's likely a DM response.
            // We should remove it AND the part before it if that part is a user move.
            
            if (parts.length >= 2 && parts[parts.length - 2].startsWith('>')) {
                parts.pop(); // Remove DM response
                parts.pop(); // Remove User move
            } else {
                parts.pop(); // Just remove the last thing if it doesn't fit the pattern
            }
            
            gameHistoryTextarea.value = parts.join('\n\n');
            localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
            revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
            gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
        } else {
            gameHistoryTextarea.value = '';
            localStorage.setItem('geminiRpgGameHistory', '');
            revertLastMoveBtn.disabled = true;
        }
    }

    function calculateRequestCost(model, inputTokens, outputTokens) {
        const pricingConfig = GEMINI_PRICING_CONFIG.TEXT[model];
        if (!pricingConfig) return 0;
        const { inputRate, outputRate } = pricingConfig.getPricing(inputTokens);
        return (inputTokens * inputRate) + (outputTokens * outputRate);
    }

    async function submitMove() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const systemInstruction = systemInstructionTextarea.value.trim();
        const currentHistory = gameHistoryTextarea.value.trim();
        const inventory = inventoryDisplayTextarea.value.trim();
        const nextMove = nextMovePromptTextarea.value.trim();

        if (!apiKey) {
            showError('Please enter your Gemini API Key.');
            return;
        }
        
        if (abortController) {
            showError('Another action is already in progress.');
            return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        generateBtn.disabled = true;
        generateBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        revertLastMoveBtn.disabled = true;
        loadingIndicator.classList.remove('hidden');
        showError(''); 

        currentRequestInputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestOutputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestCostDisplay.textContent = 'Calculating...';
        
        let userPrompt = '';
        if (currentHistory === '') {
            userPrompt = `Start a new adventure. The setting is: ${nextMove}\n\nMy current inventory: ${inventory}`;
        } else {
            userPrompt = `Game History So Far:\n${currentHistory}\n\nMy current inventory: ${inventory}\n\nMy next move: ${nextMove}\n\nWhat happens next? Update the inventory if I picked up or lost any items.`;
        }
        
        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                topP: 1,
                topK: 1,
            },
            safetySettings:[{category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF'}, 
                            {category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF'}, 
                            {category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF'}, 
                            {category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF'}]
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const requestBodyString = JSON.stringify(requestBody);

        try {
            const response = await fetch(`${GEMINI_API_BASE_URL}${selectedModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBodyString,
                signal: signal,
            });

            if (!response.ok) {
                const errorData = await response.json();
                appendDebugLog(requestBodyString, errorData);
                throw new Error(errorData.error ? errorData.error.message : response.statusText);
            }

            const data = await response.json();
            appendDebugLog(requestBodyString, data);

            const responseText = data.candidates[0]?.content?.parts[0]?.text || '';
            
            // Parsing the response
            let storyPart = '';
            let inventoryPart = '';

            const storyMatch = responseText.match(/STORY:([\s\S]*?)(?=INVENTORY:|$)/i);
            const inventoryMatch = responseText.match(/INVENTORY:([\s\S]*)/i);

            if (storyMatch) {
                storyPart = storyMatch[1].trim();
            } else {
                storyPart = responseText.trim(); // Fallback if format is not strictly followed
            }

            if (inventoryMatch) {
                inventoryPart = inventoryMatch[1].trim();
            }

            const promptTokens = data.usageMetadata?.promptTokenCount || 0;
            const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);

            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (storyPart) {
                const movePrefix = nextMove ? `> ${nextMove}\n\n` : '';
                if (gameHistoryTextarea.value.trim() === '') {
                    gameHistoryTextarea.value = movePrefix + storyPart;
                } else {
                    gameHistoryTextarea.value += '\n\n' + movePrefix + storyPart;
                }
                localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
                gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
                
                if (inventoryPart) {
                    inventoryDisplayTextarea.value = inventoryPart;
                    localStorage.setItem('geminiRpgInventory', inventoryPart);
                }

                nextMovePromptTextarea.value = '';
                localStorage.removeItem('geminiRpgNextMovePrompt');
            } else {
                showError('No content generated. Check safety filters or model response.');
            }

        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                showError('Stopped by user.');
            } else {
                showError(`Error: ${error.message}`);
            }
        } finally {
            resetUI();
        }
    }

    function updateTokensAndCost(promptTokens, candidateTokens, requestCost) {
        currentRequestInputTokensDisplay.textContent = promptTokens;
        currentRequestOutputTokensDisplay.textContent = candidateTokens;
        currentRequestCostDisplay.textContent = `$${requestCost.toFixed(6)}`;
        
        totalAccumulatedInputTokens += promptTokens;
        totalAccumulatedOutputTokens += candidateTokens;
        totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens; 
        totalAccumulatedCost += requestCost;

        accumulatedInputTokensDisplay.textContent = totalAccumulatedInputTokens;
        accumulatedOutputTokensDisplay.textContent = totalAccumulatedOutputTokens;
        if (accumulatedTokensDisplay) accumulatedTokensDisplay.textContent = totalAccumulatedTokens;
        if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = `$${totalAccumulatedCost.toFixed(6)}`;

        localStorage.setItem('geminiRpgAccumulatedInputTokens', totalAccumulatedInputTokens.toString());
        localStorage.setItem('geminiRpgAccumulatedOutputTokens', totalAccumulatedOutputTokens.toString());
        localStorage.setItem('geminiRpgAccumulatedCost', totalAccumulatedCost.toString());
    }

    function appendDebugLog(requestBodyString, responseOrError) {
        geminiLogs.push({
            timestamp: new Date().toLocaleString(),
            request: JSON.parse(requestBodyString),
            response: responseOrError
        });
        renderDebugLogs();
    }

    function renderDebugLogs() {
        debugLogsContainer.innerHTML = '';
        geminiLogs.forEach((log, index) => {
            const logEntryDiv = document.createElement('div');
            logEntryDiv.classList.add('debug-log-entry');
            logEntryDiv.innerHTML = `
                <details><summary><strong>Request #${index + 1}</strong> (${log.timestamp})</summary><pre>${JSON.stringify(log.request, null, 2)}</pre></details>
                <details><summary><strong>Response #${index + 1}</strong></summary><pre>${JSON.stringify(log.response instanceof Error ? {error: log.response.message} : log.response, null, 2)}</pre></details>
            `;
            debugLogsContainer.appendChild(logEntryDiv);
        });
        debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight;
    }

    function showError(message) {
        if (message) {
            errorDisplay.textContent = message;
            errorDisplay.classList.remove('hidden');
        } else {
            errorDisplay.textContent = '';
            errorDisplay.classList.add('hidden');
        }
    }
});
