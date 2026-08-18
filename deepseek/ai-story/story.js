document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextParagraphPromptTextarea = document.getElementById('nextParagraphPrompt');
    const targetWordCountInput = document.getElementById('targetWordCount');
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
    if (targetWordCountInput) targetWordCountInput.value = localStorage.getItem('deepseekTargetWordCount') || '200';
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
    if (targetWordCountInput) targetWordCountInput.addEventListener('input', () => localStorage.setItem('deepseekTargetWordCount', targetWordCountInput.value));
    
    storyOutputTextarea.addEventListener('input', () => {
        localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
        revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
        if (findInput && findInput.value) {
            updateFindMatchCount();
        }
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
        if (targetWordCountInput) targetWordCountInput.value = '200';
        storyOutputTextarea.value = '';

        revertLastParagraphBtn.disabled = true;

        localStorage.removeItem('deepseekModel');
        localStorage.removeItem('deepseekSystemInstruction');
        localStorage.removeItem('deepseekNextParagraphPrompt');
        localStorage.removeItem('deepseekTargetWordCount');
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
            targetWordCount: targetWordCountInput ? targetWordCountInput.value : '200',
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
                if (targetWordCountInput) {
                    targetWordCountInput.value = storyState.targetWordCount !== undefined ? storyState.targetWordCount : '200';
                    localStorage.setItem('deepseekTargetWordCount', targetWordCountInput.value);
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
        const targetWordCount = targetWordCountInput ? (targetWordCountInput.value.trim() || '200') : '200';

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
            userPrompt = `Start a new story. The first paragraph should be about: ${nextParagraphPrompt}\n\n请注意：这一段的字数大概在 ${targetWordCount} 字左右。`;
        } else {
            userPrompt = `Here is the story so far:\n\n${currentStory}\n\nWhat should happen next is: ${nextParagraphPrompt}\n\nContinue the story with ONE new paragraph of approximately ${targetWordCount} words (大约 ${targetWordCount} 字), making sure it logically follows the previous text and incorporates the "what should happen next" prompt.`;
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

    // --- 故事查找与替换 (Find and Replace in Story) ---
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
        if (!findInput || !storyOutputTextarea) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;
        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到匹配项', 'error');
        } else {
            setFindReplaceStatus(`找到 ${matches.length} 处匹配`, 'info');
        }
    }

    function scrollToMatch(matchIndex) {
        if (!storyOutputTextarea) return;
        const textBefore = storyOutputTextarea.value.substring(0, matchIndex);
        const linesBefore = textBefore.split('\n').length;
        const totalLines = Math.max(1, storyOutputTextarea.value.split('\n').length);
        
        const boxRect = storyOutputTextarea.getBoundingClientRect();
        const boxTop = boxRect.top + window.scrollY;
        const estimatedOffset = (linesBefore / totalLines) * storyOutputTextarea.clientHeight;
        const targetScrollY = boxTop + estimatedOffset - (window.innerHeight / 2);
        
        window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior: 'smooth'
        });
    }

    function findNext(silent = false) {
        if (!storyOutputTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            if (!silent) setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到匹配项', 'error');
            return;
        }

        const currentSelEnd = storyOutputTextarea.selectionEnd || 0;
        let targetIdx = matches.findIndex(m => m.index >= currentSelEnd);
        if (targetIdx === -1) {
            targetIdx = 0;
        }

        const targetMatch = matches[targetIdx];
        storyOutputTextarea.focus();
        storyOutputTextarea.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
        scrollToMatch(targetMatch.index);
        setFindReplaceStatus(`第 ${targetIdx + 1} / ${matches.length} 处匹配`, 'info');
    }

    function findPrev() {
        if (!storyOutputTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到匹配项', 'error');
            return;
        }

        const currentSelStart = storyOutputTextarea.selectionStart || 0;
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
        storyOutputTextarea.focus();
        storyOutputTextarea.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
        scrollToMatch(targetMatch.index);
        setFindReplaceStatus(`第 ${targetIdx + 1} / ${matches.length} 处匹配`, 'info');
    }

    function replaceCurrent() {
        if (!storyOutputTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('未找到可替换的匹配项', 'error');
            return;
        }

        const selStart = storyOutputTextarea.selectionStart;
        const selEnd = storyOutputTextarea.selectionEnd;
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
            storyOutputTextarea.value = newText;
            localStorage.setItem('deepseekStoryOutput', newText);
            revertLastParagraphBtn.disabled = !newText.trim();

            storyOutputTextarea.setSelectionRange(selStart + replacement.length, selStart + replacement.length);
            findNext(true);
            setFindReplaceStatus('已替换 1 处', 'success');
        } else {
            findNext();
        }
    }

    function replaceAll() {
        if (!storyOutputTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('请输入要查找的文本', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
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
        storyOutputTextarea.value = newText;
        localStorage.setItem('deepseekStoryOutput', newText);
        revertLastParagraphBtn.disabled = !newText.trim();
        
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
