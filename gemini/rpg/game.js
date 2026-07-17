document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextMovePromptTextarea = document.getElementById('nextMovePrompt');
    const gameHistoryTextarea = document.getElementById('gameHistory');
    const charactersThoughtsTextarea = document.getElementById('charactersThoughtsDisplay');
    const charactersReactionsContainer = document.getElementById('charactersReactionsContainer');
    const generateBtn = document.getElementById('generateBtn');
    const stopBtn = document.getElementById('stopBtn');
    const revertLastMoveBtn = document.getElementById('revertLastMoveBtn'); 
    const clearAllBtn = document.getElementById('clearAllBtn');
    const saveGameBtn = document.getElementById('saveGameBtn');
    const loadGameBtn = document.getElementById('loadGameBtn');
    const loadGameInput = document.getElementById('loadGameInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const clearNextMovePromptBtn = document.getElementById('clearNextMovePromptBtn');
    const resetSystemInstructionBtn = document.getElementById('resetSystemInstructionBtn');

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

    const defaultSystemInstruction = `You are a Game Master for a text-based RPG.
Describe the outcomes of the user's actions vividly and maintain a consistent world.
Keep responses relatively concise but engaging.
You should only simulate the world, not the player's action.
Your response should be the consequence of the player's action.
The response should be in the same language as the player's input.
If there are other characters (NPCs, companions, adversaries, or sentient beings) present in the current scene, determine their structured reactions and include them in "CHARACTERS_REACTIONS" (with each entry containing "name", "internal_thought", and "view_of_the_player"). If no other characters are present in the scene, return an empty list [].
IMPORTANT: You must return your response in a valid JSON structure strictly matching the following format:
{
  "STORY": "[Your description of what happens next]",
  "CHARACTERS_REACTIONS": [
    {
      "name": "[Character Name]",
      "internal_thought": "[Their secret internal thought or reaction to what just happened]",
      "view_of_the_player": "[Their current view, attitude, or perception of the player]"
    }
  ]
}`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('geminiApiKey') || ''; // Reuse API key from other tools
    modelSelect.value = localStorage.getItem('geminiRpgModel') || 'gemini-3-flash-preview';
    systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstruction') || defaultSystemInstruction;
    nextMovePromptTextarea.value = localStorage.getItem('geminiRpgNextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem('geminiRpgGameHistory') || ''; 
    
    function getCharactersReactionsFromDOM() {
        if (!charactersReactionsContainer) return [];
        const cards = charactersReactionsContainer.querySelectorAll('.character-reaction-card');
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

    function getCharactersReactionsTextForPrompt() {
        const list = getCharactersReactionsFromDOM();
        if (list.length === 0) return 'No other characters are present in the current scene.';
        return list.map(c => {
            const name = c.name || 'Character';
            const thought = c.internal_thought || 'None';
            const view = c.view_of_the_player || 'Neutral';
            return `${name}:\n  • Internal Thought: "${thought}"\n  • View of the Player: "${view}"`;
        }).join('\n\n');
    }

    function renderCharactersReactions(list) {
        if (!charactersReactionsContainer) return;
        charactersReactionsContainer.innerHTML = '';
        if (!list || !Array.isArray(list) || list.length === 0) {
            charactersReactionsContainer.innerHTML = '<div class="no-characters-message">No other characters are present in the current scene.</div>';
            localStorage.setItem('geminiRpgCharactersReactionsList', '[]');
            if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = 'No other characters are present in the current scene.';
            return;
        }

        list.forEach((char, idx) => {
            const card = document.createElement('div');
            card.className = 'character-reaction-card';

            const name = char.name || `Character ${idx + 1}`;
            const thought = char.internal_thought || char.internalThought || char.thought || '';
            const view = char.view_of_the_player || char.viewOfThePlayer || char.view_of_player || '';

            card.innerHTML = `
                <div class="collapsible-header character-header">
                    <div class="char-name-label">Character: <span class="char-name-display">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
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

            const headers = card.querySelectorAll('.collapsible-header');
            headers.forEach(header => {
                header.addEventListener('click', (e) => {
                    if (window.getSelection().toString().trim().length > 0) return;
                    const content = header.nextElementSibling;
                    if (content && content.classList.contains('collapsible-content')) {
                        const isCollapsed = content.classList.toggle('collapsed');
                        const icon = header.querySelector('.toggle-icon');
                        if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
                    }
                });
            });

            const inputs = card.querySelectorAll('textarea');
            inputs.forEach(input => {
                input.addEventListener('input', () => {
                    const currentList = getCharactersReactionsFromDOM();
                    localStorage.setItem('geminiRpgCharactersReactionsList', JSON.stringify(currentList));
                    if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
                });
            });

            charactersReactionsContainer.appendChild(card);
        });

        localStorage.setItem('geminiRpgCharactersReactionsList', JSON.stringify(getCharactersReactionsFromDOM()));
        if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
    }

    // Load saved reactions
    try {
        const savedListStr = localStorage.getItem('geminiRpgCharactersReactionsList');
        if (savedListStr) {
            renderCharactersReactions(JSON.parse(savedListStr));
        } else {
            renderCharactersReactions([]);
        }
    } catch (e) {
        renderCharactersReactions([]);
    }

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

    const toggleCharactersThoughts = document.getElementById('toggleCharactersThoughts');
    const charactersThoughtsContent = document.getElementById('charactersThoughtsContent');
    if (toggleCharactersThoughts && charactersThoughtsContent) {
        if (localStorage.getItem('geminiRpgCharactersCollapsed') === 'true') {
            charactersThoughtsContent.classList.add('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleCharactersThoughts.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = charactersThoughtsContent.classList.toggle('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgCharactersCollapsed', isCollapsed);
        });
    }

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem('geminiRpgNextMovePrompt');
    });

    if (resetSystemInstructionBtn) {
        resetSystemInstructionBtn.addEventListener('click', () => {
            if (confirm('Reset System Instruction to default?')) {
                systemInstructionTextarea.value = defaultSystemInstruction;
                localStorage.setItem('geminiRpgSystemInstruction', defaultSystemInstruction);
            }
        });
    }

    generateBtn.addEventListener('click', submitMove);
    revertLastMoveBtn.addEventListener('click', removeLastTurn);
    clearAllBtn.addEventListener('click', clearAllContents);
    saveGameBtn.addEventListener('click', saveGame);
    loadGameBtn.addEventListener('click', () => loadGameInput.click());
    loadGameInput.addEventListener('change', loadGame);

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
        renderCharactersReactions([]);

        revertLastMoveBtn.disabled = true;

        localStorage.removeItem('geminiRpgModel');
        localStorage.removeItem('geminiRpgSystemInstruction');
        localStorage.removeItem('geminiRpgNextMovePrompt');
        localStorage.removeItem('geminiRpgGameHistory'); 
        localStorage.removeItem('geminiRpgCharactersReactionsList');
        localStorage.removeItem('geminiRpgCharactersCollapsed');
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
            if (parts.length >= 2 && parts[parts.length - 2].startsWith('>')) {
                parts.pop(); // Remove DM response
                parts.pop(); // Remove User move
            } else {
                parts.pop(); 
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
        const charactersThoughts = getCharactersReactionsTextForPrompt();
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
            userPrompt = `Start a new adventure. The setting is: ${nextMove || 'A mysterious fantasy world.'}`;
        } else {
            userPrompt = `Complete game history log so far:\n\n${currentHistory}\n\nCharacters' reaction in current scene:\n${charactersThoughts}\n\nMy next move: ${nextMove}\n\nWhat happens next? Remember to output ONLY a valid JSON object strictly with keys "STORY" and "CHARACTERS_REACTIONS".`;
        }
        
        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
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

        const apiUrl = `${GEMINI_API_BASE_URL}${selectedModel}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBodyString,
                signal: signal,
            });

            if (!response.ok) {
                const errorData = await response.json();
                appendDebugLog(apiUrl, requestBodyString, errorData);
                throw new Error(errorData.error ? errorData.error.message : response.statusText);
            }

            const data = await response.json();
            appendDebugLog(apiUrl, requestBodyString, data);

            const responseText = data.candidates[0]?.content?.parts[0]?.text || '{}';
            
            let storyPart = '';
            let charactersReactionsList = [];

            try {
                const parsedJson = JSON.parse(responseText.trim().replace(/^```json\s*|```$/g, ''));
                storyPart = (parsedJson.STORY || parsedJson.story || '').trim();
                const rawReactions = parsedJson.CHARACTERS_REACTIONS || parsedJson.characters_reactions || parsedJson.charactersReactions || parsedJson.CHARACTERS_THOUGHTS || parsedJson.characters_thoughts || parsedJson.charactersThoughts;
                if (Array.isArray(rawReactions)) {
                    charactersReactionsList = rawReactions;
                } else if (typeof rawReactions === 'string') {
                    charactersReactionsList = [{ name: 'Character', internal_thought: rawReactions, view_of_the_player: 'Neutral' }];
                }
            } catch (jsonError) {
                console.warn('Failed to parse JSON response directly in submitMove, falling back to regex parsing:', jsonError);
                const storyMatch = responseText.match(/"STORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/STORY:\s*([\s\S]*?)(?=CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|SHORT_TERM_MEMORY:|LONG_TERM_MEMORY:|$)/i);
                if (storyMatch) storyPart = storyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                else storyPart = responseText.trim();
            }

            const promptTokens = data.usageMetadata?.promptTokenCount || 0;
            const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);

            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (storyPart) {
                renderCharactersReactions(charactersReactionsList);

                const movePrefix = nextMove ? `> ${nextMove}\n\n` : '';
                if (gameHistoryTextarea.value.trim() === '') {
                    gameHistoryTextarea.value = movePrefix + storyPart;
                } else {
                    gameHistoryTextarea.value += '\n\n' + movePrefix + storyPart;
                }
                localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
                gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
                
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
                appendDebugLog(apiUrl, requestBodyString, error);
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

    function appendDebugLog(url, requestBodyString, responseOrError) {
        let maskedUrl = url;
        try {
            const urlObj = new URL(url);
            if (urlObj.searchParams.has('key')) {
                urlObj.searchParams.set('key', 'REDACTED');
            }
            maskedUrl = urlObj.toString();
        } catch (e) {
            console.error('Error masking URL:', e);
        }

        geminiLogs.push({
            timestamp: new Date().toLocaleString(),
            url: maskedUrl,
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
                <details><summary><strong>Request #${index + 1}</strong> (${log.timestamp})</summary>
                    <p><strong>URL:</strong> <code>${log.url}</code></p>
                    <strong>Body:</strong>
                    <pre>${JSON.stringify(log.request, null, 2)}</pre>
                </details>
                <details><summary><strong>Response #${index + 1}</strong></summary>
                    <pre>${JSON.stringify(log.response instanceof Error ? {error: log.response.message} : log.response, null, 2)}</pre>
                </details>
            `;
            debugLogsContainer.appendChild(logEntryDiv);
        });
        debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight;
    }

    function saveGame() {
        const gameState = {
            gameHistory: gameHistoryTextarea.value,
            charactersReactions: getCharactersReactionsFromDOM(),
            systemInstruction: systemInstructionTextarea.value,
            model: modelSelect.value
        };

        const jsonString = JSON.stringify(gameState, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        const filename = `rpg_save_${timestamp}.json`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    function loadGame(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const gameState = JSON.parse(e.target.result);
                
                if (gameState.gameHistory === undefined) {
                    throw new Error('Invalid save file format.');
                }

                gameHistoryTextarea.value = gameState.gameHistory || '';
                if (gameState.charactersReactions && Array.isArray(gameState.charactersReactions)) {
                    renderCharactersReactions(gameState.charactersReactions);
                } else {
                    renderCharactersReactions([]);
                }
                
                if (gameState.systemInstruction !== undefined) {
                    systemInstructionTextarea.value = gameState.systemInstruction;
                }
                if (gameState.model !== undefined) {
                    modelSelect.value = gameState.model;
                }

                localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
                if (gameState.systemInstruction !== undefined) {
                    localStorage.setItem('geminiRpgSystemInstruction', systemInstructionTextarea.value);
                }
                if (gameState.model !== undefined) {
                    localStorage.setItem('geminiRpgModel', modelSelect.value);
                }

                revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
                showError('');
                alert('Game loaded successfully!');
            } catch (err) {
                showError(`Failed to load game: ${err.message}`);
            }
            loadGameInput.value = '';
        };
        reader.readAsText(file);
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
