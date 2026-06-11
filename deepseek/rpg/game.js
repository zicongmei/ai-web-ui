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
    const saveGameBtn = document.getElementById('saveGameBtn');
    const loadGameBtn = document.getElementById('loadGameBtn');
    const loadGameInput = document.getElementById('loadGameInput');
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

    const defaultSystemInstruction = `你是一个文字 RPG 的游戏主持人 (DM)。
生动地描述用户行动的结果，并保持世界观的一致性。
保持回答相对简短但引人入胜。
你只能模拟世界，不能模拟玩家的行动。
你的回答应该是玩家行动的后果。
回答应与玩家输入的语言相同（默认为中文）。
重要：你必须按照以下格式返回你的回答：
故事: [你对接下来发生的事情的描述]
物品栏: [玩家当前拥有的所有物品的逗号分隔列表]`

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('deepseekApiKey') || ''; // Reuse API key from other tools
    modelSelect.value = localStorage.getItem(STORAGE_PREFIX + 'model') || 'deepseek-v4-flash';
    systemInstructionTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'systemInstruction') || defaultSystemInstruction;
    nextMovePromptTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'nextMovePrompt') || '';
    gameHistoryTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'gameHistory') || ''; 
    inventoryDisplayTextarea.value = localStorage.getItem(STORAGE_PREFIX + 'inventory') || '无';
    
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
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', systemInstructionTextarea.value));
    nextMovePromptTextarea.addEventListener('input', () => localStorage.setItem(STORAGE_PREFIX + 'nextMovePrompt', nextMovePromptTextarea.value));
    
    gameHistoryTextarea.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
        revertLastMoveBtn.disabled = !gameHistoryTextarea.value.trim();
    });

    inventoryDisplayTextarea.addEventListener('input', () => {
        localStorage.setItem(STORAGE_PREFIX + 'inventory', inventoryDisplayTextarea.value);
    });

    clearNextMovePromptBtn.addEventListener('click', () => {
        nextMovePromptTextarea.value = '';
        localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
    });

    generateBtn.addEventListener('click', submitMove);
    revertLastMoveBtn.addEventListener('click', removeLastTurn);
    clearAllBtn.addEventListener('click', clearAllContents);
    saveGameBtn.addEventListener('click', saveGame);
    loadGameBtn.addEventListener('click', () => loadGameInput.click());
    loadGameInput.addEventListener('change', loadGame);

    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            showError('操作已被用户中止。');
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
        if (confirm('确定要清除所有调试日志吗？')) {
            deepseekLogs.length = 0;
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
        if (!confirm('确定要清空所有内容和设置吗？此操作无法撤销。')) {
            return;
        }

        modelSelect.value = 'deepseek-v4-flash'; 
        systemInstructionTextarea.value = defaultSystemInstruction; 
        nextMovePromptTextarea.value = '';
        gameHistoryTextarea.value = '';
        inventoryDisplayTextarea.value = '无';

        revertLastMoveBtn.disabled = true;

        localStorage.removeItem(STORAGE_PREFIX + 'model');
        localStorage.removeItem(STORAGE_PREFIX + 'systemInstruction');
        localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
        localStorage.removeItem(STORAGE_PREFIX + 'gameHistory'); 
        localStorage.removeItem(STORAGE_PREFIX + 'inventory');
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
            // A "turn" consists of player's move (starts with '>') and DM response.
            if (parts.length >= 2 && parts[parts.length - 2].startsWith('>')) {
                parts.pop(); // Remove DM response
                parts.pop(); // Remove User move
            } else {
                parts.pop(); // Fallback
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

    async function submitMove() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const systemInstruction = systemInstructionTextarea.value.trim();
        const currentHistory = gameHistoryTextarea.value.trim();
        const inventory = inventoryDisplayTextarea.value.trim();
        const nextMove = nextMovePromptTextarea.value.trim();

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
        if (currentHistory === '') {
            userPrompt = `开始新的冒险。设定为：${nextMove}\n\n我当前物品栏：${inventory}`;
        } else {
            userPrompt = `当前游戏历史记录：\n${currentHistory}\n\n我当前物品栏：${inventory}\n\n我的下一步行动：${nextMove}\n\n接下来会发生什么？如果我获得或失去了任何物品，请更新物品栏。`;
        }
        
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: userPrompt });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.7
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

            const responseText = data.choices?.[0]?.message?.content || '';
            
            // Parsing Chinese formatted response
            let storyPart = '';
            let inventoryPart = '';

            const storyMatch = responseText.match(/故事:([\s\S]*?)(?=物品栏:|$)/i);
            const inventoryMatch = responseText.match(/物品栏:([\s\S]*)/i);

            if (storyMatch) {
                storyPart = storyMatch[1].trim();
            } else {
                storyPart = responseText.trim(); // Fallback
            }

            if (inventoryMatch) {
                inventoryPart = inventoryMatch[1].trim();
            }

            const promptTokens = data.usage?.prompt_tokens || 0;
            const candidateTokens = data.usage?.completion_tokens || 0; 
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);

            updateTokensAndCost(promptTokens, candidateTokens, requestCost);

            if (storyPart) {
                const movePrefix = nextMove ? `> ${nextMove}\n\n` : '';
                if (gameHistoryTextarea.value.trim() === '') {
                    gameHistoryTextarea.value = movePrefix + storyPart;
                } else {
                    gameHistoryTextarea.value += '\n\n' + movePrefix + storyPart;
                }
                localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
                gameHistoryTextarea.scrollTop = gameHistoryTextarea.scrollHeight;
                
                if (inventoryPart) {
                    inventoryDisplayTextarea.value = inventoryPart;
                    localStorage.setItem(STORAGE_PREFIX + 'inventory', inventoryPart);
                }

                nextMovePromptTextarea.value = '';
                localStorage.removeItem(STORAGE_PREFIX + 'nextMovePrompt');
            } else {
                showError('未生成任何内容，请检查安全过滤器或模型响应。');
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
            inventory: inventoryDisplayTextarea.value,
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
                
                if (gameState.gameHistory === undefined || gameState.inventory === undefined) {
                    throw new Error('无效的存档文件格式。');
                }

                gameHistoryTextarea.value = gameState.gameHistory || '';
                inventoryDisplayTextarea.value = gameState.inventory || '';
                
                if (gameState.systemInstruction !== undefined) {
                    systemInstructionTextarea.value = gameState.systemInstruction;
                }
                if (gameState.model !== undefined) {
                    modelSelect.value = gameState.model;
                }

                localStorage.setItem(STORAGE_PREFIX + 'gameHistory', gameHistoryTextarea.value);
                localStorage.setItem(STORAGE_PREFIX + 'inventory', inventoryDisplayTextarea.value);
                if (gameState.systemInstruction !== undefined) {
                    localStorage.setItem(STORAGE_PREFIX + 'systemInstruction', systemInstructionTextarea.value);
                }
                if (gameState.model !== undefined) {
                    localStorage.setItem(STORAGE_PREFIX + 'model', modelSelect.value);
                }

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
});
