// novel.js for DeepSeek Novel Generator (Chinese Version)

// Configuration
const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/chat/completions';
const STORAGE_PREFIX = 'deepseek_novel_';

// State
let currentApiKey = '';
let selectedModel = 'deepseek-v4-flash';
let history = []; // Array of abstract objects
let currentAbstractId = null;
let abortController = null;

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const languageInput = document.getElementById('languageInput');
const modelSelect = document.getElementById('modelSelect');
const numChaptersInput = document.getElementById('numChapters');
const planWordsPerChapterInput = document.getElementById('planWordsPerChapter');
const additionalPromptInput = document.getElementById('additionalPrompt');
const generateButton = document.getElementById('generateButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('statusDiv');
const retryArea = document.getElementById('retryArea');
const retryButton = document.getElementById('retryButton');

// Debug Elements
const debugSection = document.getElementById('debugSection');
const toggleDebug = document.getElementById('toggleDebug');
const debugContent = document.getElementById('debugContent');
const debugUrlPreview = document.getElementById('debugUrlPreview');
const debugRequestPreview = document.getElementById('debugRequestPreview');
const debugActualUrl = document.getElementById('debugActualUrl');
const debugActualRequest = document.getElementById('debugActualRequest');
const debugResponse = document.getElementById('debugResponse');
const requestPreviewGroup = document.getElementById('requestPreviewGroup');
const actualRequestGroup = document.getElementById('actualRequestGroup');
const debugResponseGroup = document.getElementById('apiResponseGroup');

// Abstract Gen Collapsible
const toggleAbstractGen = document.getElementById('toggleAbstractGen');
const abstractGenContent = document.getElementById('abstractGenContent');

// Template Elements
const tplChapters = document.getElementById('tplChapters');
const tplPlanWords = document.getElementById('tplPlanWords');
const tplIdea = document.getElementById('tplIdea');
const tplIdeaWrapper = document.getElementById('tplIdeaWrapper');
const tplLanguage = document.getElementById('tplLanguage');
const toggleInstruction = document.getElementById('toggleInstruction');
const systemInstructionTemplate = document.getElementById('systemInstructionTemplate');

// Result Elements
const resultArea = document.getElementById('resultArea');
const resultTitle = document.getElementById('resultTitle');
const resultContent = document.getElementById('resultContent');
const tokenStats = document.getElementById('tokenStats');
const priceStats = document.getElementById('priceStats');
const saveEditButton = document.getElementById('saveEditButton');
const discardEditButton = document.getElementById('discardEditButton');

// Story Gen Elements
const storyGenControls = document.getElementById('storyGenControls');
const storyModelSelect = document.getElementById('storyModelSelect');
const wordsPerChapterInput = document.getElementById('wordsPerChapter');
const storyAdditionalPromptInput = document.getElementById('storyAdditionalPrompt');
const useThoughtSignatureCheckbox = document.getElementById('useThoughtSignature');
const startStoryButton = document.getElementById('startStoryButton');
const pauseStoryButton = document.getElementById('pauseStoryButton');
const resumeStoryButton = document.getElementById('resumeStoryButton');
const deleteAllChaptersButton = document.getElementById('deleteAllChaptersButton');
const storyArea = document.getElementById('storyArea');

// History Management DOM
const historyList = document.getElementById('historyList');
const saveToFileButton = document.getElementById('saveToFileButton');
const loadFromFileButton = document.getElementById('loadFromFileButton');
const fileInput = document.getElementById('fileInput');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const newAbstractButton = document.getElementById('newAbstractButton');

// Sidebar Elements
const sidebar = document.getElementById('sidebar');
const toggleSidebar = document.getElementById('toggleSidebar');

const SYSTEM_INSTRUCTION_BASE = `
撰写一份简洁且吸引人的故事编写大纲。
请在回复的开头加上 "Title: [您的创意标题]"。
大纲需要包括故事设定、主要角色姓名以及所有 {{chapters}} 个章节的详细计划。

创建一个详细的故事构思。在章节规划中，用大约 100 字来描述每一章。
`.trim();

const CHAPTER_PROMPT_TEMPLATE = `
根据以下完整的故事大纲（计划）以及已经写好的章节，请编写故事的第 {{chapter_num}} 章。
请为该章节生成一个简短的标题。
该章节的字数应大约为 {{words}} 字。重点是按照大纲中针对该特定章节的规划来推进叙事。

--- 完整故事大纲（计划） ---
{{abstract}}
--- 结束完整故事大纲（计划） ---

--- 之前已写好的章节（包括大纲和之前的章节） ---
{{previous_chapters}}
--- 结束之前已写好的章节 ---

现在开始编写第 {{chapter_num}} 章，确保它与之前的章节逻辑衔接，并遵循整体的故事计划。
`.trim();

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadHistory();
    renderHistory();
    updateModelOptions();
    updateDebugPreview();
    
    // Check for API key in general storage if not in novel storage
    if (!apiKeyInput.value) {
        const globalKey = localStorage.getItem('deepseekApiKey');
        if (globalKey) {
            apiKeyInput.value = globalKey;
            currentApiKey = globalKey;
        }
    }

    // Auto-resume pending story generation (standard loop)
    history.forEach(item => {
        if (item.storyStatus === 'generating') {
            generateNextChapter(item.id);
        }
    });

    // Collapsible Logic
    if (toggleInstruction && systemInstructionTemplate) {
        toggleInstruction.addEventListener('click', () => {
            const isCollapsed = systemInstructionTemplate.classList.toggle('collapsed');
            toggleInstruction.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    if (toggleDebug && debugContent) {
        toggleDebug.addEventListener('click', () => {
            const isCollapsed = debugContent.classList.toggle('collapsed');
            toggleDebug.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    if (toggleAbstractGen && abstractGenContent) {
        toggleAbstractGen.addEventListener('click', () => {
            const isCollapsed = abstractGenContent.classList.toggle('collapsed');
            toggleAbstractGen.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    if (toggleStoryDebug && storyDebugContent) {
        toggleStoryDebug.addEventListener('click', () => {
            const isCollapsed = storyDebugContent.classList.toggle('collapsed');
            toggleStoryDebug.querySelector('.toggle-icon').style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    if (toggleSidebar && sidebar) {
        toggleSidebar.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed');
            toggleSidebar.querySelector('.toggle-icon').textContent = isCollapsed ? '▶' : '◀';
            localStorage.setItem(STORAGE_PREFIX + 'sidebarCollapsed', isCollapsed);
        });

        // Initial state
        if (localStorage.getItem(STORAGE_PREFIX + 'sidebarCollapsed') === 'true') {
            sidebar.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
            toggleSidebar.querySelector('.toggle-icon').textContent = '▶';
        }
    }

    // Edit logic
    resultContent.addEventListener('input', () => {
        if (currentAbstractId) {
            const item = history.find(h => h.id === currentAbstractId);
            if (item && item.status === 'completed' && resultContent.textContent !== item.content) {
                saveEditButton.classList.remove('hidden');
                discardEditButton.classList.remove('hidden');
            }
        }
    });

    saveEditButton.addEventListener('click', saveAbstractEdits);
    discardEditButton.addEventListener('click', () => loadAbstract(currentAbstractId));

    // Story Gen Events
    startStoryButton.addEventListener('click', startStoryGeneration);
    pauseStoryButton.addEventListener('click', pauseStoryGeneration);
    resumeStoryButton.addEventListener('click', resumeStoryGeneration);
    deleteAllChaptersButton.addEventListener('click', deleteAllChapters);

    retryButton.addEventListener('click', () => {
        if (currentAbstractId) retryGeneration(currentAbstractId);
    });
});

// Settings Management
function loadSettings() {
    const key = localStorage.getItem(STORAGE_PREFIX + 'apiKey');
    if (key) {
        apiKeyInput.value = key;
        currentApiKey = key;
    }

    const model = localStorage.getItem(STORAGE_PREFIX + 'model');
    if (model) {
        modelSelect.value = model;
        selectedModel = model;
    }
    
    const lang = localStorage.getItem(STORAGE_PREFIX + 'language');
    if (lang) {
        languageInput.value = lang;
    } else {
        languageInput.value = '中文'; // Default to Chinese
    }
    
    const chapters = localStorage.getItem(STORAGE_PREFIX + 'chapters');
    if (chapters) numChaptersInput.value = chapters;

    const planWords = localStorage.getItem(STORAGE_PREFIX + 'planWords');
    if (planWords) planWordsPerChapterInput.value = planWords;
}

function saveSettings() {
    localStorage.setItem(STORAGE_PREFIX + 'apiKey', currentApiKey);
    localStorage.setItem(STORAGE_PREFIX + 'model', selectedModel);
    localStorage.setItem(STORAGE_PREFIX + 'language', languageInput.value);
    localStorage.setItem(STORAGE_PREFIX + 'chapters', numChaptersInput.value);
    localStorage.setItem(STORAGE_PREFIX + 'planWords', planWordsPerChapterInput.value);
}

function saveHistory() {
    localStorage.setItem(STORAGE_PREFIX + 'history', JSON.stringify(history));
}

function loadHistory() {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'history');
    if (saved) {
        try {
            history = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse history", e);
            history = [];
        }
    }
}

function renderHistory() {
    historyList.innerHTML = '';
    // Sort by timestamp descending
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        if (currentAbstractId === item.id) div.classList.add('active');
        
        const title = document.createElement('h4');
        title.textContent = item.title || '无标题';
        
        const info = document.createElement('p');
        const date = new Date(item.timestamp).toLocaleString();
        info.textContent = `${date} | ${item.model}`;
        
        if (item.status === 'failed') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#dc3545';
            statusSpan.textContent = ' (失败)';
            info.appendChild(statusSpan);
        } else if (item.storyStatus === 'generating') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#28a745';
            statusSpan.textContent = ` (正在生成第 ${item.currentChapterIndex} 章...)`;
            info.appendChild(statusSpan);
        } else if (item.storyStatus === 'paused') {
            const statusSpan = document.createElement('span');
            statusSpan.style.color = '#6c757d';
            statusSpan.textContent = ' (已暂停)';
            info.appendChild(statusSpan);
        }

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = '从历史记录中删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });

        div.appendChild(title);
        div.appendChild(info);
        div.appendChild(deleteBtn);
        
        div.addEventListener('click', () => loadAbstract(item.id));
        historyList.appendChild(div);
    });
}

function deleteHistoryItem(id) {
    if (confirm('确定要从历史记录中删除此项吗？')) {
        history = history.filter(h => h.id !== id);
        saveHistory();
        if (currentAbstractId === id) {
            newAbstractButton.click();
        }
        renderHistory();
    }
}

function getTimestampTitle() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `story-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function updateDebugPreview() {
    const chapters = numChaptersInput.value || 'xx';
    const planWords = planWordsPerChapterInput.value || '100';
    const idea = additionalPromptInput.value || '';
    const language = languageInput.value || 'xx';

    if (tplChapters) tplChapters.textContent = chapters;
    if (tplPlanWords) tplPlanWords.textContent = planWords;
    if (tplLanguage) tplLanguage.textContent = language;
    
    let systemInst = SYSTEM_INSTRUCTION_BASE
        .replace('{{chapters}}', chapters)
        .replace('{{plan_words}}', planWords);

    if (idea) {
        if (tplIdea) tplIdea.textContent = idea;
        if (tplIdeaWrapper) tplIdeaWrapper.classList.remove('hidden');
        systemInst += `\n\n故事构思是：${idea}`;
    } else {
        if (tplIdeaWrapper) tplIdeaWrapper.classList.add('hidden');
    }

    systemInst += `\n\n故事语言是 ${language}`;

    const model = modelSelect.value;

    const request = {
        model: model,
        messages: [
            { role: "system", content: systemInst },
            { role: "user", content: "Please generate the novel abstract as instructed." }
        ],
        temperature: 0.7
    };

    const url = DEEPSEEK_API_BASE_URL;
    if (debugUrlPreview) debugUrlPreview.textContent = url;
    if (debugRequestPreview) debugRequestPreview.textContent = JSON.stringify(request, null, 2);
    
    // Reset other debug views when editing
    if (actualRequestGroup) actualRequestGroup.classList.add('hidden');
    if (debugResponseGroup) debugResponseGroup.classList.add('hidden');
    if (requestPreviewGroup) requestPreviewGroup.classList.remove('hidden');
}

function loadAbstract(id) {
    const item = history.find(h => h.id === id);
    if (!item) return; 
    
    currentAbstractId = id;
    resultTitle.textContent = item.title;
    
    if (item.status === 'failed') {
        resultContent.textContent = '生成大纲失败: ' + (item.error || '未知错误');
        statusDiv.textContent = '任务失败。';
        statusDiv.classList.remove('hidden');
        retryArea.classList.remove('hidden');

        tokenStats.textContent = 'Tokens: -';
        priceStats.textContent = '费用: -';

        if (abstractGenContent) {
            abstractGenContent.classList.remove('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(180deg)';
        }
    } else {
        resultContent.textContent = item.content;
        updateStatsDisplay(item.stats);
        statusDiv.classList.add('hidden');
        retryArea.classList.add('hidden');

        // Auto collapse abstract generation session when completed
        if (abstractGenContent) {
            abstractGenContent.classList.add('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
        }
    }

    if (saveEditButton) saveEditButton.classList.add('hidden');
    if (discardEditButton) discardEditButton.classList.add('hidden');
    
    // Restore inputs and update preview
    if (item.params) {
        languageInput.value = item.params.language;
        modelSelect.value = item.params.model;
        numChaptersInput.value = item.params.numChapters;
        additionalPromptInput.value = item.params.prompt;
        updateDebugPreview();
    }
    
    if (resultArea) resultArea.classList.remove('hidden');

    if (item.status === 'completed') {
        storyGenControls.classList.remove('hidden');
        renderChapters(item);
        
        // Show debug section if generating or paused
        if (item.storyStatus === 'generating' || item.storyStatus === 'paused') {
            if (storyDebugSection) storyDebugSection.classList.remove('hidden');
        } else {
            if (storyDebugSection) storyDebugSection.classList.add('hidden');
        }

        // Show/hide buttons based on story status
        if (item.storyStatus === 'generating') {
            startStoryButton.classList.add('hidden');
            pauseStoryButton.classList.remove('hidden');
            resumeStoryButton.classList.add('hidden');
            deleteAllChaptersButton.classList.add('hidden');
        } else if (item.storyStatus === 'paused') {
            startStoryButton.classList.add('hidden');
            pauseStoryButton.classList.add('hidden');
            resumeStoryButton.classList.remove('hidden');
            deleteAllChaptersButton.classList.remove('hidden');
        } else {
            startStoryButton.classList.toggle('hidden', !!(item.chapters && item.chapters.length > 0));
            pauseStoryButton.classList.add('hidden');
            resumeStoryButton.classList.add('hidden');
            deleteAllChaptersButton.classList.toggle('hidden', !(item.chapters && item.chapters.length > 0));
        }

        if (item.storyParams) {
            storyModelSelect.value = item.storyParams.model || 'deepseek-v4-flash';
            wordsPerChapterInput.value = item.storyParams.words || 5000;
            storyAdditionalPromptInput.value = item.storyParams.prompt || '';
            useThoughtSignatureCheckbox.checked = !!item.storyParams.useThought;
        }
    } else {
        storyGenControls.classList.add('hidden');
        storyArea.classList.add('hidden');
    }

    renderHistory();
}

function renderChapters(item) {
    storyArea.innerHTML = '';
    if (!item.chapters || item.chapters.length === 0) {
        storyArea.classList.add('hidden');
        return;
    }
    storyArea.classList.remove('hidden');

    item.chapters.forEach((chapter, index) => {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        
        const isLast = (index === item.chapters.length - 1);
        if (!isLast) {
            card.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'chapter-header';
        
        const titleGroup = document.createElement('div');
        titleGroup.className = 'chapter-title-group';

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▼';
        toggleIcon.style.color = '#007bff';
        toggleIcon.style.fontSize = '1.2em';
        if (!isLast) {
            toggleIcon.style.transform = 'rotate(-90deg)';
        }

        const title = document.createElement('h2');
        title.textContent = chapter.title || `第 ${index + 1} 章`;
        
        titleGroup.appendChild(toggleIcon);
        titleGroup.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'chapter-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'hidden';
        saveBtn.textContent = '保存修改';

        const discardBtn = document.createElement('button');
        discardBtn.className = 'secondary hidden';
        discardBtn.textContent = '放弃修改';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'danger';
        deleteBtn.textContent = '删除章节';

        actions.appendChild(saveBtn);
        actions.appendChild(discardBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(titleGroup);
        header.appendChild(actions);
        
        const content = document.createElement('div');
        content.className = 'chapter-content';
        content.contentEditable = true;
        content.textContent = chapter.content;
        
        // Show reasoning content if available and enabled
        if (chapter.thought) {
            const thoughtDiv = document.createElement('div');
            thoughtDiv.className = 'chapter-thought hidden';
            thoughtDiv.style.fontStyle = 'italic';
            thoughtDiv.style.color = '#777';
            thoughtDiv.style.borderLeft = '3px solid #ccc';
            thoughtDiv.style.paddingLeft = '10px';
            thoughtDiv.style.marginBottom = '10px';
            thoughtDiv.textContent = "思考过程:\n" + chapter.thought;
            card.appendChild(thoughtDiv); // Append before content
            
            const toggleThoughtBtn = document.createElement('button');
            toggleThoughtBtn.className = 'secondary';
            toggleThoughtBtn.style.width = 'auto';
            toggleThoughtBtn.style.padding = '4px 8px';
            toggleThoughtBtn.style.fontSize = '0.8em';
            toggleThoughtBtn.style.marginTop = '5px';
            toggleThoughtBtn.style.marginBottom = '5px';
            toggleThoughtBtn.textContent = '显示思维链';
            toggleThoughtBtn.onclick = (e) => {
                e.stopPropagation();
                const isHidden = thoughtDiv.classList.toggle('hidden');
                toggleThoughtBtn.textContent = isHidden ? '显示思维链' : '隐藏思维链';
            };
            header.querySelector('.chapter-actions').prepend(toggleThoughtBtn);
        }
        
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            
            const isCollapsed = card.classList.toggle('collapsed');
            toggleIcon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        });

        content.addEventListener('input', () => {
            const hasChanged = content.textContent !== chapter.content;
            saveBtn.classList.toggle('hidden', !hasChanged);
            discardBtn.classList.toggle('hidden', !hasChanged);
        });

        saveBtn.onclick = () => {
            chapter.content = content.textContent;
            saveHistory();
            saveBtn.classList.add('hidden');
            discardBtn.classList.add('hidden');
        };

        discardBtn.onclick = () => {
            content.textContent = chapter.content;
            saveBtn.classList.add('hidden');
            discardBtn.classList.add('hidden');
        };

        deleteBtn.onclick = () => {
            if (confirm(`确定要删除第 ${index + 1} 章吗？`)) {
                item.chapters.splice(index, 1);
                if (item.currentChapterIndex > item.chapters.length + 1) {
                    item.currentChapterIndex = item.chapters.length + 1;
                }
                saveHistory();
                loadAbstract(item.id);
            }
        };

        card.appendChild(header);
        card.appendChild(content);
        storyArea.appendChild(card);
    });
}

function deleteAllChapters() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;

    if (confirm('确定要删除所有章节吗？此操作无法撤销。')) {
        item.chapters = [];
        item.currentChapterIndex = 1;
        item.storyStatus = 'idle';
        saveHistory();
        loadAbstract(item.id);
    }
}

function saveAbstractEdits() {
    const item = history.find(h => h.id === currentAbstractId);
    if (item) {
        item.content = resultContent.textContent;
        saveHistory();
        saveEditButton.classList.add('hidden');
        discardEditButton.classList.add('hidden');
        alert('修改已保存到历史记录。');
    }
}

// Story Generation Logic
async function startStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;

    if (item.chapters && item.chapters.length > 0) {
        if (!confirm('这将清除现有章节并从第一章重新开始。确定要继续吗？')) return;
    }

    item.chapters = [];
    item.currentChapterIndex = 1;
    item.storyStatus = 'generating';
    item.storyParams = {
        model: storyModelSelect.value,
        words: wordsPerChapterInput.value,
        prompt: storyAdditionalPromptInput.value,
        useThought: useThoughtSignatureCheckbox.checked
    };
    saveHistory();

    if (storyDebugContent) storyDebugContent.innerHTML = '';
    if (storyDebugSection) storyDebugSection.classList.remove('hidden');

    loadAbstract(item.id);
    generateNextChapter(item.id);
}

function pauseStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;
    item.storyStatus = 'paused';
    saveHistory();
    
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    
    loadAbstract(item.id);
    statusDiv.textContent = '小说生成已暂停。';
}

function resumeStoryGeneration() {
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;
    
    item.storyParams = {
        model: storyModelSelect.value,
        words: wordsPerChapterInput.value,
        prompt: storyAdditionalPromptInput.value,
        useThought: useThoughtSignatureCheckbox.checked
    };
    
    item.storyStatus = 'generating';
    saveHistory();
    loadAbstract(item.id);
    
    generateNextChapter(item.id);
}

async function generateNextChapter(id) {
    const item = history.find(h => h.id === id);
    if (!item || item.storyStatus !== 'generating') return;

    const maxChapters = parseInt(item.params.numChapters);
    if (item.currentChapterIndex > maxChapters) {
        item.storyStatus = 'completed';
        saveHistory();
        loadAbstract(id);
        alert('整部小说生成完成！');
        return;
    }

    const model = item.storyParams.model;
    const words = item.storyParams.words;
    const chapterNum = item.currentChapterIndex;
    const additionalPrompt = item.storyParams.prompt;
    const useThought = item.storyParams.useThought;

    const messages = [];
    
    messages.push({
        role: "system",
        content: "你是一位富有创意的作家。请根据提供的大纲编写故事。"
    });

    let initialPrompt = `这里是完整的故事大纲（计划）：\n\n${item.content}\n\n`;
    initialPrompt += `请现在开始编写第 1 章。字数要求大约为 ${words} 字。`;
    if (chapterNum === 1 && additionalPrompt) {
        initialPrompt += `\n附加要求：${additionalPrompt}`;
    }

    messages.push({
        role: "user",
        content: initialPrompt
    });

    item.chapters.forEach((ch, i) => {
        const assistantMsg = {
            role: "assistant",
            content: `Title: ${ch.title}\n${ch.content}`
        };
        if (useThought && ch.thought) {
            assistantMsg.reasoning_content = ch.thought;
        }
        messages.push(assistantMsg);

        const nextIdx = i + 2;
        if (i < item.chapters.length - 1) {
            messages.push({
                role: "user",
                content: `太好了。现在请编写第 ${nextIdx} 章。大约 ${words} 字。`
            });
        }
    });

    if (chapterNum > 1) {
        let currentChPrompt = `太好了。现在请编写第 ${chapterNum} 章。大约 ${words} 字。`;
        if (additionalPrompt) {
            currentChPrompt += `\n附加要求：${additionalPrompt}`;
        }
        messages.push({
            role: "user",
            content: currentChPrompt
        });
    }

    const requestBody = {
        model: model,
        messages: messages,
        temperature: 0.7
    };

    if (currentAbstractId === id) {
        const url = DEEPSEEK_API_BASE_URL;
        if (debugActualUrl) debugActualUrl.textContent = url;
        if (debugActualRequest) debugActualRequest.textContent = JSON.stringify(requestBody, null, 2);
        actualRequestGroup.classList.remove('hidden');
        requestPreviewGroup.classList.add('hidden');
        debugResponseGroup.classList.add('hidden');
    }

    abortController = new AbortController();

    try {
        const url = DEEPSEEK_API_BASE_URL;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentApiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        const data = await response.json();
        
        addStoryDebugLog(`第 ${chapterNum} 章 提交结果`, url, 'POST', requestBody, data);

        if (!response.ok) throw new Error(data.error?.message || JSON.stringify(data));
        
        if (currentAbstractId === id) {
            debugResponse.textContent = JSON.stringify(data, null, 2);
            debugResponseGroup.classList.remove('hidden');
        }

        const choice = data.choices?.[0];
        if (!choice) throw new Error('响应中没有候选结果 (choice)');

        const text = choice.message?.content;
        const thought = choice.message?.reasoning_content;
        
        const { title, content } = parseChapterResponse(text, chapterNum);

        item.chapters.push({ title, content, thought });
        item.currentChapterIndex++;
        saveHistory();

        if (currentAbstractId === id) {
            renderChapters(item);
            statusDiv.textContent = `第 ${chapterNum} 章生成完成。正在开始下一章...`;
        }

        setTimeout(() => {
            const freshItem = history.find(h => h.id === id);
            if (freshItem && freshItem.storyStatus === 'generating') {
                generateNextChapter(id);
            }
        }, 1000);

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('生成已中止');
        } else {
            console.error(e);
            if (currentAbstractId === id) {
                statusDiv.textContent = `开始生成第 ${chapterNum} 章时出错: ${e.message}`;
                alert(`开始生成第 ${chapterNum} 章时出错: ${e.message}`);
            }
            item.storyStatus = 'paused';
            saveHistory();
            loadAbstract(id);
        }
    } finally {
        abortController = null;
    }
}

function parseChapterResponse(text, chapterNum) {
    let title = `第 ${chapterNum} 章`;
    let content = text;
    const titleMatch = text.match(/^(?:Title|Chapter \d+):?\s*(.+)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim();
        content = text.replace(titleMatch[0], '').trim();
    }
    return { title, content };
}

// Generation Logic for Abstract
async function generateAbstract() {
    if (!currentApiKey) {
        alert('请先设置您的 API Key。');
        return;
    }

    const language = languageInput.value;
    const model = modelSelect.value;
    const chapters = numChaptersInput.value;
    const planWords = planWordsPerChapterInput.value;
    const prompt = additionalPromptInput.value;

    let systemInst = SYSTEM_INSTRUCTION_BASE
        .replace('{{chapters}}', chapters)
        .replace('{{plan_words}}', planWords);
    if (prompt) {
        systemInst += `\n\n故事构思是：${prompt}`;
    }
    systemInst += `\n\n故事语言是 ${language}`;

    const messages = [
        { role: 'system', content: systemInst },
        { role: 'user', content: "Please generate the novel abstract as instructed." }
    ];

    const requestBody = {
        model: model,
        messages: messages,
        temperature: 0.7
    };

    const url = DEEPSEEK_API_BASE_URL;
    if (debugActualUrl) debugActualUrl.textContent = url;
    if (debugActualRequest) debugActualRequest.textContent = JSON.stringify(requestBody, null, 2);
    actualRequestGroup.classList.remove('hidden');
    requestPreviewGroup.classList.add('hidden');
    debugResponseGroup.classList.add('hidden');

    generateButton.disabled = true;
    generateButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    statusDiv.textContent = '正在生成大纲...';
    statusDiv.classList.remove('hidden');
    if (resultArea) resultArea.classList.add('hidden');
    
    abortController = new AbortController();

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentApiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        
        if (debugResponse) debugResponse.textContent = JSON.stringify(data, null, 2);
        if (debugResponseGroup) debugResponseGroup.classList.remove('hidden');

        const choice = data.choices?.[0];
        if (!choice) throw new Error('响应中没有候选结果 (choice)');

        const text = choice.message?.content;
        const { title, content } = parseAbstractResponse(text, getTimestampTitle());

        const usage = data.usage;
        const inputTokens = usage?.prompt_tokens || 0;
        const outputTokens = usage?.completion_tokens || 0;
        const cost = calculateCost(model, inputTokens, outputTokens);

        const newEntry = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            title: title,
            status: 'completed',
            content: content,
            model: model,
            params: { language, model, numChapters: chapters, prompt },
            stats: { inputTokens, outputTokens, cost },
            chapters: [],
            currentChapterIndex: 1,
            storyStatus: 'idle'
        };

        history.push(newEntry);
        saveHistory();
        loadAbstract(newEntry.id);
        
        statusDiv.textContent = '大纲生成完成！';
        generateButton.disabled = false;
        generateButton.classList.remove('hidden');
        stopButton.classList.add('hidden');

        if (abstractGenContent) {
            abstractGenContent.classList.add('collapsed');
            if (toggleAbstractGen) toggleAbstractGen.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            statusDiv.textContent = '已取消。';
        } else {
            console.error(e);
            statusDiv.textContent = `出错: ${e.message}`;
            alert(`出错: ${e.message}`);
            
            const newEntry = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                title: getTimestampTitle() + ' (失败)',
                status: 'failed',
                error: e.message,
                model: model,
                params: { language, model, numChapters: chapters, prompt },
                stats: { inputTokens: 0, outputTokens: 0, cost: 0 }
            };
            history.push(newEntry);
            saveHistory();
            loadAbstract(newEntry.id);
        }
        generateButton.disabled = false;
        generateButton.classList.remove('hidden');
        stopButton.classList.add('hidden');
    } finally {
        abortController = null;
    }
}

function parseAbstractResponse(text, fallbackTitle) {
    let title = fallbackTitle;
    let content = text;
    const titleMatch = text.match(/^(?:Title:\s*|#\s*)(.+)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim();
        content = text.replace(titleMatch[0], '').trim();
    } else {
        const lines = text.trim().split('\n');
        if (lines[0] && lines[0].length < 100) {
            title = lines[0].trim();
            content = lines.slice(1).join('\n').trim();
        }
    }
    
    if (content.startsWith('Abstract:')) {
        content = content.replace('Abstract:', '').trim();
    }
    return { title, content };
}

function calculateCost(model, input, output) {
    if (typeof DEEPSEEK_PRICING_CONFIG !== 'undefined' && DEEPSEEK_PRICING_CONFIG.TEXT[model]) {
        const prices = DEEPSEEK_PRICING_CONFIG.TEXT[model].getPricing(input);
        return (input * prices.inputRate) + (output * prices.outputRate);
    }
    return 0;
}

// Stats display format in Chinese
function updateStatsDisplay(stats) {
    tokenStats.textContent = `Tokens: 输入 ${stats.inputTokens} / 输出 ${stats.outputTokens}`;
    priceStats.textContent = `预估费用: $${stats.cost.toFixed(6)}`;
}

function addStoryDebugLog(title, url, method, request, response) {
    if (!storyDebugContent) return;

    const entry = document.createElement('div');
    entry.className = 'debug-log-entry';

    const header = document.createElement('div');
    header.className = 'debug-log-header';
    header.innerHTML = `<span>${title} (${method})</span><span class="debug-log-time">${new Date().toLocaleTimeString()}</span>`;

    const urlDiv = document.createElement('div');
    urlDiv.className = 'debug-url';
    urlDiv.textContent = `URL: ${url}`;

    entry.appendChild(header);
    entry.appendChild(urlDiv);

    if (request) {
        const reqLabel = document.createElement('label');
        reqLabel.textContent = '请求包体 (Request Body):';
        reqLabel.style.color = '#ffc66d';
        reqLabel.style.fontSize = '0.9em';
        reqLabel.style.display = 'block';
        reqLabel.style.marginBottom = '5px';
        const reqPre = document.createElement('pre');
        reqPre.textContent = JSON.stringify(request, null, 2);
        entry.appendChild(reqLabel);
        entry.appendChild(reqPre);
    }

    if (response) {
        const resLabel = document.createElement('label');
        resLabel.textContent = '响应包体 (Response Body):';
        resLabel.style.color = '#ffc66d';
        resLabel.style.fontSize = '0.9em';
        resLabel.style.marginTop = '10px';
        resLabel.style.display = 'block';
        resLabel.style.marginBottom = '5px';
        const resPre = document.createElement('pre');
        resPre.textContent = JSON.stringify(response, null, 2);
        entry.appendChild(resLabel);
        entry.appendChild(resPre);
    }

    storyDebugContent.prepend(entry);
}

function updateModelOptions() {
    selectedModel = modelSelect.value;
    saveSettings();
    updateDebugPreview();
}

async function retryGeneration(id) {
    const item = history.find(h => h.id === id);
    if (!item) return;

    statusDiv.textContent = '正在重试...';
    retryArea.classList.add('hidden');

    languageInput.value = item.params.language;
    modelSelect.value = item.params.model;
    numChaptersInput.value = item.params.numChapters;
    additionalPromptInput.value = item.params.prompt;
    
    // Remove the failed one
    history = history.filter(h => h.id !== id);
    saveHistory();
    
    generateAbstract();
}

// Stub for storyDebugContent if not defined
const storyDebugContent = document.getElementById('storyDebugContent');

// Event Listeners
setApiKeyButton.addEventListener('click', () => {
    currentApiKey = apiKeyInput.value.trim();
    saveSettings();
    alert('API Key 已保存');
});

generateButton.addEventListener('click', generateAbstract);
stopButton.addEventListener('click', () => {
    if (abortController) abortController.abort();
});

modelSelect.addEventListener('change', updateModelOptions);
languageInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
numChaptersInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
planWordsPerChapterInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });
additionalPromptInput.addEventListener('input', () => { saveSettings(); updateDebugPreview(); });

newAbstractButton.addEventListener('click', () => {
    currentAbstractId = null;
    resultArea.classList.add('hidden');
    resultTitle.textContent = '';
    resultContent.textContent = '';
    renderHistory();
});

clearHistoryButton.addEventListener('click', () => {
    if (confirm('确定要清空所有历史记录吗？')) {
        history = [];
        saveHistory();
        newAbstractButton.click();
    }
});

saveToFileButton.addEventListener('click', () => {
    if (!currentAbstractId) {
        alert('请先从历史记录中选择一个任务进行保存。');
        return;
    }
    const item = history.find(h => h.id === currentAbstractId);
    if (!item) return;

    const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[\\/:*?"<>|]/g, '_')}_${item.id}.json`;
    a.click();
});

loadFromFileButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const loaded = JSON.parse(evt.target.result);
            const processItem = (item) => {
                if (!item || !item.id) return false;
                const existing = history.find(h => h.id === item.id);
                if (existing) {
                    if (JSON.stringify(existing) === JSON.stringify(item)) {
                        return false; 
                    }
                    item.id = item.id + '_' + Date.now(); 
                }
                history.push(item);
                return true;
            };

            let addedCount = 0;
            if (Array.isArray(loaded)) {
                loaded.forEach(item => {
                    if (processItem(item)) addedCount++;
                });
            } else if (typeof loaded === 'object') {
                if (processItem(loaded)) addedCount = 1;
            }

            if (addedCount > 0) {
                saveHistory();
                renderHistory();
                if (addedCount === 1 && !Array.isArray(loaded)) {
                    loadAbstract(loaded.id);
                }
                alert(`成功加载 ${addedCount} 个任务。`);
            } else {
                alert('文件中未找到新的唯一任务。');
            }
        } catch (err) {
            alert('加载文件出错: ' + err.message);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});
