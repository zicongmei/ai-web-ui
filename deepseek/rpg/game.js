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
    const deepseekLogs = [];

    // Global AbortController for stopping fetch requests
    let abortController = null;

    const STORAGE_PREFIX = 'deepseek_rpg_';

    // Load accumulated tokens from localStorage
    let totalAccumulatedInputTokens = parseInt(localStorage.getItem(STORAGE_PREFIX + 'accumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem(STORAGE_PREFIX + 'accumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    
    // Load accumulated cost
    let totalAccumulatedCost = parseFloat(localStorage.getItem(STORAGE_PREFIX + 'accumulatedCost') || '0');

    const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/chat/completions';

    const defaultSystemInstructionNoMemory = `您是一个文字 RPG 的游戏主持人 (DM)。
生动地描述用户行动的结果，并保持世界观的一致性。
保持回答引人入胜。
你只能模拟世界，不能模拟玩家的行动。
你的回答应该是玩家行动的后果。
回答应与玩家输入的语言相同（默认为中文）。
如果当前场景中有其他角色（NPC、同伴、敌人或有智慧的生物），请确定他们的结构化反应并将其放入 "CHARACTERS_REACTIONS" 列表中（每个元素必须包含 "name", "internal_thought" 和 "view_of_the_player"）。
重要：你必须严格返回合法的 JSON 对象结构，字段严格如下：
{
  "STORY": "[对接下来发生事件的描述]",
  "CHARACTERS_REACTIONS": [
    {
      "name": "[角色名字]",
      "internal_thought": "[该角色对其刚才发生事件的内心真实想法或秘密反应]",
      "view_of_the_player": "[该角色当前对玩家的看法、态度或认知]"
    }
  ]
}`;

    const defaultSystemInstructionWithMemory = `您是一个文字 RPG 的游戏主持人 (DM)，具有短期和长期记忆功能。
生动地描述用户行动的结果，并保持世界观的一致性。
保持回答引人入胜。
你只能模拟世界，不能模拟玩家的行动。
你的回答应该是玩家行动的后果。
回答应与玩家输入的语言相同（默认为中文）。
如果当前场景中有其他角色（NPC、同伴、敌人或有智慧的生物），请确定他们的结构化反应并将其放入 "CHARACTERS_REACTIONS" 列表中（每个元素必须包含 "name", "internal_thought" 和 "view_of_the_player"）。
重要：你必须严格返回合法的 JSON 对象结构，字段严格如下：
{
  "STORY": "[对接下来发生事件的描述]",
  "CHARACTERS_REACTIONS": [
    {
      "name": "[角色名字]",
      "internal_thought": "[该角色对其刚才发生事件的内心真实想法或秘密反应]",
      "view_of_the_player": "[该角色当前对玩家的看法、态度或认知]"
    }
  ],
  "SHORT_TERM_MEMORY": "[对近期几轮（过去3-5轮）局势的简要总结，捕获当前直接事件、局势和最近细节]",
  "LONG_TERM_MEMORY": "[对整个以往游戏的全面总结，捕获核心剧情要点、世界状态、人际关系和关键里程碑。绝不能从长期记忆中删除或丢弃任何内容；只能以追加、修正或丰富细节的方式修改长期记忆。自游戏开始以来的所有关键里程碑必须全部保留在此总结中，绝不能遗忘。]"
}`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('deepseekApiKey') || '';
    modelSelect.value = localStorage.getItem(STORAGE_PREFIX + 'model') || 'deepseek-chat';
    nextMovePromptTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'nextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'gameHistory') || ''; 
    shortTermMemoryTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'shortTermMemory') || '';
    longTermMemoryTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'longTermMemory') || '';

    // Load target word count, default to 200 if never set
    const savedWordCount = localStorage.getItem(STORAGE_PREFIX + 'targetWordCount');
    targetWordCountInput.value = savedWordCount !== null ? savedWordCount : '200';

    // Initialize Memory Mode Checkbox
    const useMemory = localStorage.getItem(STORAGE_PREFIX + 'useMemory') === 'true';
    useMemoryCheckbox.checked = useMemory;

    if (useMemory) {
        memorySection.classList.remove('hidden');
        systemInstructionTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'systemInstruction') || defaultSystemInstructionWithMemory;
    } else {
        memorySection.classList.add('hidden');
        systemInstructionTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'systemInstructionNoMemory') || defaultSystemInstructionNoMemory;
    }

    useMemoryCheckbox.addEventListener('change', () => {
        const active = useMemoryCheckbox.checked;
        localStorage.setItem(STORAGE_PREFIX + 'useMemory', active);
        if (active) {
            // Save no-memory instruction edits
            localStorage.setItem(STORAGE_PREFIX + 'systemInstructionNoMemory', systemInstructionTextarea.value);
            // Load memory instructions
            systemInstructionTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'systemInstruction') || defaultSystemInstructionWithMemory;
            memorySection.classList.remove('hidden');

            // If memories are empty but history exists, automatically fetch memories
            if (gameHistoryTextarea.value.trim() && !shortTermMemoryTextarea.value.trim() && !longTermMemoryTextarea.value.trim()) {
                refreshMemories();
            }
        } else {
            // Save memory instruction edits
            localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', systemInstructionTextarea.value);
            // Load no-memory instructions
            systemInstructionTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'systemInstructionNoMemory') || defaultSystemInstructionNoMemory;
            memorySection.classList.add('hidden');
        }
    });

    // Save active system instruction based on checkbox
    systemInstructionTextarea.addEventListener('input', () => {
        if (useMemoryCheckbox.checked) {
            localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', systemInstructionTextarea.value);
        } else {
            localStorage.setItem(STORAGE_PREFIX + 'systemInstructionNoMemory', systemInstructionTextarea.value);
        }
    });

    shortTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'shortTermMemory', shortTermMemoryTextarea.value);
    });

    longTermMemoryTextarea.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'longTermMemory', longTermMemoryTextarea.value);
    });

    targetWordCountInput.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'targetWordCount', targetWordCountInput.value);
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
                name: nameDisplay ? nameDisplay.textContent.trim() : '角色',
                internal_thought: thoughtInput ? thoughtInput.value.trim() : '',
                view_of_the_player: viewInput ? viewInput.value.trim() : ''
            });
        });
        return list;
    }

    function getCharactersReactionsTextForPrompt() {
        const list = getCharactersReactionsFromDOM();
        if (list.length === 0) return '当前场景中无其他角色。';
        return list.map(c => {
            const name = c.name || '角色';
            const thought = c.internal_thought || '无';
            const view = c.view_of_the_player || '中立';
            return `${name}:\n  • 内心想法: "${thought}"\n  • 对玩家看法: "${view}"`;
        }).join('\n\n');
    }

    function renderCharactersReactions(list) {
        if (!charactersReactionsContainer) return;
        
        charactersReactionsContainer.innerHTML = '';
        if (!list || !Array.isArray(list) || list.length === 0) {
            charactersReactionsContainer.innerHTML = '<div class="no-characters-message">当前场景中无其他角色。</div>';
            localStorage.setItem(STORAGE_PREFIX + 'charactersReactionsList', '[]');
            if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = '当前场景中无其他角色。';
            return;
        }

        list.forEach((char, idx) => {
            const card = document.createElement('div');
            card.className = 'character-reaction-card';

            const name = char.name || `角色 ${idx + 1}`;
            const thought = char.internal_thought || char.internalThought || char.thought || '';
            const view = char.view_of_the_player || char.viewOfThePlayer || char.view_of_player || '';

            card.innerHTML = `
                <div class="collapsible-header character-header">
                    <div class="char-name-label">角色: <span class="char-name-display">${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
                    <div style="display: flex; align-items: center;">
                        <button type="button" class="delete-char-btn" style="background: none; border: none; color: #d9534f; cursor: pointer; font-size: 1.1em; padding: 2px 6px; font-weight: bold; margin-right: 8px;" title="删除角色">✕</button>
                        <span class="toggle-icon">▼</span>
                    </div>
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

            const deleteBtn = card.querySelector('.delete-char-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    card.remove();
                    const currentList = getCharactersReactionsFromDOM();
                    if (currentList.length === 0) {
                        renderCharactersReactions([]);
                    } else {
                        localStorage.setItem(STORAGE_PREFIX + 'charactersReactionsList', JSON.stringify(currentList));
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
                    localStorage.setItem(STORAGE_PREFIX + 'charactersReactionsList', JSON.stringify(currentList));
                    if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
                });
            });

            charactersReactionsContainer.appendChild(card);
        });

        localStorage.setItem(STORAGE_PREFIX + 'charactersReactionsList', JSON.stringify(getCharactersReactionsFromDOM()));
        if (charactersThoughtsTextarea) charactersThoughtsTextarea.value = getCharactersReactionsTextForPrompt();
    }

    // Load saved reactions
    try {
        const savedListStr = localStorage.getItem(STORAGE_PREFIX + 'charactersReactionsList');
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
    apiKeyInput.addEventListener('input', () => localStorage.setItem('deepseekApiKey', apiKeyInput.value));
    modelSelect.addEventListener('change', () => localStorage.setItem(STORAGE_PREFIX + 'model', modelSelect.value));
    nextMovePromptTextarea.addEventListener('input', () => localStorage.setItem(STORAGE_PREFIX + 'nextMovePrompt', nextMovePromptTextarea.value));
    
    gameHistoryTextarea.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
        if (findInput && findInput.value) {
            updateFindMatchCount();
        }
    });

    const toggleCharactersThoughts = document.getElementById('toggleCharactersThoughts');
    const charactersThoughtsContent = document.getElementById('charactersThoughtsContent');
    if (toggleCharactersThoughts && charactersThoughtsContent) {
        if (localStorage.getItem(STORAGE_PREFIX + 'charactersCollapsed') === 'true') {
            charactersThoughtsContent.classList.add('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleCharactersThoughts.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = charactersThoughtsContent.classList.toggle('collapsed');
            toggleCharactersThoughts.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem(STORAGE_PREFIX + 'charactersCollapsed', isCollapsed);
        });
    }

    // Collapsible elements for memory
    const toggleShortTermMemory = document.getElementById('toggleShortTermMemory');
    const shortTermMemoryContent = document.getElementById('shortTermMemoryContent');
    if (toggleShortTermMemory && shortTermMemoryContent) {
        if (localStorage.getItem(STORAGE_PREFIX + 'shortTermMemoryCollapsed') === 'true') {
            shortTermMemoryContent.classList.add('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleShortTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = shortTermMemoryContent.classList.toggle('collapsed');
            toggleShortTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem(STORAGE_PREFIX + 'shortTermMemoryCollapsed', isCollapsed);
        });
    }

    const toggleLongTermMemory = document.getElementById('toggleLongTermMemory');
    const longTermMemoryContent = document.getElementById('longTermMemoryContent');
    if (toggleLongTermMemory && longTermMemoryContent) {
        if (localStorage.getItem(STORAGE_PREFIX + 'longTermMemoryCollapsed') === 'true') {
            longTermMemoryContent.classList.add('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = 'rotate(-90deg)';
        }
        toggleLongTermMemory.addEventListener('click', (e) => {
            if (window.getSelection().toString().trim().length > 0) return;
            const isCollapsed = longTermMemoryContent.classList.toggle('collapsed');
            toggleLongTermMemory.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            localStorage.setItem(STORAGE_PREFIX + 'longTermMemoryCollapsed', isCollapsed);
        });
    }

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
    });

    if (resetSystemInstructionBtn) {
        resetSystemInstructionBtn.addEventListener('click', () => {
            if (confirm('确定要将系统指令重置为默认值吗？')) {
                if (useMemoryCheckbox.checked) {
                    systemInstructionTextarea.value = defaultSystemInstructionWithMemory;
                    localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', defaultSystemInstructionWithMemory);
                } else {
                    systemInstructionTextarea.value = defaultSystemInstructionNoMemory;
                    localStorage.setItem(STORAGE_PREFIX + 'systemInstructionNoMemory', defaultSystemInstructionNoMemory);
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
            showError('操作已由用户停止。');
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
        if (confirm('确定要清空所有调试日志吗？')) {
            deepseekLogs.length = 0;
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
        if (!confirm('确定要清空所有内容和设置吗？此操作无法撤销。')) {
            return;
        }

        modelSelect.value = 'deepseek-chat'; 
        nextMovePromptTextarea.value = '';
        gameHistoryTextarea.value = '';
        shortTermMemoryTextarea.value = '';
        longTermMemoryTextarea.value = '';
        targetWordCountInput.value = '200';
        renderCharactersReactions([]);

        revertLastMoveBtn.disabled = true;

        if (useMemoryCheckbox.checked) {
            systemInstructionTextarea.value = defaultSystemInstructionWithMemory;
        } else {
            systemInstructionTextarea.value = defaultSystemInstructionNoMemory;
        }

        localStorage.removeItem(STORAGE_PREFIX + 'model');
        localStorage.removeItem(STORAGE_PREFIX + 'systemInstruction');
        localStorage.removeItem(STORAGE_PREFIX + 'systemInstructionNoMemory');
        localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
        localStorage.removeItem(STORAGE_PREFIX + 'gameHistory'); 
        localStorage.removeItem(STORAGE_PREFIX + 'charactersReactionsList');
        localStorage.removeItem(STORAGE_PREFIX + 'charactersCollapsed');
        localStorage.removeItem(STORAGE_PREFIX + 'shortTermMemory');
        localStorage.removeItem(STORAGE_PREFIX + 'longTermMemory');
        localStorage.removeItem(STORAGE_PREFIX + 'shortTermMemoryCollapsed');
        localStorage.removeItem(STORAGE_PREFIX + 'longTermMemoryCollapsed');
        localStorage.setItem(STORAGE_PREFIX + 'targetWordCount', '200');
        localStorage.removeItem(STORAGE_PREFIX + 'accumulatedInputTokens'); 
        localStorage.removeItem(STORAGE_PREFIX + 'accumulatedOutputTokens'); 
        localStorage.removeItem(STORAGE_PREFIX + 'accumulatedCost');

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
            localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
            revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
            gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
        } else {
            gameHistoryTextarea.value = '';
            localStorage.setItem(STORAGE_PREFIX + 'gameHistory', '');
            revertLastMoveBtn.disabled = true;
        }
    }

    function calculateRequestCost(model, inputTokens, outputTokens) {
        const pricingConfig = DEEPSEEK_PRICING_CONFIG.TEXT[model];
        if (!pricingConfig) return 0;
        const { inputRate, outputRate } = pricingConfig.getPricing(inputTokens);
        return (inputTokens * inputRate) + (outputTokens * outputRate);
    }

    async function refreshMemories() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const currentHistory = gameHistoryTextarea.value.trim();

        if (!apiKey) {
            showError('请先输入您的 DeepSeek API Key。');
            return;
        }

        if (!currentHistory) {
            showError('游戏历史记录为空，无法生成记忆总结。');
            return;
        }

        if (abortController) {
            showError('另一个生成任务已在进行中。');
            return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        refreshMemoriesBtn.disabled = true;
        generateBtn.disabled = true;
        loadingIndicator.textContent = '正在根据历史记录总结记忆...';
        loadingIndicator.classList.remove('hidden');
        showError('');

        const userPrompt = `请仔细阅读以下完整的 RPG 游戏历史记录，并在一个合法的 JSON 对象中严格返回两个键 "SHORT_TERM_MEMORY" 和 "LONG_TERM_MEMORY" 来生成记忆总结：\n\n${currentHistory}\n\n重要：记忆总结的语言必须与游戏历史记录/故事的语言相同。\n\n你必须严格且仅返回以下格式 of JSON 对象：\n{\n  "SHORT_TERM_MEMORY": "[对近期几轮（过去3-5轮）局势的简要总结，捕获当前直接事件、局势 and 最近细节]",\n  "LONG_TERM_MEMORY": "[对整个以往游戏的全面总结，捕获核心剧情要点、世界状态、人际关系和关键里程碑。绝不能从长期记忆中删除或丢弃任何内容；只能以追加、修正或丰富细节的方式修改长期记忆。自游戏开始以来的所有关键里程碑必须全部保留在此总结中，绝不能遗忘。]"\n}`;

        const messages = [
            { role: 'user', content: userPrompt }
        ];

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.5,
            response_format: { type: 'json_object' }
        };

        const requestBodyString = JSON.stringify(requestBody);
        const apiUrl = DEEPSEEK_API_BASE_URL;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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

            const responseText = data.choices?.[0]?.message?.content || '{}';

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

            const promptTokens = data.usage?.prompt_tokens || 0;
            const candidateTokens = data.usage?.completion_tokens || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);
            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (shortTermPart) {
                shortTermMemoryTextarea.value = shortTermPart;
                localStorage.setItem(STORAGE_PREFIX + 'shortTermMemory', shortTermPart);
            }
            if (longTermPart) {
                longTermMemoryTextarea.value = longTermPart;
                localStorage.setItem(STORAGE_PREFIX + 'longTermMemory', longTermPart);
            }

        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                showError('操作已被用户中止。');
            } else {
                showError(`总结记忆失败: ${error.message}`);
                appendDebugLog(apiUrl, requestBodyString, error);
            }
        } finally {
            resetUI();
            loadingIndicator.textContent = 'DeepSeek 正在思考...';
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
            showError('请先输入您的 DeepSeek API Key。');
            return;
        }
        
        if (abortController) {
            showError('另一个生成任务已在进行中。');
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

        currentRequestInputTokensDisplay.textContent = '计算中...'; 
        currentRequestOutputTokensDisplay.textContent = '计算中...'; 
        currentRequestCostDisplay.textContent = '计算中...';
        
        let userPrompt = '';
        if (activeMemory) {
            const shortTermMemory = shortTermMemoryTextarea.value.trim();
            const longTermMemory = longTermMemoryTextarea.value.trim();
            if (currentHistory === '' && shortTermMemory === '' && longTermMemory === '') {
                userPrompt = `开始新的冒险。设定为：${nextMove || '神秘的幻境。'}`;
            } else {
                userPrompt = `长期记忆 (全局以往总结):\n${longTermMemory || '暂无。'}\n\n短期记忆 (近期几轮总结):\n${shortTermMemory || '暂无。'}\n\n当前场景角色反应：\n${charactersThoughts}\n\n我的下一步行动：${nextMove}\n\n接下来会发生什么？请务必且仅输出一个合法的 JSON 对象，严格包含键 "STORY", "CHARACTERS_REACTIONS", "SHORT_TERM_MEMORY" 和 "LONG_TERM_MEMORY"。`;
            }
        } else {
            if (currentHistory === '') {
                userPrompt = `开始新的冒险。设定为：${nextMove || '神秘的幻境。'}`;
            } else {
                userPrompt = `完整游戏历史记录：\n\n${currentHistory}\n\n当前场景角色反应：\n${charactersThoughts}\n\n我的下一步行动：${nextMove}\n\n接下来会发生什么？请务必且仅输出一个合法的 JSON 对象，严格包含键 "STORY" 和 "CHARACTERS_REACTIONS"。`;
            }
        }

        if (targetWordCount) {
            userPrompt += `\n\n重要：生成的故事 (STORY) 长度大约应为 ${targetWordCount} 字左右。`;
        }
        
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: userPrompt });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.7,
            response_format: { type: 'json_object' }
        };

        const requestBodyString = JSON.stringify(requestBody);
        const apiUrl = DEEPSEEK_API_BASE_URL;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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

            const responseText = data.choices?.[0]?.message?.content || '{}';
            
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
                    charactersReactionsList = [{ name: '角色', internal_thought: rawReactions, view_of_the_player: '中立' }];
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

            const promptTokens = data.usage?.prompt_tokens || 0;
            const candidateTokens = data.usage?.completion_tokens || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);

            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (storyPart) {
                renderCharactersReactions(charactersReactionsList);

                if (activeMemory) {
                    if (shortTermPart) {
                        shortTermMemoryTextarea.value = shortTermPart;
                        localStorage.setItem(STORAGE_PREFIX + 'shortTermMemory', shortTermPart);
                    }
                    if (longTermPart) {
                        longTermMemoryTextarea.value = longTermPart;
                        localStorage.setItem(STORAGE_PREFIX + 'longTermMemory', longTermPart);
                    }
                }

                const movePrefix = nextMove ? `> ${nextMove}\n\n` : '';
                if (gameHistoryTextarea.value.trim() === '') {
                    gameHistoryTextarea.value = movePrefix + storyPart;
                } else {
                    gameHistoryTextarea.value += '\n\n' + movePrefix + storyPart;
                }
                localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
                gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
                
                nextMovePromptTextarea.value = '';
                localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
            } else {
                showError('未生成任何内容。请检查安全过滤器或模型响应。');
            }

        } catch (error) {
            console.error('Error:', error);
            if (error.name === 'AbortError') {
                showError('操作已被用户中止。');
            } else {
                showError(`错误: ${error.message}`);
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

        localStorage.setItem(STORAGE_PREFIX + 'accumulatedInputTokens', totalAccumulatedInputTokens.toString());
        localStorage.setItem(STORAGE_PREFIX + 'accumulatedOutputTokens', totalAccumulatedOutputTokens.toString());
        localStorage.setItem(STORAGE_PREFIX + 'accumulatedCost', totalAccumulatedCost.toString());
    }

    function appendDebugLog(url, requestBodyString, responseOrError) {
        deepseekLogs.push({
            timestamp: new Date().toLocaleString(),
            url: url,
            request: JSON.parse(requestBodyString),
            response: responseOrError
        });
        renderDebugLogs();
    }

    function renderDebugLogs() {
        debugLogsContainer.innerHTML = '';
        deepseekLogs.forEach((log, index) => {
            const logEntryDiv = document.createElement('div');
            logEntryDiv.classList.add('debug-log-entry');
            logEntryDiv.innerHTML = `
                <details><summary><strong>请求 #${index + 1}</strong> (${log.timestamp})</summary>
                    <p><strong>URL:</strong> <code>${log.url}</code></p>
                    <strong>Body:</strong>
                    <pre>${JSON.stringify(log.request, null, 2)}</pre>
                </details>
                <details><summary><strong>响应 #${index + 1}</strong></summary>
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
                    throw new Error('无效的存档文件格式。');
                }

                gameHistoryTextarea.value = gameState.gameHistory || '';
                if (gameState.charactersReactions && Array.isArray(gameState.charactersReactions)) {
                    renderCharactersReactions(gameState.charactersReactions);
                } else {
                    renderCharactersReactions([]);
                }
                
                const loadUseMemory = gameState.useMemory === true;
                useMemoryCheckbox.checked = loadUseMemory;
                localStorage.setItem(STORAGE_PREFIX + 'useMemory', loadUseMemory);

                shortTermMemoryTextarea.value = gameState.shortTermMemory || '';
                longTermMemoryTextarea.value = gameState.longTermMemory || '';
                localStorage.setItem(STORAGE_PREFIX + 'shortTermMemory', shortTermMemoryTextarea.value);
                localStorage.setItem(STORAGE_PREFIX + 'longTermMemory', longTermMemoryTextarea.value);

                const loadTargetWordCount = gameState.targetWordCount !== undefined ? gameState.targetWordCount : '200';
                targetWordCountInput.value = loadTargetWordCount;
                localStorage.setItem(STORAGE_PREFIX + 'targetWordCount', loadTargetWordCount);

                if (loadUseMemory) {
                    memorySection.classList.remove('hidden');
                    systemInstructionTextarea.value = gameState.systemInstruction || defaultSystemInstructionWithMemory;
                    localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', systemInstructionTextarea.value);
                } else {
                    memorySection.classList.add('hidden');
                    systemInstructionTextarea.value = gameState.systemInstruction || defaultSystemInstructionNoMemory;
                    localStorage.setItem(STORAGE_PREFIX + 'systemInstructionNoMemory', systemInstructionTextarea.value);
                }

                if (gameState.model !== undefined) {
                    modelSelect.value = gameState.model;
                    localStorage.setItem(STORAGE_PREFIX + 'model', modelSelect.value);
                }

                localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);

                revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
                showError('');
                alert('游戏加载成功！');
            } catch (err) {
                showError(`加载游戏失败: ${err.message}`);
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

    // --- 游戏历史查找与替换 (Find and Replace in Game History) ---
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
                setFindReplaceStatus('正则表达式无效: ' + e.message, 'error');
                return null;
            }
        } else {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
            try {
                return new RegExp(pattern, flags);
            } catch (e) {
                setFindReplaceStatus('搜索模式错误', 'error');
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
            setFindReplaceStatus('未找到匹配项', 'error');
        } else {
            setFindReplaceStatus(`找到 ${matches.length} 处匹配`, 'info');
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
            if (!silent) setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到匹配项', 'error');
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
        setFindReplaceStatus(`第 ${targetIdx + 1} / ${matches.length} 处匹配`, 'info');
    }

    function findPrev() {
        if (!gameHistoryTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到匹配项', 'error');
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
        setFindReplaceStatus(`第 ${targetIdx + 1} / ${matches.length} 处匹配`, 'info');
    }

    function replaceCurrent() {
        if (!gameHistoryTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到可替换的匹配项', 'error');
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
            localStorage.setItem(STORAGE_PREFIX + 'gameHistory', newText);
            revertLastMoveBtn.disabled = !newText.trim();

            gameHistoryTextarea.setSelectionRange(selStart + replacement.length, selStart + replacement.length);
            findNext(true);
            setFindReplaceStatus('已替换 1 处', 'success');
        } else {
            findNext();
        }
    }

    function replaceAll() {
        if (!gameHistoryTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = gameHistoryTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到可替换的匹配项', 'error');
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
        localStorage.setItem(STORAGE_PREFIX + 'gameHistory', newText);
        revertLastMoveBtn.disabled = !newText.trim();
        
        setFindReplaceStatus(`已替换 ${count} 处`, 'success');
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
