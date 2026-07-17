document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextMovePromptTextarea = document.getElementById('nextMovePrompt');
    const gameHistoryTextarea = document.getElementById('gameHistory');
    const charactersThoughtsTextarea = document.getElementById('charactersThoughtsDisplay');
    const charactersReactionsContainer = document.getElementById('charactersReactionsContainer');
    const shortTermMemoryTextarea = document.getElementById('shortTermMemoryDisplay');
    const longTermMemoryTextarea = document.getElementById('longTermMemoryDisplay');
    const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');
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
    let totalAccumulatedInputTokens = parseInt(localStorage.getItem('geminiRpgImprovedAccumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem('geminiRpgImprovedAccumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    
    // Load accumulated cost
    let totalAccumulatedCost = parseFloat(localStorage.getItem('geminiRpgImprovedAccumulatedCost') || '0');

    const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

    const defaultSystemInstruction = `You are a Game Master for a text-based RPG with short-term and long-term memory.
Describe the outcomes of the user's actions vividly and maintain a consistent world.
Keep responses relatively concise but engaging.
You should only simulate the world, not the player's action.
Your response should be the consequence of the player's action.
The response should be in the same language as the player's input.
If there are other characters (NPCs, companions, adversaries, or sentient beings) present in the short term memory or current scene, determine their structured reactions and include them in "CHARACTERS_REACTIONS" (with each entry containing "name", "internal_thought", and "view_of_the_player"). If no other characters are present in the scene, return an empty list [].
IMPORTANT: You must return your response in a valid JSON structure strictly matching the following format:
{
  "STORY": "[Your description of what happens next]",
  "CHARACTERS_REACTIONS": [
    {
      "name": "[Character Name]",
      "internal_thought": "[Their secret internal thought or reaction to what just happened]",
      "view_of_the_player": "[Their current view, attitude, or perception of the player]"
    }
  ],
  "SHORT_TERM_MEMORY": "[A concise summary of the recent few iterations (last 3-5 turns), capturing key immediate events, current situation, and recent details]",
  "LONG_TERM_MEMORY": "[A comprehensive summary of the whole previous game so far, capturing overarching plot points, world state, relationships, and key milestones. Crucially, it must keep a short description of all previous key milestones and must not forget them. You can rephrase and combine previous milestones to keep the summary concise, but never remove key milestones from the long term memory]"
}`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
    modelSelect.value = localStorage.getItem('geminiRpgImprovedModel') || 'gemini-3-flash-preview';
    systemInstructionTextarea.value = localStorage.getItem('geminiRpgImprovedSystemInstruction') || defaultSystemInstruction;
    nextMovePromptTextarea.value = localStorage.getItem('geminiRpgImprovedNextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem('geminiRpgImprovedGameHistory') || ''; 
    shortTermMemoryTextarea.value = localStorage.getItem('geminiRpgImprovedShortTermMemory') || '';
    longTermMemoryTextarea.value = localStorage.getItem('geminiRpgImprovedLongTermMemory') || '';
    
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
            localStorage.setItem('geminiRpgImprovedCharactersReactionsList', '[]');
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
                    localStorage.setItem('geminiRpgImprovedCharactersReactionsList', JSON.stringify(currentList));
                    if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
                });
            });

            charactersReactionsContainer.appendChild(card);
        });

        localStorage.setItem('geminiRpgImprovedCharactersReactionsList', JSON.stringify(getCharactersReactionsFromDOM()));
        if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
    }

    // Load initial character reactions
    try {
        const savedListStr = localStorage.getItem('geminiRpgImprovedCharactersReactionsList');
        if (savedListStr) {
            renderCharactersReactions(JSON.parse(savedListStr));
        } else {
            const oldStr = localStorage.getItem('geminiRpgImprovedCharactersThoughts');
            if (oldStr && oldStr !== 'No other characters are present in the current scene.') {
                renderCharactersReactions([{ name: 'Character', internal_thought: oldStr, view_of_the_player: 'Neutral' }]);
            } else {
                renderCharactersReactions([]);
            }
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
    modelSelect.addEventListener('change', () => localStorage.setItem('geminiRpgImprovedModel', modelSelect.value));
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem('geminiRpgImprovedSystemInstruction', systemInstructionTextarea.value));
    nextMovePromptTextarea.addEventListener('input', () => localStorage.setItem('geminiRpgImprovedNextMovePrompt', nextMovePromptTextarea.value));
    
    gameHistoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgImprovedGameHistory', gameHistoryTextarea.value);
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
    });

    charactersThoughtsTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgImprovedCharactersThoughts', charactersThoughtsTextarea.value);
    });

    shortTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgImprovedShortTermMemory', shortTermMemoryTextarea.value);
    });

    longTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgImprovedLongTermMemory', longTermMemoryTextarea.value);
    });

    const toggleLongTermMemory = document.getElementById('toggleLongTermMemory');
    const longTermMemoryContent = document.getElementById('longTermMemoryContent');
    if (toggleLongTermMemory && longTermMemoryContent) {
        if (localStorage.getItem('geminiRpgImprovedLongTermCollapsed') === 'true') {
            longTermMemoryContent.classList.add('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleLongTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = longTermMemoryContent.classList.toggle('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgImprovedLongTermCollapsed', isCollapsed);
        });
    }

    const toggleShortTermMemory = document.getElementById('toggleShortTermMemory');
    const shortTermMemoryContent = document.getElementById('shortTermMemoryContent');
    if (toggleShortTermMemory && shortTermMemoryContent) {
        if (localStorage.getItem('geminiRpgImprovedShortTermCollapsed') === 'true') {
            shortTermMemoryContent.classList.add('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleShortTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = shortTermMemoryContent.classList.toggle('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgImprovedShortTermCollapsed', isCollapsed);
        });
    }

    const toggleCharactersThoughts = document.getElementById('toggleCharactersThoughts');
    const charactersThoughtsContent = document.getElementById('charactersThoughtsContent');
    if (toggleCharactersThoughts && charactersThoughtsContent) {
        if (localStorage.getItem('geminiRpgImprovedCharactersCollapsed') === 'true') {
            charactersThoughtsContent.classList.add('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleCharactersThoughts.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = charactersThoughtsContent.classList.toggle('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgImprovedCharactersCollapsed', isCollapsed);
        });
    }

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem('geminiRpgImprovedNextMovePrompt');
    });

    if (resetSystemInstructionBtn) {
        resetSystemInstructionBtn.addEventListener('click', () => {
            if (confirm('Reset System Instruction to default?')) {
                systemInstructionTextarea.value = defaultSystemInstruction;
                localStorage.setItem('geminiRpgImprovedSystemInstruction', defaultSystemInstruction);
            }
        });
    }

    generateBtn.addEventListener('click', submitMove);
    refreshMemoriesBtn.addEventListener('click', refreshMemories);
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
        refreshMemoriesBtn.disabled = false;
        stopBtn.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
        loadingIndicator.textContent = 'Gemini is thinking...';
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
        shortTermMemoryTextarea.value = '';
        longTermMemoryTextarea.value = '';

        revertLastMoveBtn.disabled = true;

        localStorage.removeItem('geminiRpgImprovedModel');
        localStorage.removeItem('geminiRpgImprovedSystemInstruction');
        localStorage.removeItem('geminiRpgImprovedNextMovePrompt');
        localStorage.removeItem('geminiRpgImprovedGameHistory'); 
        localStorage.removeItem('geminiRpgImprovedCharactersThoughts');
        localStorage.removeItem('geminiRpgImprovedCharactersReactionsList');
        localStorage.removeItem('geminiRpgImprovedShortTermMemory');
        localStorage.removeItem('geminiRpgImprovedLongTermMemory');
        localStorage.removeItem('geminiRpgImprovedAccumulatedInputTokens'); 
        localStorage.removeItem('geminiRpgImprovedAccumulatedOutputTokens'); 
        localStorage.removeItem('geminiRpgImprovedAccumulatedCost');

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
            localStorage.setItem('geminiRpgImprovedGameHistory', gameHistoryTextarea.value);
            revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
            gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
        } else {
            gameHistoryTextarea.value = '';
            localStorage.setItem('geminiRpgImprovedGameHistory', '');
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
        const shortTermMemory = shortTermMemoryTextarea.value.trim();
        const longTermMemory = longTermMemoryTextarea.value.trim();
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
        if (currentHistory === '' && shortTermMemory === '' && longTermMemory === '') {
            userPrompt = `Start a new adventure. The setting is: ${nextMove || 'A mysterious realm.'}`;
        } else {
            userPrompt = `Long Term Memory (Summary of the whole previous game):\n${longTermMemory || 'None yet.'}\n\nShort Term Memory (Summary of recent few iterations):\n${shortTermMemory || 'None yet.'}\n\nCharacters' reaction (Current Scene):\n${charactersThoughts || 'No other characters are present in the current scene.'}\n\nMy next move: ${nextMove}\n\nWhat happens next? Remember to output ONLY a valid JSON object strictly with keys "STORY", "CHARACTERS_REACTIONS", "SHORT_TERM_MEMORY", and "LONG_TERM_MEMORY".`;
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
            let shortTermPart = '';
            let longTermPart = '';
            let charactersReactionsList = [];

            try {
                const parsedJson = JSON.parse(responseText.trim().replace(/^```json\s*|```$/g, ''));
                storyPart = (parsedJson.STORY || parsedJson.story || '').trim();
                shortTermPart = (parsedJson.SHORT_TERM_MEMORY || parsedJson.short_term_memory || parsedJson.shortTermMemory || '').trim();
                longTermPart = (parsedJson.LONG_TERM_MEMORY || parsedJson.long_term_memory || parsedJson.longTermMemory || '').trim();
                const rawReactions = parsedJson.CHARACTERS_REACTIONS || parsedJson.characters_reactions || parsedJson.charactersReactions || parsedJson.CHARACTERS_THOUGHTS || parsedJson.characters_thoughts || parsedJson.charactersThoughts;
                if (Array.isArray(rawReactions)) {
                    charactersReactionsList = rawReactions;
                } else if (typeof rawReactions === 'string') {
                    charactersReactionsList = [{ name: 'Character', internal_thought: rawReactions, view_of_the_player: 'Neutral' }];
                }
            } catch (jsonError) {
                console.warn('Failed to parse JSON response directly in submitMove, falling back to regex parsing:', jsonError);
                const storyMatch = responseText.match(/"STORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/STORY:\s*([\s\S]*?)(?=CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|SHORT_TERM_MEMORY:|LONG_TERM_MEMORY:|$)/i);
                const shortTermMatch = responseText.match(/"SHORT_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/SHORT_TERM_MEMORY:\s*([\s\S]*?)(?=STORY:|CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|LONG_TERM_MEMORY:|$)/i);
                const longTermMatch = responseText.match(/"LONG_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/LONG_TERM_MEMORY:\s*([\s\S]*?)(?=STORY:|CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|SHORT_TERM_MEMORY:|$)/i);

                if (storyMatch) storyPart = storyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                else storyPart = responseText.trim();
                if (shortTermMatch) shortTermPart = shortTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                if (longTermMatch) longTermPart = longTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
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
                localStorage.setItem('geminiRpgImprovedGameHistory', gameHistoryTextarea.value);
                gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
                
                if (shortTermPart) {
                    shortTermMemoryTextarea.value = shortTermPart;
                    localStorage.setItem('geminiRpgImprovedShortTermMemory', shortTermPart);
                }

                if (longTermPart) {
                    longTermMemoryTextarea.value = longTermPart;
                    localStorage.setItem('geminiRpgImprovedLongTermMemory', longTermPart);
                }

                nextMovePromptTextarea.value = '';
                localStorage.removeItem('geminiRpgImprovedNextMovePrompt');
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

    async function refreshMemories() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const currentHistory = gameHistoryTextarea.value.trim();

        if (!apiKey) {
            showError('Please enter your Gemini API Key.');
            return;
        }

        if (!currentHistory) {
            shortTermMemoryTextarea.value = '';
            longTermMemoryTextarea.value = '';
            localStorage.removeItem('geminiRpgImprovedShortTermMemory');
            localStorage.removeItem('geminiRpgImprovedLongTermMemory');
            return;
        }

        if (abortController) {
            showError('Another action is already in progress.');
            return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        refreshMemoriesBtn.disabled = true;
        generateBtn.disabled = true;
        loadingIndicator.textContent = 'Summarizing history to memories...';
        loadingIndicator.classList.remove('hidden');
        showError('');

        const userPrompt = `Please read the following complete RPG game history and generate two memory summaries in a valid JSON object strictly with the keys "SHORT_TERM_MEMORY" and "LONG_TERM_MEMORY":\n\n${currentHistory}\n\nIMPORTANT: You must return ONLY a valid JSON object strictly matching the following format:\n{\n  "SHORT_TERM_MEMORY": "[A concise summary of the recent few iterations (last 3-5 turns), capturing key immediate events, current situation, and recent details]",\n  "LONG_TERM_MEMORY": "[A comprehensive summary of the whole previous game so far, capturing overarching plot points, world state, relationships, and key milestones. Crucially, it must keep a short description of all previous key milestones and must not forget them. You can rephrase and combine previous milestones to keep the summary concise, but never remove key milestones from the long term memory]"\n}`;

        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }]
            }],
            generationConfig: {
                temperature: 0.5,
                responseMimeType: "application/json"
            }
        };

        const apiUrl = `${GEMINI_API_BASE_URL}${selectedModel}:generateContent?key=${apiKey}`;
        const requestBodyString = JSON.stringify(requestBody);

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

            let shortTermPart = '';
            let longTermPart = '';

            try {
                const parsedJson = JSON.parse(responseText.trim().replace(/^```json\s*|```$/g, ''));
                shortTermPart = (parsedJson.SHORT_TERM_MEMORY || parsedJson.short_term_memory || parsedJson.shortTermMemory || '').trim();
                longTermPart = (parsedJson.LONG_TERM_MEMORY || parsedJson.long_term_memory || parsedJson.longTermMemory || '').trim();
            } catch (jsonError) {
                console.warn('Failed to parse JSON response directly in refreshMemories, falling back to regex parsing:', jsonError);
                const shortTermMatch = responseText.match(/"SHORT_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/SHORT_TERM_MEMORY:\s*([\s\S]*?)(?=LONG_TERM_MEMORY:|$)/i);
                const longTermMatch = responseText.match(/"LONG_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/LONG_TERM_MEMORY:\s*([\s\S]*?)(?=SHORT_TERM_MEMORY:|$)/i);
                if (shortTermMatch) shortTermPart = shortTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                if (longTermMatch) longTermPart = longTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
            }

            const promptTokens = data.usageMetadata?.promptTokenCount || 0;
            const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0;
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);
            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (shortTermPart) {
                shortTermMemoryTextarea.value = shortTermPart;
                localStorage.setItem('geminiRpgImprovedShortTermMemory', shortTermPart);
            }
            if (longTermPart) {
                longTermMemoryTextarea.value = longTermPart;
                localStorage.setItem('geminiRpgImprovedLongTermMemory', longTermPart);
            }

            alert('Memories successfully refreshed from game history!');
        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                showError('Stopped by user.');
            } else {
                showError(`Error refreshing memories: ${error.message}`);
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

        localStorage.setItem('geminiRpgImprovedAccumulatedInputTokens', totalAccumulatedInputTokens.toString());
        localStorage.setItem('geminiRpgImprovedAccumulatedOutputTokens', totalAccumulatedOutputTokens.toString());
        localStorage.setItem('geminiRpgImprovedAccumulatedCost', totalAccumulatedCost.toString());
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
            charactersThoughts: getCharactersReactionsTextForPrompt(),
            shortTermMemory: shortTermMemoryTextarea.value,
            longTermMemory: longTermMemoryTextarea.value,
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
        const filename = `rpg_improved_save_${timestamp}.json`;

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
                } else if (typeof gameState.charactersThoughts === 'string' && gameState.charactersThoughts.trim() && gameState.charactersThoughts !== 'No other characters are present in the current scene.') {
                    renderCharactersReactions([{ name: 'Character', internal_thought: gameState.charactersThoughts, view_of_the_player: 'Neutral' }]);
                } else {
                    renderCharactersReactions([]);
                }
                shortTermMemoryTextarea.value = gameState.shortTermMemory || '';
                longTermMemoryTextarea.value = gameState.longTermMemory || '';
                
                if (gameState.systemInstruction !== undefined) {
                    systemInstructionTextarea.value = gameState.systemInstruction;
                }
                if (gameState.model !== undefined) {
                    modelSelect.value = gameState.model;
                }

                localStorage.setItem('geminiRpgImprovedGameHistory', gameHistoryTextarea.value);
                localStorage.setItem('geminiRpgImprovedCharactersThoughts', charactersThoughtsTextarea.value);
                localStorage.setItem('geminiRpgImprovedShortTermMemory', shortTermMemoryTextarea.value);
                localStorage.setItem('geminiRpgImprovedLongTermMemory', longTermMemoryTextarea.value);
                if (gameState.systemInstruction !== undefined) {
                    localStorage.setItem('geminiRpgImprovedSystemInstruction', systemInstructionTextarea.value);
                }
                if (gameState.model !== undefined) {
                    localStorage.setItem('geminiRpgImprovedModel', modelSelect.value);
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
