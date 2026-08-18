document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextMovePromptTextarea = document.getElementById('nextMovePrompt');
    const gameHistoryTextarea = document.getElementById('gameHistory');
    const charactersThoughtsTextarea = document.getElementById('charactersThoughtsDisplay');
    const charactersReactionsContainer = document.getElementById('charactersReactionsContainer');
    const targetWordCountInput = document.getElementById('targetWordCount');
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

    // Memory elements
    const useMemoryCheckbox = document.getElementById('useMemoryCheckbox');
    const memorySection = document.getElementById('memorySection');
    const shortTermMemoryTextarea = document.getElementById('shortTermMemoryDisplay');
    const longTermMemoryTextarea = document.getElementById('longTermMemoryDisplay');
    const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');

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

    const defaultSystemInstructionNoMemory = `You are a Game Master for a text-based RPG.
Describe the outcomes of the user's actions vividly and maintain a consistent world.
Keep responses relatively engaging.
You should only simulate the world, not the player's action.
Your response should be the consequence of the player's action.
The response should be in the same language as the player's input.
If there are other characters (NPCs, companions, adversaries, or sentient beings) present in the current scene, determine their structured reactions and include them in "CHARACTERS_REACTIONS" (with each entry containing "name", "internal_thought", and "view_of_the_player").
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

    const defaultSystemInstructionWithMemory = `You are a Game Master for a text-based RPG with short-term and long-term memory.
Describe the outcomes of the user's actions vividly and maintain a consistent world.
Keep responses relatively engaging.
You should only simulate the world, not the player's action.
Your response should be the consequence of the player's action.
The response should be in the same language as the player's input.
If there are other characters (NPCs, companions, adversaries, or sentient beings) present in the current scene, determine their structured reactions and include them in "CHARACTERS_REACTIONS" (with each entry containing "name", "internal_thought", and "view_of_the_player").
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
  "LONG_TERM_MEMORY": "[A comprehensive summary of the whole previous game so far, capturing overarching plot points, world state, relationships, and key milestones. You must NEVER delete or discard anything from the long term memory; only append and amend new milestones or details. All key milestones from the start of the game must be preserved in this summary. Never forget previous milestones.]"
}`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('geminiApiKey') || ''; // Reuse API key from other tools
    modelSelect.value = localStorage.getItem('geminiRpgModel') || 'gemini-3-flash-preview';
    nextMovePromptTextarea.value = localStorage.getItem('geminiRpgNextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem('geminiRpgGameHistory') || ''; 
    shortTermMemoryTextarea.value = localStorage.getItem('geminiRpgShortTermMemory') || '';
    longTermMemoryTextarea.value = localStorage.getItem('geminiRpgLongTermMemory') || '';

    // Load target word count, default to 100 if never set
    const savedWordCount = localStorage.getItem('geminiRpgTargetWordCount');
    targetWordCountInput.value = savedWordCount !== null ? savedWordCount : '100';

    // Initialize Memory Mode Checkbox
    const useMemory = localStorage.getItem('geminiRpgUseMemory') === 'true';
    useMemoryCheckbox.checked = useMemory;

    if (useMemory) {
        memorySection.classList.remove('hidden');
        systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstruction') || defaultSystemInstructionWithMemory;
    } else {
        memorySection.classList.add('hidden');
        systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstructionNoMemory') || defaultSystemInstructionNoMemory;
    }

    useMemoryCheckbox.addEventListener('change', () => {
        const active = useMemoryCheckbox.checked;
        localStorage.setItem('geminiRpgUseMemory', active);
        if (active) {
            // Save no-memory instruction edits
            localStorage.setItem('geminiRpgSystemInstructionNoMemory', systemInstructionTextarea.value);
            // Load memory instructions
            systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstruction') || defaultSystemInstructionWithMemory;
            memorySection.classList.remove('hidden');

            // If memories are empty but history exists, automatically fetch memories
            if (gameHistoryTextarea.value.trim() && !shortTermMemoryTextarea.value.trim() && !longTermMemoryTextarea.value.trim()) {
                refreshMemories();
            }
        } else {
            // Save memory instruction edits
            localStorage.setItem('geminiRpgSystemInstruction', systemInstructionTextarea.value);
            // Load no-memory instructions
            systemInstructionTextarea.value = localStorage.getItem('geminiRpgSystemInstructionNoMemory') || defaultSystemInstructionNoMemory;
            memorySection.classList.add('hidden');
        }
    });

    // Save active system instruction based on checkbox
    systemInstructionTextarea.addEventListener('input', () => {
        if (useMemoryCheckbox.checked) {
            localStorage.setItem('geminiRpgSystemInstruction', systemInstructionTextarea.value);
        } else {
            localStorage.setItem('geminiRpgSystemInstructionNoMemory', systemInstructionTextarea.value);
        }
    });

    shortTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgShortTermMemory', shortTermMemoryTextarea.value);
    });

    longTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgLongTermMemory', longTermMemoryTextarea.value);
    });

    targetWordCountInput.addEventListener('input', () => {
        localStorage.setItem('geminiRpgTargetWordCount', targetWordCountInput.value);
    });
    
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
                    const currentList = getCharactersReactionsFromDOM();
                    if (currentList.length === 0) {
                        renderCharactersReactions([]);
                    } else {
                        localStorage.setItem('geminiRpgCharactersReactionsList', JSON.stringify(currentList));
                        if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
                    }
                });
            }

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
    nextMovePromptTextarea.addEventListener('input', () => localStorage.setItem('geminiRpgNextMovePrompt', nextMovePromptTextarea.value));
    
    gameHistoryTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
        if (findInput && findInput.value) {
            updateFindMatchCount();
        }
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

    // Collapsible elements for memory
    const toggleShortTermMemory = document.getElementById('toggleShortTermMemory');
    const shortTermMemoryContent = document.getElementById('shortTermMemoryContent');
    if (toggleShortTermMemory && shortTermMemoryContent) {
        if (localStorage.getItem('geminiRpgShortTermMemoryCollapsed') === 'true') {
            shortTermMemoryContent.classList.add('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleShortTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = shortTermMemoryContent.classList.toggle('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgShortTermMemoryCollapsed', isCollapsed);
        });
    }

    const toggleLongTermMemory = document.getElementById('toggleLongTermMemory');
    const longTermMemoryContent = document.getElementById('longTermMemoryContent');
    if (toggleLongTermMemory && longTermMemoryContent) {
        if (localStorage.getItem('geminiRpgLongTermMemoryCollapsed') === 'true') {
            longTermMemoryContent.classList.add('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleLongTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = longTermMemoryContent.classList.toggle('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem('geminiRpgLongTermMemoryCollapsed', isCollapsed);
        });
    }

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem('geminiRpgNextMovePrompt');
    });

    if (resetSystemInstructionBtn) {
        resetSystemInstructionBtn.addEventListener('click', () => {
            if (confirm('Reset System Instruction to default?')) {
                if (useMemoryCheckbox.checked) {
                    systemInstructionTextarea.value = defaultSystemInstructionWithMemory;
                    localStorage.setItem('geminiRpgSystemInstruction', defaultSystemInstructionWithMemory);
                } else {
                    systemInstructionTextarea.value = defaultSystemInstructionNoMemory;
                    localStorage.setItem('geminiRpgSystemInstructionNoMemory', defaultSystemInstructionNoMemory);
                }
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
        stopBtn.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
        refreshMemoriesBtn.disabled = false;
        abortController = null;
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
    }

    function clearAllContents() {
        if (!confirm('Are you sure you want to clear all contents and settings? This cannot be undone.')) {
            return;
        }

        modelSelect.value = 'gemini-3-flash-preview'; 
        nextMovePromptTextarea.value = '';
        gameHistoryTextarea.value = '';
        shortTermMemoryTextarea.value = '';
        longTermMemoryTextarea.value = '';
        targetWordCountInput.value = '100';
        renderCharactersReactions([]);

        revertLastMoveBtn.disabled = true;

        if (useMemoryCheckbox.checked) {
            systemInstructionTextarea.value = defaultSystemInstructionWithMemory;
        } else {
            systemInstructionTextarea.value = defaultSystemInstructionNoMemory;
        }

        localStorage.removeItem('geminiRpgModel');
        localStorage.removeItem('geminiRpgSystemInstruction');
        localStorage.removeItem('geminiRpgSystemInstructionNoMemory');
        localStorage.removeItem('geminiRpgNextMovePrompt');
        localStorage.removeItem('geminiRpgGameHistory'); 
        localStorage.removeItem('geminiRpgCharactersReactionsList');
        localStorage.removeItem('geminiRpgCharactersCollapsed');
        localStorage.removeItem('geminiRpgShortTermMemory');
        localStorage.removeItem('geminiRpgLongTermMemory');
        localStorage.removeItem('geminiRpgShortTermMemoryCollapsed');
        localStorage.removeItem('geminiRpgLongTermMemoryCollapsed');
        localStorage.setItem('geminiRpgTargetWordCount', '100');
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

    async function refreshMemories() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const currentHistory = gameHistoryTextarea.value.trim();

        if (!apiKey) {
            showError('Please enter your Gemini API Key first.');
            return;
        }

        if (!currentHistory) {
            showError('Game History is empty. No history to generate memory from.');
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

        const userPrompt = `Please read the following complete RPG game history and generate two memory summaries in a valid JSON object strictly with the keys "SHORT_TERM_MEMORY" and "LONG_TERM_MEMORY":\n\n${currentHistory}\n\nIMPORTANT: The memory summaries must be in the same language as the story/game history.\n\nYou must return ONLY a valid JSON object strictly matching the following format:\n{\n  "SHORT_TERM_MEMORY": "[A concise summary of the recent few iterations (last 3-5 turns), capturing key immediate events, current situation, and recent details]",\n  "LONG_TERM_MEMORY": "[A comprehensive summary of the whole previous game so far, capturing overarching plot points, world state, relationships, and key milestones. You must NEVER delete or discard anything from the long term memory; only append and amend new milestones or details. All key milestones from the start of the game must be preserved in this summary. Never forget previous milestones.]"\n}`;

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

        const requestBodyString = JSON.stringify(requestBody);
        const apiUrl = `${GEMINI_API_BASE_URL}${selectedModel}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBodyString,
                signal: signal
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
                localStorage.setItem('geminiRpgShortTermMemory', shortTermPart);
            }
            if (longTermPart) {
                longTermMemoryTextarea.value = longTermPart;
                localStorage.setItem('geminiRpgLongTermMemory', longTermPart);
            }

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
            loadingIndicator.textContent = 'Gemini is thinking...';
        }
    }

    async function submitMove() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const systemInstruction = systemInstructionTextarea.value.trim();
        const currentHistory = gameHistoryTextarea.value.trim();
        const charactersThoughts = getCharactersReactionsTextForPrompt();
        const nextMove = nextMovePromptTextarea.value.trim();
        const activeMemory = useMemoryCheckbox.checked;
        const targetWordCount = targetWordCountInput.value.trim();

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
        if (activeMemory) {
            const shortTermMemory = shortTermMemoryTextarea.value.trim();
            const longTermMemory = longTermMemoryTextarea.value.trim();
            if (currentHistory === '' && shortTermMemory === '' && longTermMemory === '') {
                userPrompt = `Start a new adventure. The setting is: ${nextMove || 'A mysterious fantasy world.'}`;
            } else {
                userPrompt = `Long Term Memory (Summary of the whole previous game):\n${longTermMemory || 'None yet.'}\n\nShort Term Memory (Summary of recent few iterations):\n${shortTermMemory || 'None yet.'}\n\nCharacters' reaction (Current Scene):\n${charactersThoughts}\n\nMy next move: ${nextMove}\n\nWhat happens next? Remember to output ONLY a valid JSON object strictly with keys "STORY", "CHARACTERS_REACTIONS", "SHORT_TERM_MEMORY", and "LONG_TERM_MEMORY".`;
            }
        } else {
            if (currentHistory === '') {
                userPrompt = `Start a new adventure. The setting is: ${nextMove || 'A mysterious fantasy world.'}`;
            } else {
                userPrompt = `Complete game history log so far:\n\n${currentHistory}\n\nCharacters' reaction in current scene:\n${charactersThoughts}\n\nMy next move: ${nextMove}\n\nWhat happens next? Remember to output ONLY a valid JSON object strictly with keys "STORY" and "CHARACTERS_REACTIONS".`;
            }
        }

        if (targetWordCount) {
            userPrompt += `\n\nIMPORTANT: The generated STORY should approximately be around ${targetWordCount} words.`;
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
            let shortTermPart = '';
            let longTermPart = '';

            try {
                const parsedJson = JSON.parse(responseText.trim().replace(/^```json\s*|```$/g, ''));
                storyPart = (parsedJson.STORY || parsedJson.story || '').trim();
                
                const rawReactions = parsedJson.CHARACTERS_REACTIONS || parsedJson.characters_reactions || parsedJson.charactersReactions || parsedJson.CHARACTERS_THOUGHTS || parsedJson.characters_thoughts || parsedJson.charactersThoughts;
                if (Array.isArray(rawReactions)) {
                    charactersReactionsList = rawReactions;
                } else if (typeof rawReactions === 'string') {
                    charactersReactionsList = [{ name: 'Character', internal_thought: rawReactions, view_of_the_player: 'Neutral' }];
                }

                if (activeMemory) {
                    shortTermPart = (parsedJson.SHORT_TERM_MEMORY || parsedJson.short_term_memory || parsedJson.shortTermMemory || '').trim();
                    longTermPart = (parsedJson.LONG_TERM_MEMORY || parsedJson.long_term_memory || parsedJson.longTermMemory || '').trim();
                }
            } catch (jsonError) {
                console.warn('Failed to parse JSON response directly in submitMove, falling back to regex parsing:', jsonError);
                const storyMatch = responseText.match(/"STORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/STORY:\s*([\s\S]*?)(?=CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|SHORT_TERM_MEMORY:|LONG_TERM_MEMORY:|$)/i);
                if (storyMatch) storyPart = storyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                else storyPart = responseText.trim();

                if (activeMemory) {
                    const shortTermMatch = responseText.match(/"SHORT_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/SHORT_TERM_MEMORY:\s*([\s\S]*?)(?=STORY:|CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|LONG_TERM_MEMORY:|$)/i);
                    const longTermMatch = responseText.match(/"LONG_TERM_MEMORY"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || responseText.match(/LONG_TERM_MEMORY:\s*([\s\S]*?)(?=STORY:|CHARACTERS_REACTIONS:|CHARACTERS_THOUGHTS:|SHORT_TERM_MEMORY:|$)/i);
                    if (shortTermMatch) shortTermPart = shortTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                    if (longTermMatch) longTermPart = longTermMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                }
            }

            const promptTokens = data.usageMetadata?.promptTokenCount || 0;
            const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);

            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (storyPart) {
                renderCharactersReactions(charactersReactionsList);

                if (activeMemory) {
                    if (shortTermPart) {
                        shortTermMemoryTextarea.value = shortTermPart;
                        localStorage.setItem('geminiRpgShortTermMemory', shortTermPart);
                    }
                    if (longTermPart) {
                        longTermMemoryTextarea.value = longTermPart;
                        localStorage.setItem('geminiRpgLongTermMemory', longTermPart);
                    }
                }

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
            model: modelSelect.value,
            useMemory: useMemoryCheckbox.checked,
            shortTermMemory: shortTermMemoryTextarea.value,
            longTermMemory: longTermMemoryTextarea.value,
            targetWordCount: targetWordCountInput.value
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
                
                const loadUseMemory = gameState.useMemory === true;
                useMemoryCheckbox.checked = loadUseMemory;
                localStorage.setItem('geminiRpgUseMemory', loadUseMemory);

                shortTermMemoryTextarea.value = gameState.shortTermMemory || '';
                longTermMemoryTextarea.value = gameState.longTermMemory || '';
                localStorage.setItem('geminiRpgShortTermMemory', shortTermMemoryTextarea.value);
                localStorage.setItem('geminiRpgLongTermMemory', longTermMemoryTextarea.value);

                const loadTargetWordCount = gameState.targetWordCount !== undefined ? gameState.targetWordCount : '100';
                targetWordCountInput.value = loadTargetWordCount;
                localStorage.setItem('geminiRpgTargetWordCount', loadTargetWordCount);

                if (loadUseMemory) {
                    memorySection.classList.remove('hidden');
                    systemInstructionTextarea.value = gameState.systemInstruction || defaultSystemInstructionWithMemory;
                    localStorage.setItem('geminiRpgSystemInstruction', systemInstructionTextarea.value);
                } else {
                    memorySection.classList.add('hidden');
                    systemInstructionTextarea.value = gameState.systemInstruction || defaultSystemInstructionNoMemory;
                    localStorage.setItem('geminiRpgSystemInstructionNoMemory', systemInstructionTextarea.value);
                }

                if (gameState.model !== undefined) {
                    modelSelect.value = gameState.model;
                    localStorage.setItem('geminiRpgModel', modelSelect.value);
                }

                localStorage.setItem('geminiRpgGameHistory', gameHistoryTextarea.value);

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

    // --- Find and Replace in Game History ---
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
        if (!findInput || !gameHistoryTextarea) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;
        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches', 'error');
        } else {
            setFindReplaceStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`, 'info');
        }
    }

    function scrollToMatch(matchIndex) {
        if (!gameHistoryTextarea) return;
        const textBefore = gameHistoryTextarea.value.substring(0, matchIndex);
        const linesBefore = textBefore.split('\n').length;
        const totalLines = Math.max(1, gameHistoryTextarea.value.split('\n').length);
        
        const boxRect = gameHistoryTextarea.getBoundingClientRect();
        const boxTop = boxRect.top + window.scrollY;
        const estimatedOffset = (linesBefore / totalLines) * gameHistoryTextarea.clientHeight;
        const targetScrollY = boxTop + estimatedOffset - (window.innerHeight / 2);
        
        window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior: 'smooth'
        });
    }

    function findNext(silent = false) {
        if (!gameHistoryTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            if (!silent) setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found', 'error');
            return;
        }

        const currentSelEnd = gameHistoryTextarea.selectionEnd || 0;
        let targetIdx = matches.findIndex(m => m.index >= currentSelEnd);
        if (targetIdx === -1) {
            targetIdx = 0;
        }

        const targetMatch = matches[targetIdx];
        gameHistoryTextarea.focus();
        gameHistoryTextarea.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
        scrollToMatch(targetMatch.index);
        setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
    }

    function findPrev() {
        if (!gameHistoryTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found', 'error');
            return;
        }

        const currentSelStart = gameHistoryTextarea.selectionStart || 0;
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
        gameHistoryTextarea.focus();
        gameHistoryTextarea.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
        scrollToMatch(targetMatch.index);
        setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
    }

    function replaceCurrent() {
        if (!gameHistoryTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found to replace', 'error');
            return;
        }

        const selStart = gameHistoryTextarea.selectionStart;
        const selEnd = gameHistoryTextarea.selectionEnd;
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
            gameHistoryTextarea.value = newText;
            localStorage.setItem('geminiRpgGameHistory', newText);
            revertLastMoveBtn.disabled = !newText.trim();

            gameHistoryTextarea.setSelectionRange(selStart + replacement.length, selStart + replacement.length);
            findNext(true);
            setFindReplaceStatus('Replaced 1 occurrence', 'success');
        } else {
            findNext();
        }
    }

    function replaceAll() {
        if (!gameHistoryTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
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
        gameHistoryTextarea.value = newText;
        localStorage.setItem('geminiRpgGameHistory', newText);
        revertLastMoveBtn.disabled = !newText.trim();
        
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
});
