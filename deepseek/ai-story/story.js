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
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorDisplay = document.getElementById('errorDisplay');
    const clearNextParagraphPromptBtn = document.getElementById('clearNextParagraphPromptBtn'); 

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

    // Load accumulated tokens from localStorage, default to 0 if not found
    let totalAccumulatedInputTokens = parseInt(localStorage.getItem('deepseekTotalAccumulatedInputTokens') || '0', 10);
    let totalAccumulatedOutputTokens = parseInt(localStorage.getItem('deepseekTotalAccumulatedOutputTokens') || '0', 10);
    let totalAccumulatedTokens = totalAccumulatedInputTokens + totalAccumulatedOutputTokens;
    
    // Load accumulated cost
    let totalAccumulatedCost = parseFloat(localStorage.getItem('deepseekTotalAccumulatedCost') || '0');

    const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/chat/completions';

    const defaultSystemInstruction = `You are a skilled story writer.
Continue the story one paragraph at a time, keeping the tone consistent.
Ensure the new paragraph naturally follows the existing text and incorporates the given prompt for the next part of the story.
Use the same language as input or previous paragraph.`;

    // Load saved settings from localStorage
    apiKeyInput.value = localStorage.getItem('deepseekApiKey') || '';
    modelSelect.value = localStorage.getItem('deepseekModel') || 'deepseek-chat';
    systemInstructionTextarea.value = localStorage.getItem('deepseekSystemInstruction') || defaultSystemInstruction;
    nextParagraphPromptTextarea.value = localStorage.getItem('deepseekNextParagraphPrompt') || '';
    storyOutputTextarea.value = localStorage.getItem('deepseekStoryOutput') || ''; 
    
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
    apiKeyInput.addEventListener('input', () => localStorage.setItem('deepseekApiKey', apiKeyInput.value));
    modelSelect.addEventListener('change', () => localStorage.setItem('deepseekModel', modelSelect.value));
    systemInstructionTextarea.addEventListener('input', () => localStorage.setItem('deepseekSystemInstruction', systemInstructionTextarea.value));
    nextParagraphPromptTextarea.addEventListener('input', () => localStorage.setItem('deepseekNextParagraphPrompt', nextParagraphPromptTextarea.value));
    
    // Save story on manual input and update button state
    storyOutputTextarea.addEventListener('input', () => {
        localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
        revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim(); // Update button state on manual edit
    });

    // Event listener for clearing nextParagraphPrompt
    clearNextParagraphPromptBtn.addEventListener('click', () => {
        nextParagraphPromptTextarea.value = '';
        localStorage.removeItem('deepseekNextParagraphPrompt'); // Also clear from local storage
    });

    generateBtn.addEventListener('click', generateParagraph);
    revertLastParagraphBtn.addEventListener('click', removeLastParagraph); // This function will now remove the last paragraph
    clearAllBtn.addEventListener('click', clearAllContents);

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
            deepseekLogs.length = 0; // Clear the array
            debugLogsContainer.innerHTML = ''; // Clear the display
        }
    });

    function clearAllContents() {
        if (!confirm('Are you sure you want to clear all contents and settings (except API key)? This cannot be undone.')) {
            return;
        }

        modelSelect.value = 'deepseek-chat'; 
        systemInstructionTextarea.value = defaultSystemInstruction; 
        nextParagraphPromptTextarea.value = ''; // Clear next paragraph prompt as well
        storyOutputTextarea.value = '';

        revertLastParagraphBtn.disabled = true;

        // Clear localStorage (except API key)
        localStorage.removeItem('deepseekModel');
        localStorage.removeItem('deepseekSystemInstruction');
        localStorage.removeItem('deepseekNextParagraphPrompt');
        localStorage.removeItem('deepseekStoryOutput'); 
        localStorage.removeItem('deepseekTotalAccumulatedInputTokens'); 
        localStorage.removeItem('deepseekTotalAccumulatedOutputTokens'); 
        localStorage.removeItem('deepseekTotalAccumulatedCost');

        // Clear token displays
        totalAccumulatedInputTokens = 0; 
        totalAccumulatedOutputTokens = 0; 
        totalAccumulatedTokens = 0; 
        totalAccumulatedCost = 0;

        currentRequestInputTokensDisplay.textContent = '0';
        currentRequestOutputTokensDisplay.textContent = '0';
        if (accumulatedInputTokensDisplay) { accumulatedInputTokensDisplay.textContent = '0'; }
        if (accumulatedOutputTokensDisplay) { accumulatedOutputTokensDisplay.textContent = '0'; }
        if (accumulatedTokensDisplay) { 
            accumulatedTokensDisplay.textContent = '0';
        }

        // Clear cost displays
        if (currentRequestCostDisplay) currentRequestCostDisplay.textContent = '$0.000000';
        if (accumulatedCostDisplay) accumulatedCostDisplay.textContent = '$0.000000';

        showError(''); 
    }

    // This function is responsible for removing the last paragraph directly from the textbox.
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
            localStorage.setItem('deepseekStoryOutput', storyOutputTextarea.value);
            
            // Re-evaluate button state based on the new content
            revertLastParagraphBtn.disabled = !storyOutputTextarea.value.trim();
            storyOutputTextarea.scrollTop = storyOutputTextarea.scrollHeight;
        } else {
            // If there were no discernible paragraphs left after splitting/filtering
            storyOutputTextarea.value = '';
            localStorage.setItem('deepseekStoryOutput', '');
            revertLastParagraphBtn.disabled = true;
        }
    }

    function calculateRequestCost(model, inputTokens, outputTokens) {
        const pricingConfig = DEEPSEEK_PRICING_CONFIG.TEXT[model];
        if (!pricingConfig) return 0;

        const { inputRate, outputRate } = pricingConfig.getPricing(inputTokens);
        
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

        if (!apiKey) {
            showError('Please enter your DeepSeek API Key.');
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
            userPrompt = `Start a new story. The first paragraph should be about: ${nextParagraphPrompt}`;
        } else {
            userPrompt = `Here is the story so far:\n\n${currentStory}\n\nWhat should happen next is: ${nextParagraphPrompt}\n\nContinue the story with ONE new paragraph, making sure it logically follows the previous text and incorporates the "what should happen next" prompt.`;
        }
        
        const messages = [];
        if (systemInstruction) {
            messages.push({
                role: 'system',
                content: systemInstruction
            });
        }
        messages.push({
            role: 'user',
            content: userPrompt
        });

        const requestBody = {
            model: selectedModel,
            messages: messages,
            temperature: 0.9,
            stream: false
        };

        const requestBodyString = JSON.stringify(requestBody); // Store stringified version for debug log

        try {
            const response = await fetch(DEEPSEEK_API_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
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

            const generatedText = data.choices?.[0]?.message?.content;

            const promptTokens = data.usage?.prompt_tokens || 0;
            const completionTokens = data.usage?.completion_tokens || 0; 

            // Calculate Cost
            const requestCost = calculateRequestCost(selectedModel, promptTokens, completionTokens);
            totalAccumulatedCost += requestCost;

            // Update Displays
            currentRequestInputTokensDisplay.textContent = promptTokens;
            currentRequestOutputTokensDisplay.textContent = completionTokens;
            currentRequestCostDisplay.textContent = `$${requestCost.toFixed(6)}`;
            
            totalAccumulatedInputTokens += promptTokens;
            totalAccumulatedOutputTokens += completionTokens;
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
                showError('No content generated. The model might have been blocked due to safety concerns or returned an empty response.');
                currentRequestInputTokensDisplay.textContent = '0'; 
                currentRequestOutputTokensDisplay.textContent = '0'; 
                currentRequestCostDisplay.textContent = '$0.000000';
            }

        } catch (error) {
            console.error('Error calling DeepSeek API:', error);
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
        deepseekLogs.push({
            timestamp: new Date().toLocaleString(),
            request: JSON.parse(requestBodyString), // Parse back to object for display
            response: responseOrError
        });
        renderDebugLogs();
    }

    // Function to render all logs in the debug panel
    function renderDebugLogs() {
        debugLogsContainer.innerHTML = ''; // Clear previous logs
        deepseekLogs.forEach((log, index) => {
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
});
