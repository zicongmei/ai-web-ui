document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextParagraphPromptTextarea = document.getElementById('nextParagraphPrompt');
    const storyOutputTextarea = document.getElementById('storyOutput');
    const generateBtn = document.getElementById('generateBtn');
    const stopBtn = document.getElementById('stopBtn'); 
    const revertLastParagraphBtn = document.getElementById('revertLastParagraphBtn'); 
    const clearAllBtn = document.getElementById('clearAllBtn');
    const saveStoryBtn = document.getElementById('saveStoryBtn');
    const loadStoryBtn = document.getElementById('loadStoryBtn');
    const loadStoryInput = document.getElementById('loadStoryInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const clearNextParagraphPromptBtn = document.getElementById('clearNextParagraphPromptBtn'); 

    const currentRequestInputTokensDisplay = document.getElementById('currentRequestInputTokens');
    const currentRequestOutputTokensDisplay = document.getElementById('currentRequestOutputTokens');
    const accumulatedInputTokensDisplay = document.getElementById('accumulatedInputTokens'); 
    const accumulatedOutputTokensDisplay = document.getElementById('accumulatedOutputTokens'); 
    const accumulatedTokensDisplay = document.getElementById('accumulatedTokens'); 
    
    const currentRequestCostDisplay = document.getElementById('currentRequestCost');
    const accumulatedCostDisplay = document.getElementById('accumulatedCost');

    const debugToggleBtn = document.getElementById('debugToggleBtn');
    const debugPanel = document.getElementById('debugPanel');
    const debugLogsContainer = document.getElementById('debugLogs');
    const clearDebugLogsBtn = document.getElementById('clearDebugLogsBtn');

    const deepseekLogs = [];
    let abortController = null;

    let totalAccumulatedInputTokens = parseInt(localStorage.getItem('deepseekTotalAccumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem('deepseekTotalAccumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    let totalAccumulatedCost = parseFloat(localStorage.getItem('deepseekTotalAccumulatedCost') || '0');

    const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/chat/completions';

    const defaultSystemInstruction = `你是一位经验丰富的小说家。
请每次续写一个段落，保持语调一致。
确保新段落自然地衔接现有文本，并融入所给的后续剧情提示。
使用与输入或前一段落相同的语言。`;

    apiKeyInput.value = localStorage.getItem('deepseekApiKey') || '';
    modelSelect.value = localStorage.getItem('deepseekModel') || 'deepseek-v4-flash';
    systemInstructionTextarea.value = localStorage.getItem('deepseekSystemInstruction') || defaultSystemInstruction;
    nextParagraphPromptTextarea.value = localStorage.getItem('deepseekNextParagraphPrompt') || '';
    storyOutputTextarea.value = localStorage.getItem('deepseekStoryOutput') || ''; 
    
    accumulatedInputTokensDisplay.textContent = totalAccumulatedInputTokens;
    accumulatedOutputTokensDisplay.textContent = totalAccumulatedOutputTokens;
    if (accumulatedTokensDisplay) accumulatedTokensDisplay.textContent = totalAccumulatedTokens;
    if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = `$${totalAccumulatedCost.toFixed(6)}`;

    revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();

    apiKeyInput.addEventListener('input', () => localStorage.setItem('deepseekApiKey', apiKeyInput.value));
    modelSelect.addEventListener('change', () => localStorage.setItem('deepseekModel', modelSelect.value));
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem('deepseekSystemInstruction', systemInstructionTextarea.value));
    nextParagraphPromptTextarea.addEventListener('input', () => localStorage.setItem('deepseekNextParagraphPrompt', nextParagraphPromptTextarea.value));
    
    storyOutputTextarea.addEventListener('input', () => {
        localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
        revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
    });

    clearNextParagraphPromptBtn.addEventListener('click', () => {
        nextParagraphPromptTextarea.value = '';
        localStorage.removeItem('deepseekNextParagraphPrompt');
    });

    generateBtn.addEventListener('click', generateParagraph);
    revertLastParagraphBtn.addEventListener('click', removeLastParagraph);
    clearAllBtn.addEventListener('click', clearAllContents);
    saveStoryBtn.addEventListener('click', saveStory);
    loadStoryBtn.addEventListener('click', () => loadStoryInput.click());
    loadStoryInput.addEventListener('change', loadStory);

    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            showError('Generation stopped by user.');
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            loadingIndicator.classList.add('hidden');
            abortController = null;
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
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
            deepseekLogs.length = 0;
            debugLogsContainer.innerHTML = '';
        }
    });

    function clearAllContents() {
        if (!confirm('Are you sure you want to clear all contents and settings (except API key)?')) {
            return;
        }

        modelSelect.value = 'deepseek-v4-flash'; 
        systemInstructionTextarea.value = defaultSystemInstruction; 
        nextParagraphPromptTextarea.value = ''; 
        storyOutputTextarea.value = '';

        revertLastParagraphBtn.disabled = true;

        localStorage.removeItem('deepseekModel');
        localStorage.removeItem('deepseekSystemInstruction');
        localStorage.removeItem('deepseekNextParagraphPrompt');
        localStorage.removeItem('deepseekStoryOutput'); 
        localStorage.removeItem('deepseekTotalAccumulatedInputTokens'); 
        localStorage.removeItem('deepseekTotalAccumulatedOutputTokens'); 
        localStorage.removeItem('deepseekTotalAccumulatedCost');

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

    function removeLastParagraph() {
        let currentStory = storyOutputTextarea.value.trim();
        if (!currentStory) {
            revertLastParagraphBtn.disabled = true;
            return;
        }

        let paragraphs = currentStory.split(/\n\n/).map(p => p.trim()).filter(p => p !== '');
        if (paragraphs.length > 0) {
            paragraphs.pop();
            storyOutputTextarea.value = paragraphs.join('\n\n');
            localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
            storyOutputTextarea.scrollTop = storyOutputTextarea.scrollHeight;
        } else {
            storyOutputTextarea.value = '';
            localStorage.setItem('deepseekStoryOutput', '');
            revertLastParagraphBtn.disabled = true;
        }
    }

    function saveStory() {
        const storyState = {
            storyOutput: storyOutputTextarea.value,
            systemInstruction: systemInstructionTextarea.value,
            nextParagraphPrompt: nextParagraphPromptTextarea.value,
            model: modelSelect.value
        };

        const jsonString = JSON.stringify(storyState, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        const filename = `story_save_${timestamp}.json`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    function loadStory(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const storyState = JSON.parse(e.target.result);
                const storyText = storyState.storyOutput !== undefined ? storyState.storyOutput : storyState.story;
                if (storyText === undefined) {
                    throw new Error('无效的存档文件格式。');
                }

                storyOutputTextarea.value = storyText || '';
                if (storyState.nextParagraphPrompt !== undefined) {
                    nextParagraphPromptTextarea.value = storyState.nextParagraphPrompt;
                } else {
                    nextParagraphPromptTextarea.value = '';
                }
                
                if (storyState.systemInstruction !== undefined) {
                    systemInstructionTextarea.value = storyState.systemInstruction;
                }
                if (storyState.model !== undefined) {
                    modelSelect.value = storyState.model;
                }

                localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
                localStorage.setItem('deepseekNextParagraphPrompt', nextParagraphPromptTextarea.value);
                if (storyState.systemInstruction !== undefined) {
                    localStorage.setItem('deepseekSystemInstruction', systemInstructionTextarea.value);
                }
                if (storyState.model !== undefined) {
                    localStorage.setItem('deepseekModel', modelSelect.value);
                }

                revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
                showError('');
                alert('故事加载成功！');
            } catch (err) {
                showError(`加载故事失败: ${err.message}`);
            }
            loadStoryInput.value = '';
        };
        reader.readAsText(file);
    }

    function calculateRequestCost(model, inputTokens, outputTokens) {
        const pricingConfig = DEEPSEEK_PRICING_CONFIG.TEXT[model];
        if (!pricingConfig) return 0;
        const { inputRate, outputRate } = pricingConfig.getPricing(inputTokens);
        return (inputTokens * inputRate) + (outputTokens * outputRate);
    }

    async function generateParagraph() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const systemInstruction = systemInstructionTextarea.value.trim();
        const currentStory = storyOutputTextarea.value.trim();
        const nextParagraphPrompt = nextParagraphPromptTextarea.value.trim();

        if (!apiKey) {
            showError('Please enter your DeepSeek API Key.');
            return;
        }
        
        if (abortController) return;

        abortController = new AbortController();
        const signal = abortController.signal;

        generateBtn.disabled = true;
        generateBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        revertLastParagraphBtn.disabled = true;
        loadingIndicator.classList.remove('hidden');
        showError(''); 

        currentRequestInputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestOutputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestCostDisplay.textContent = 'Calculating...';
        
        let userPrompt = '';
        if (currentStory === '') {
            userPrompt = `Start a new story. The first paragraph should be about: ${nextParagraphPrompt}`;
        } else {
            userPrompt = `Here is the story so far:\n\n${currentStory}\n\nWhat should happen next is: ${nextParagraphPrompt}\n\nContinue the story with ONE new paragraph, making sure it logically follows the previous text and incorporates the "what should happen next" prompt.`;
        }
        
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: userPrompt });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.9,
            stream: false
        };

        const requestBodyString = JSON.stringify(requestBody);

        try {
            const response = await fetch(DEEPSEEK_API_BASE_URL, {
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
                appendDebugLog(requestBodyString, errorData);
                throw new Error(errorData.error ? errorData.error.message : response.statusText);
            }

            const data = await response.json();
            appendDebugLog(requestBodyString, data);

            const generatedText = data.choices?.[0]?.message?.content;
            const promptTokens = data.usage?.prompt_tokens || 0;
            const completionTokens = data.usage?.completion_tokens || 0; 

            const requestCost = calculateRequestCost(selectedModel, promptTokens, completionTokens);
            totalAccumulatedCost += requestCost;

            currentRequestInputTokensDisplay.textContent = promptTokens;
            currentRequestOutputTokensDisplay.textContent = completionTokens;
            currentRequestCostDisplay.textContent = `$${requestCost.toFixed(6)}`;
            
            totalAccumulatedInputTokens += promptTokens;
            totalAccumulatedOutputTokens += completionTokens;
            totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens; 

            accumulatedInputTokensDisplay.textContent = totalAccumulatedInputTokens;
            accumulatedOutputTokensDisplay.textContent = totalAccumulatedOutputTokens;
            if (accumulatedTokensDisplay) accumulatedTokensDisplay.textContent = totalAccumulatedTokens;
            if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = `$${totalAccumulatedCost.toFixed(6)}`;

            localStorage.setItem('deepseekTotalAccumulatedInputTokens', totalAccumulatedInputTokens.toString());
            localStorage.setItem('deepseekTotalAccumulatedOutputTokens', totalAccumulatedOutputTokens.toString());
            localStorage.setItem('deepseekTotalAccumulatedCost', totalAccumulatedCost.toString());

            if (generatedText) {
                if (storyOutputTextarea.value.trim() === '') {
                    storyOutputTextarea.value = generatedText.trim();
                } else {
                    storyOutputTextarea.value += '\n\n' + generatedText.trim();
                }
                localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value); 
                storyOutputTextarea.scrollTop = storyOutputTextarea.scrollHeight;
            } else {
                showError('No content generated.');
                currentRequestInputTokensDisplay.textContent = '0'; 
                currentRequestOutputTokensDisplay.textContent = '0'; 
                currentRequestCostDisplay.textContent = '$0.000000';
            }

        } catch (error) {
            console.error('Error calling DeepSeek API:', error);
            if (error.name === 'AbortError') {
                showError('Generation stopped by user.');
            } else {
                showError(`Failed to generate: ${error.message}`);
                appendDebugLog(requestBodyString, error);
            }
            currentRequestInputTokensDisplay.textContent = '0'; 
            currentRequestOutputTokensDisplay.textContent = '0'; 
            currentRequestCostDisplay.textContent = '$0.000000';
        } finally {
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            loadingIndicator.classList.add('hidden');
            abortController = null;
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
        }
    }

    function appendDebugLog(requestBodyString, responseOrError) {
        deepseekLogs.push({
            timestamp: new Date().toLocaleString(),
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

            const requestSummary = document.createElement('details');
            requestSummary.innerHTML = `<summary><strong>Request #${index + 1}</strong> (${log.timestamp})</summary>`;
            const requestPre = document.createElement('pre');
            requestPre.textContent = JSON.stringify(log.request, null, 2);
            requestSummary.appendChild(requestPre);
            logEntryDiv.appendChild(requestSummary);

            const responseSummary = document.createElement('details');
            const responseData = log.response instanceof Error ? 
                                 { error: log.response.message, stack: log.response.stack } : 
                                 log.response;
            responseSummary.innerHTML = `<summary><strong>Response #${index + 1}</strong></summary>`;
            const responsePre = document.createElement('pre');
            responsePre.textContent = JSON.stringify(responseData, null, 2);
            responseSummary.appendChild(responsePre);
            logEntryDiv.appendChild(responseSummary);

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
