document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const systemInstructionTextarea = document.getElementById('systemInstruction');
    const nextParagraphPromptTextarea = document.getElementById('nextParagraphPrompt');
    const targetWordCountInput = document.getElementById('targetWordCount');
    const storyOutputTextarea = document.getElementById('storyOutput');
    const generateBtn = document.getElementById('generateBtn');
    const stopBtn = document.getElementById('stopBtn'); // Reference to the stop button
    const revertLastParagraphBtn = document.getElementById('revertLastParagraphBtn'); 
    const clearAllBtn = document.getElementById('clearAllBtn');
    const saveStoryBtn = document.getElementById('saveStoryBtn');
    const loadStoryBtn = document.getElementById('loadStoryBtn');
    const loadStoryInput = document.getElementById('loadStoryInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const clearNextParagraphPromptBtn = document.getElementById('clearNextParagraphPromptBtn'); // New: Reference to the clear prompt button

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

    // Load accumulated tokens from localStorage, default to 0 if not found
    let totalAccumulatedInputTokens = parseInt(localStorage.getItem('geminiTotalAccumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem('geminiTotalAccumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    
    // Load accumulated cost
    let totalAccumulatedCost = parseFloat(localStorage.getItem('geminiTotalAccumulatedCost') || '0');

    const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

    const defaultSystemInstruction = `You are a skilled story writer.
Continue the story one paragraph at a time, keeping the tone consistent.
Ensure the new paragraph naturally follows the existing text and incorporates the given prompt for the next part of the story.
Use the same language as input or previous paragraph.`;
    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
    modelSelect.value = localStorage.getItem('geminiModel') || 'gemini-2.5-flash-lite';
    systemInstructionTextarea.value = localStorage.getItem('geminiSystemInstruction') || defaultSystemInstruction;
    nextParagraphPromptTextarea.value = localStorage.getItem('geminiNextParagraphPrompt') || '';
    if (targetWordCountInput) targetWordCountInput.value = localStorage.getItem('geminiTargetWordCount') || '100';
    storyOutputTextarea.value = localStorage.getItem('geminiStoryOutput') || ''; 
    
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

    // Initialize button state based on loaded story content.
    revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();

    // Save settings to localStorage on change
    apiKeyInput.addEventListener('input', () => localStorage.setItem('geminiApiKey', apiKeyInput.value));
    modelSelect.addEventListener('change', () => localStorage.setItem('geminiModel', modelSelect.value));
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem('geminiSystemInstruction', systemInstructionTextarea.value));
    nextParagraphPromptTextarea.addEventListener('input', () => localStorage.setItem('geminiNextParagraphPrompt', nextParagraphPromptTextarea.value));
    
    // Save story on manual input and update button state
    if (targetWordCountInput) targetWordCountInput.addEventListener('input', () => localStorage.setItem('geminiTargetWordCount', targetWordCountInput.value));
    storyOutputTextarea.addEventListener('input', () => {
        localStorage.setItem('geminiStoryOutput', storyOutputTextarea.value);
        revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim(); // Update button state on manual edit
        if (findInput && findInput.value) {
            updateFindMatchCount();
        }
    });

    // New: Event listener for clearing nextParagraphPrompt
    clearNextParagraphPromptBtn.addEventListener('click', () => {
        nextParagraphPromptTextarea.value = '';
        localStorage.removeItem('geminiNextParagraphPrompt'); // Also clear from local storage
    });

    generateBtn.addEventListener('click', generateParagraph);
    revertLastParagraphBtn.addEventListener('click', removeLastParagraph); // This function will now remove the last paragraph
    clearAllBtn.addEventListener('click', clearAllContents);
    saveStoryBtn.addEventListener('click', saveStory);
    loadStoryBtn.addEventListener('click', () => loadStoryInput.click());
    loadStoryInput.addEventListener('change', loadStory);

    // Stop button event listener
    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort(); // Signal to abort the fetch request
            showError('Generation stopped by user.'); // Inform the user
            // Immediately update UI to reflect stopping
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            loadingIndicator.classList.add('hidden');
            abortController = null; // Clear the controller
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim(); // Re-evaluate based on current content
        }
    });

    // Debug panel event listeners
    debugToggleBtn.addEventListener('click', () => {
        debugPanel.classList.toggle('hidden');
        if (!debugPanel.classList.contains('hidden')) {
            debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight; // Scroll to bottom on open
        }
    });

    clearDebugLogsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all debug logs?')) {
            geminiLogs.length = 0; // Clear the array
            debugLogsContainer.innerHTML = ''; // Clear the display
        }
    });

    function clearAllContents() {
        if (!confirm('Are you sure you want to clear all contents and settings (except API key)? This cannot be undone.')) {
            return;
        }

        modelSelect.value = 'gemini-2.5-flash-lite'; 
        systemInstructionTextarea.value = defaultSystemInstruction; 
        nextParagraphPromptTextarea.value = ''; 
        if (targetWordCountInput) targetWordCountInput.value = '100';
        storyOutputTextarea.value = '';

        revertLastParagraphBtn.disabled = true;

        // Clear localStorage (except API key)
        localStorage.removeItem('geminiModel');
        localStorage.removeItem('geminiSystemInstruction');
        localStorage.removeItem('geminiNextParagraphPrompt');
        localStorage.removeItem('geminiTargetWordCount');
        localStorage.removeItem('geminiStoryOutput'); 
        localStorage.removeItem('geminiTotalAccumulatedInputTokens'); 
        localStorage.removeItem('geminiTotalAccumulatedOutputTokens'); 
        localStorage.removeItem('geminiTotalAccumulatedCost');

        // Clear token displays
        totalAccumulatedInputTokens = 0; 
        totalAccumulatedOutputTokens = 0; 
        totalAccumulatedTokens = 0; 
        totalAccumulatedCost = 0;

        currentRequestInputTokensDisplay.textContent = '0';
        currentRequestOutputTokensDisplay.textContent = '0';
        if (accumulatedInputTokensDisplay) { accumulatedInputTokensDisplay.textContent = '0'; }
        if (accumulatedOutputTokensDisplay) { accumulatedOutputTokensDisplay.textContent = '0'; } // Fixed typo in variable name here
        if (accumulatedTokensDisplay) { 
            accumulatedTokensDisplay.textContent = '0';
        }

        // Clear cost displays
        if (currentRequestCostDisplay) currentRequestCostDisplay.textContent = '$0.000000';
        if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = '$0.000000';

        showError(''); 
    }

    // This function is now responsible for removing the last paragraph directly from the textbox.
    function removeLastParagraph() {
        let currentStory = storyOutputTextarea.value.trim();
        if (!currentStory) {
            revertLastParagraphBtn.disabled = true;
            return;
        }

        // Split by two or more newlines to identify distinct paragraphs.
        // Trim each part and filter out any empty strings resulting from the split.
        let paragraphs = currentStory.split(/\n\n/).map(p => p.trim()).filter(p => p !== '');

        if (paragraphs.length > 0) {
            paragraphs.pop(); // Remove the last actual paragraph
            storyOutputTextarea.value = paragraphs.join('\n\n');
            localStorage.setItem('geminiStoryOutput', storyOutputTextarea.value);
            
            // Re-evaluate button state based on the new content
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
            storyOutputTextarea.scrollTop = storyOutputTextarea.scrollHeight;
        } else {
            // If there were no discernible paragraphs left after splitting/filtering
            storyOutputTextarea.value = '';
            localStorage.setItem('geminiStoryOutput', '');
            revertLastParagraphBtn.disabled = true;
        }
    }

    function saveStory() {
        const storyState = {
            storyOutput: storyOutputTextarea.value,
            systemInstruction: systemInstructionTextarea.value,
            nextParagraphPrompt: nextParagraphPromptTextarea.value,
            targetWordCount: targetWordCountInput ? targetWordCountInput.value : '100',
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
                    throw new Error('Invalid save file format.');
                }

                storyOutputTextarea.value = storyText || '';
                if (storyState.nextParagraphPrompt !== undefined) {
                    nextParagraphPromptTextarea.value = storyState.nextParagraphPrompt;
                } else {
                    nextParagraphPromptTextarea.value = '';
                }
                if (targetWordCountInput) {
                    targetWordCountInput.value = storyState.targetWordCount !== undefined ? storyState.targetWordCount : '100';
                    localStorage.setItem('geminiTargetWordCount', targetWordCountInput.value);
                }
                
                if (storyState.systemInstruction !== undefined) {
                    systemInstructionTextarea.value = storyState.systemInstruction;
                }
                if (storyState.model !== undefined) {
                    modelSelect.value = storyState.model;
                }

                localStorage.setItem('geminiStoryOutput', storyOutputTextarea.value);
                localStorage.setItem('geminiNextParagraphPrompt', nextParagraphPromptTextarea.value);
                if (storyState.systemInstruction !== undefined) {
                    localStorage.setItem('geminiSystemInstruction', systemInstructionTextarea.value);
                }
                if (storyState.model !== undefined) {
                    localStorage.setItem('geminiModel', modelSelect.value);
                }

                revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
                showError('');
                alert('Story loaded successfully!');
            } catch (err) {
                showError(`Failed to load story: ${err.message}`);
            }
            loadStoryInput.value = '';
        };
        reader.readAsText(file);
    }

    function calculateRequestCost(model, inputTokens, outputTokens) {
        const pricingConfig = GEMINI_PRICING_CONFIG.TEXT[model];
        if (!pricingConfig) return 0;

        const { inputRate, outputRate } = pricingConfig.getPricing(inputTokens);
        
        // inputRate and outputRate are already per token (e.g. 0.30 / 1_000_000)
        const inputCost = inputTokens * inputRate;
        const outputCost = outputTokens * outputRate;

        return inputCost + outputCost;
    }

    async function generateParagraph() {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelect.value;
        const systemInstruction = systemInstructionTextarea.value.trim();
        const currentStory = storyOutputTextarea.value.trim();
        const nextParagraphPrompt = nextParagraphPromptTextarea.value.trim();
        const targetWordCount = targetWordCountInput ? (targetWordCountInput.value.trim() || '100') : '100';

        if (!apiKey) {
            showError('Please enter your Gemini API Key.');
            return;
        }
        
        if (abortController) { // Prevent starting a new generation if one is already active
            showError('Another generation is already in progress. Please wait or stop it first.');
            return;
        }

        abortController = new AbortController(); // Initialize AbortController for this request
        const signal = abortController.signal;

        generateBtn.disabled = true;
        generateBtn.classList.add('hidden'); // Hide generate button
        stopBtn.classList.remove('hidden'); // Show stop button
        revertLastParagraphBtn.disabled = true; // Disable during generation
        loadingIndicator.classList.remove('hidden');
        showError(''); 

        currentRequestInputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestOutputTokensDisplay.textContent = 'Calculating...'; 
        currentRequestCostDisplay.textContent = 'Calculating...';
        
        let userPrompt = '';
        if (currentStory === '') {
            userPrompt = `Start a new story. The first paragraph should be about: ${nextParagraphPrompt}\n\nThe target word count for this paragraph is approximately ${targetWordCount} words.`;
        } else {
            userPrompt = `Here is the story so far:\n\n${currentStory}\n\nWhat should happen next is: ${nextParagraphPrompt}\n\nContinue the story with ONE new paragraph of approximately ${targetWordCount} words, making sure it logically follows the previous text and incorporates the "what should happen next" prompt.`;
        }
        
        const requestBody = {
            contents: [{
                role: 'user',
                parts: [{ text: userPrompt }]
            }],
            generationConfig: {
                temperature: 0.9,
                topP: 1,
                topK: 1,
                // maxOutputTokens: 500, 
            },
            safetySettings:[{
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'OFF',
            }, {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'OFF',
            }, {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'OFF',
            }, {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'OFF',
            }, {
                category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
                threshold: 'OFF',
            }],
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const requestBodyString = JSON.stringify(requestBody); // Store stringified version for debug log

        try {
            const response = await fetch(`${GEMINI_API_BASE_URL}${selectedModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBodyString,
                signal: signal, // Pass the AbortController's signal here
            });

            if (!response.ok) {
                const errorData = await response.json();
                appendDebugLog(requestBodyString, errorData); // Log error response
                throw new Error(errorData.error ? errorData.error.message : response.statusText);
            }

            const data = await response.json();
            appendDebugLog(requestBodyString, data); // Log successful response

            const generatedText = data.candidates[0]?.content?.parts[0]?.text;

            const promptTokens = data.usageMetadata?.promptTokenCount || 0;
            const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0; 

            // Calculate Cost
            const requestCost = calculateRequestCost(selectedModel, promptTokens, candidateTokens);
            totalAccumulatedCost += requestCost;

            // Update Displays
            currentRequestInputTokensDisplay.textContent = promptTokens;
            currentRequestOutputTokensDisplay.textContent = candidateTokens;
            currentRequestCostDisplay.textContent = `$${requestCost.toFixed(6)}`;
            
            totalAccumulatedInputTokens += promptTokens;
            totalAccumulatedOutputTokens += candidateTokens;
            totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens; 

            accumulatedInputTokensDisplay.textContent = totalAccumulatedInputTokens;
            accumulatedOutputTokensDisplay.textContent = totalAccumulatedOutputTokens;
            if (accumulatedTokensDisplay) { 
                accumulatedTokensDisplay.textContent = totalAccumulatedTokens;
            }
            if (accumulatedCostDisplay) {
                accumulatedCostDisplay.textContent = `$${totalAccumulatedCost.toFixed(6)}`;
            }

            // Save to LocalStorage
            localStorage.setItem('geminiTotalAccumulatedInputTokens', totalAccumulatedInputTokens.toString());
            localStorage.setItem('geminiTotalAccumulatedOutputTokens', totalAccumulatedOutputTokens.toString());
            localStorage.setItem('geminiTotalAccumulatedCost', totalAccumulatedCost.toString());

            if (generatedText) {
                if (storyOutputTextarea.value.trim() === '') {
                    storyOutputTextarea.value = generatedText.trim();
                } else {
                    storyOutputTextarea.value += '\n\n' + generatedText.trim();
                }
                localStorage.setItem('geminiStoryOutput', storyOutputTextarea.value); 
                // nextParagraphPromptTextarea.value = ''; // Removed as per request: do not clear nextParagraphPrompt
                storyOutputTextarea.scrollTop = storyOutputTextarea.scrollHeight;
            } else {
                showError('No content generated. The model might have been blocked due to safety concerns or returned an empty response.');
                currentRequestInputTokensDisplay.textContent = '0'; 
                currentRequestOutputTokensDisplay.textContent = '0'; 
                currentRequestCostDisplay.textContent = '$0.000000';
            }

        } catch (error) {
            console.error('Error calling Gemini API:', error);
            if (error.name === 'AbortError') {
                showError('Generation stopped by user.');
            } else {
                showError(`Failed to generate paragraph: ${error.message}`);
                if (!error.isLoggedAsResponse) {
                    appendDebugLog(requestBodyString, error);
                }
            }
            currentRequestInputTokensDisplay.textContent = '0'; 
            currentRequestOutputTokensDisplay.textContent = '0'; 
            currentRequestCostDisplay.textContent = '$0.000000';
        } finally {
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden'); // Show generate button
            stopBtn.classList.add('hidden'); // Hide stop button
            loadingIndicator.classList.add('hidden');
            abortController = null; // Clear the controller
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim(); // Re-evaluate based on current content
        }
    }

    // Function to append a new log entry
    function appendDebugLog(requestBodyString, responseOrError) {
        geminiLogs.push({
            timestamp: new Date().toLocaleString(),
            request: JSON.parse(requestBodyString), // Parse back to object for display
            response: responseOrError
        });
        renderDebugLogs();
    }

    // Function to render all logs in the debug panel
    function renderDebugLogs() {
        debugLogsContainer.innerHTML = ''; // Clear previous logs
        geminiLogs.forEach((log, index) => {
            const logEntryDiv = document.createElement('div');
            logEntryDiv.classList.add('debug-log-entry');

            // Request summary
            const requestSummary = document.createElement('details');
            requestSummary.innerHTML = `<summary><strong>Request #${index + 1}</strong> (${log.timestamp})</summary>`;
            const requestPre = document.createElement('pre');
            requestPre.textContent = JSON.stringify(log.request, null, 2);
            requestSummary.appendChild(requestPre);
            logEntryDiv.appendChild(requestSummary);

            // Response summary
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
        debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight; // Scroll to bottom
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

    // --- Find and Replace in Story ---
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
            setFindReplaceStatus('No matches', 'error');
        } else {
            setFindReplaceStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`, 'info');
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
            if (!silent) setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found', 'error');
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
        setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
    }

    function findPrev() {
        if (!storyOutputTextarea || !findInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found', 'error');
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
        setFindReplaceStatus(`Match ${targetIdx + 1} of ${matches.length}`, 'info');
    }

    function replaceCurrent() {
        if (!storyOutputTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
        const matches = getAllMatches(text, regex);
        if (matches.length === 0) {
            setFindReplaceStatus('No matches found to replace', 'error');
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
            localStorage.setItem('geminiStoryOutput', newText);
            revertLastParagraphBtn.disabled = !newText.trim();

            storyOutputTextarea.setSelectionRange(selStart + replacement.length, selStart + replacement.length);
            findNext(true);
            setFindReplaceStatus('Replaced 1 occurrence', 'success');
        } else {
            findNext();
        }
    }

    function replaceAll() {
        if (!storyOutputTextarea || !findInput || !replaceInput) return;
        const query = findInput.value;
        if (!query) {
            setFindReplaceStatus('Please enter text to find', 'error');
            return;
        }
        const regex = getFindRegex(true);
        if (!regex) return;

        const text = storyOutputTextarea.value;
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
        storyOutputTextarea.value = newText;
        localStorage.setItem('geminiStoryOutput', newText);
        revertLastParagraphBtn.disabled = !newText.trim();
        
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