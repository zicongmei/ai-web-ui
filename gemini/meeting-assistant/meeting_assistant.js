// meeting_assistant.js - Gemini Meeting Assistant
// Task 1: Live Voice Transcription via WebSocket (gemini-3.5-transcribe-live & Live API models)
// Task 2: Meeting Co-Pilot Q&A / Summarization / Problem Solving via REST API (Gemini Flash / Pro models)

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration & Header Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const transcriptionModelSelect = document.getElementById('transcriptionModel');
    const assistantModelSelect = document.getElementById('assistantModel');
    const statusMessageEl = document.getElementById('statusMessage');
    const errorMessageEl = document.getElementById('errorMessage');

    // --- Audio Source Elements ---
    const connectBothBtn = document.getElementById('connectBothBtn');
    const videoSourceBox = document.getElementById('videoSourceBox');
    const videoStatusBadge = document.getElementById('videoStatusBadge');
    const videoMeterFill = document.getElementById('videoMeterFill');
    const shareScreenAudioBtn = document.getElementById('shareScreenAudioBtn');
    const loadVideoFileBtn = document.getElementById('loadVideoFileBtn');
    const videoFileInput = document.getElementById('videoFileInput');
    const muteVideoBtn = document.getElementById('muteVideoBtn');
    const stopVideoSourceBtn = document.getElementById('stopVideoSourceBtn');

    const micSourceBox = document.getElementById('micSourceBox');
    const micStatusBadge = document.getElementById('micStatusBadge');
    const micDeviceSelect = document.getElementById('micDeviceSelect');
    const micMeterFill = document.getElementById('micMeterFill');
    const connectMicBtn = document.getElementById('connectMicBtn');
    const muteMicBtn = document.getElementById('muteMicBtn');
    const stopMicSourceBtn = document.getElementById('stopMicSourceBtn');

    const videoPreviewContainer = document.getElementById('videoPreviewContainer');
    const meetingVideoPlayer = document.getElementById('meetingVideoPlayer');
    const videoSourceLabel = document.getElementById('videoSourceLabel');
    const transcribeUploadedFileBtn = document.getElementById('transcribeUploadedFileBtn');

    // --- WebSocket Live Transcription Controls ---
    const startRecordingBtn = document.getElementById('startRecordingBtn');
    const flushSegmentBtn = document.getElementById('flushSegmentBtn');
    const stopRecordingBtn = document.getElementById('stopRecordingBtn');
    const recDot = document.getElementById('recDot');
    const recordingTimerEl = document.getElementById('recordingTimer');
    const chunkCountdownEl = document.getElementById('chunkCountdown');
    const transcriptionModeSelect = document.getElementById('transcriptionModeSelect');
    const languageCodeSelect = document.getElementById('languageCodeSelect');
    const includeTimestampsToggle = document.getElementById('includeTimestampsToggle');
    const transcriptionHintInput = document.getElementById('transcriptionHint');

    // --- Transcript Elements ---
    const transcriptBox = document.getElementById('transcriptBox');
    const transcriptStatsEl = document.getElementById('transcriptStats');
    const pendingChunksBadge = document.getElementById('pendingChunksBadge');
    const interimCaptionBar = document.getElementById('interimCaptionBar');
    const interimTranscriptText = document.getElementById('interimTranscriptText');
    const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
    const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
    const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');

    // --- Prompt & Assistant Elements ---
    const presetChips = document.querySelectorAll('.preset-chip');
    const promptInput = document.getElementById('promptInput');
    const includeTranscriptToggle = document.getElementById('includeTranscriptToggle');
    const includeHistoryContextToggle = document.getElementById('includeHistoryContextToggle');
    const sendPromptBtn = document.getElementById('sendPromptBtn');
    const cancelPromptBtn = document.getElementById('cancelPromptBtn');
    const clearPromptBtn = document.getElementById('clearPromptBtn');
    const assistantOutput = document.getElementById('assistantOutput');
    const copyResponseBtn = document.getElementById('copyResponseBtn');
    const appendResponseToTranscriptBtn = document.getElementById('appendResponseToTranscriptBtn');
    const historyCountEl = document.getElementById('historyCount');
    const historyListEl = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // --- Token & Cost Statistics Elements ---
    const lastCallTypeEl = document.getElementById('lastCallType');
    const lastInputTokensEl = document.getElementById('lastInputTokens');
    const lastOutputTokensEl = document.getElementById('lastOutputTokens');
    const lastCallCostEl = document.getElementById('lastCallCost');

    const transSessionCallsEl = document.getElementById('transSessionCalls');
    const transSessionInputTokensEl = document.getElementById('transSessionInputTokens');
    const transSessionOutputTokensEl = document.getElementById('transSessionOutputTokens');
    const transSessionCostEl = document.getElementById('transSessionCost');

    const assistSessionCallsEl = document.getElementById('assistSessionCalls');
    const assistSessionInputTokensEl = document.getElementById('assistSessionInputTokens');
    const assistSessionOutputTokensEl = document.getElementById('assistSessionOutputTokens');
    const assistSessionCostEl = document.getElementById('assistSessionCost');
    const grandTotalCostEl = document.getElementById('grandTotalCost');

    // --- Debug Log Elements ---
    const logCountEl = document.getElementById('logCount');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const apiLogContainer = document.getElementById('apiLogContainer');

    // =========================================================================
    // Application State
    // =========================================================================
    let audioCtx = null;
    let mixerGainNode = null;
    let pcmProcessorNode = null;
    let silentSinkNode = null;

    // Video / Meeting audio state
    let videoDisplayStream = null;
    let videoStreamSourceNode = null;
    let mediaElementSourceNode = null;
    let videoGainNode = null;
    let videoAnalyser = null;
    let videoSourceType = null; // 'screen' | 'file' | null
    let isVideoMuted = false;
    let uploadedMediaFile = null;
    let uploadedFileObjectUrl = null;

    // Microphone audio state
    let micStream = null;
    let micStreamSourceNode = null;
    let micGainNode = null;
    let micAnalyser = null;
    let isMicMuted = false;

    // Level meter & active voice source tracking
    let meterAnimationId = null;
    const SILENCE_RMS_THRESHOLD = 0.006;
    let currentUtteranceActivity = {
        videoPeakRms: 0,
        micPeakRms: 0,
        videoActiveFrames: 0,
        micActiveFrames: 0
    };

    // WebSocket Live Transcription state
    const TARGET_PCM_SAMPLE_RATE = 16000;
    const SESSION_MAX_SECONDS = 570; // Auto-rollover at 9m30s (before 10m Live API limit)
    const HYBRID_VAD_SILENCE_MS = 1400; // Auto-send audioStreamEnd after 1.4s of silence
    const MAX_CONTINUOUS_UTTERANCE_MS = 20000; // Auto-finalize long continuous speech every 20s
    let isRecording = false;
    let liveWebSocket = null;
    let wsSetupComplete = false;
    let isReconnectingWs = false;
    let recordingStartTimeMs = 0;
    let wsSessionStartTimeMs = 0;
    let recordingTimerInterval = null;
    let pcmSampleAccumulator = [];
    let unbilledPcmSamplesSent = 0;
    let serverProvidedUsageOnCurrentTurn = false;
    let transcribedSegmentsCount = 0;
    let utteranceSequenceCounter = 0;

    // Live Stream (Interim) + Committed Transcript synchronization state
    let committedTranscript = '';
    let currentInterimText = '';
    let currentInterimSource = '';
    let currentInterimTimestamp = '';
    let currentInterimStartMs = 0;
    let lastVoiceDetectedMs = 0;
    let autoStreamEndSentForTurn = false;

    // Assistant Prompt state
    let promptAbortController = null;
    let assistantHistory = [];
    let apiLogs = [];

    // Token & Cost accumulators
    const stats = {
        transcription: {
            calls: 0,
            promptTokens: 0,
            uncachedTokens: 0,
            cachedTokens: 0,
            outputTokens: 0,
            cost: 0
        },
        assistant: {
            calls: 0,
            promptTokens: 0,
            uncachedTokens: 0,
            cachedTokens: 0,
            outputTokens: 0,
            cost: 0
        }
    };

    // Preset Prompts Map
    const PRESET_PROMPTS = {
        summarize:
            'Summarize the meeting so far. Organize the summary into:\n' +
            '1. Executive Summary (2-3 sentences)\n' +
            '2. Key Topics Discussed\n' +
            '3. Important Context & Updates shared by participants.',
        solve:
            'Analyze the problem(s) or technical challenges described in the meeting transcript.\n' +
            '1. Clearly state the core problem(s) being discussed.\n' +
            '2. Identify probable root causes or constraints mentioned.\n' +
            '3. Propose concrete, actionable solutions with pros, cons, and recommended next steps.',
        actions:
            'Extract all action items, tasks, and follow-ups mentioned in the meeting so far.\n' +
            'Format each item with: [Owner / Speaker (if known)] - Task Description - Priority/Timeline (if mentioned).',
        decisions:
            'List:\n' +
            '1. All key decisions agreed upon during the meeting.\n' +
            '2. All open questions, unresolved disagreements, or risks that still need an answer.',
        reply:
            'Based on the latest discussion in the meeting transcript, suggest 2-3 concise, high-impact points or responses I could say next to contribute constructively and move the conversation forward.',
        question:
            'Identify the most recent question or request raised in the meeting transcript and provide a clear, accurate, and direct answer to it.'
    };

    // =========================================================================
    // Initialization & Persistence
    // =========================================================================
    function init() {
        const savedKey = localStorage.getItem('geminiApiKey');
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }

        const savedTransModel = localStorage.getItem('meetingAssistant_liveTranscriptionModel');
        if (savedTransModel && queryOptionExists(transcriptionModelSelect, savedTransModel)) {
            transcriptionModelSelect.value = savedTransModel;
        }

        const savedAssistModel = localStorage.getItem('meetingAssistant_assistantModel');
        if (savedAssistModel && queryOptionExists(assistantModelSelect, savedAssistModel)) {
            assistantModelSelect.value = savedAssistModel;
        }

        const savedTranscript = localStorage.getItem('meetingAssistant_transcriptDraft');
        if (savedTranscript) {
            committedTranscript = savedTranscript;
            transcriptBox.value = savedTranscript;
        }

        updateTranscriptStats();
        refreshMicDeviceList();

        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', refreshMicDeviceList);
        }
    }

    function queryOptionExists(selectEl, value) {
        return Array.from(selectEl.options).some(opt => opt.value === value);
    }

    function setStatus(msg) {
        statusMessageEl.textContent = msg;
    }

    function showError(msg) {
        errorMessageEl.textContent = msg || '';
    }

    function clearError() {
        errorMessageEl.textContent = '';
    }

    function getValidatedApiKey() {
        const key = apiKeyInput.value.trim() || localStorage.getItem('geminiApiKey') || '';
        if (!key) {
            showError('Please enter and save your Gemini API Key at the top of the page first.');
            apiKeyInput.focus();
            return null;
        }
        return key;
    }

    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            showError('Please enter a valid Gemini API key.');
            return;
        }
        localStorage.setItem('geminiApiKey', key);
        clearError();
        setStatus('Gemini API Key saved to local storage.');
    });

    transcriptionModelSelect.addEventListener('change', () => {
        localStorage.setItem('meetingAssistant_liveTranscriptionModel', transcriptionModelSelect.value);
        if (isRecording) {
            setStatus(`Switched Live Transcription model to ${transcriptionModelSelect.value}. Reconnecting WebSocket...`);
            reconnectLiveWebSocket();
        }
    });

    assistantModelSelect.addEventListener('change', () => {
        localStorage.setItem('meetingAssistant_assistantModel', assistantModelSelect.value);
    });

    // If mode or language changes while live, reconnect WebSocket with new setup config
    transcriptionModeSelect.addEventListener('change', () => {
        if (isRecording) {
            reconnectLiveWebSocket();
        }
    });

    languageCodeSelect.addEventListener('change', () => {
        if (isRecording) {
            reconnectLiveWebSocket();
        }
    });

    includeTimestampsToggle.addEventListener('change', () => {
        syncTranscriptBoxWithLiveStream();
    });

    // =========================================================================
    // Web Audio API Graph Setup (Mixing Video Voice + Mic Voice -> 16kHz PCM)
    // =========================================================================
    async function ensureAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
            mixerGainNode = audioCtx.createGain();
            mixerGainNode.gain.value = 1.0;

            // Setup PCM capture processor connected to mixerGainNode
            setupPcmCaptureNode();
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        startLevelMetersLoop();
        return audioCtx;
    }

    function setupPcmCaptureNode() {
        if (!audioCtx || pcmProcessorNode) return;

        // ScriptProcessorNode (4096 frames, 1 input channel, 1 output channel) works universally
        // across all browsers without requiring external worklet files or COOP/COEP headers.
        const bufferSize = 2048;
        pcmProcessorNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        silentSinkNode = audioCtx.createGain();
        silentSinkNode.gain.value = 0.0; // Muted sink so mixed mic audio never plays through speakers

        pcmProcessorNode.onaudioprocess = (audioProcessingEvent) => {
            if (!isRecording || !wsSetupComplete || !liveWebSocket || liveWebSocket.readyState !== WebSocket.OPEN) {
                return;
            }
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            handleRawFloat32AudioFrame(inputData, audioCtx.sampleRate);
        };

        mixerGainNode.connect(pcmProcessorNode);
        pcmProcessorNode.connect(silentSinkNode);
        silentSinkNode.connect(audioCtx.destination);
    }

    /**
     * Downsamples Float32 audio from sourceSampleRate to 16000Hz, converts to 16-bit signed PCM,
     * and streams 100ms chunks (1,600 samples = 3,200 bytes) over the Live API WebSocket.
     */
    function handleRawFloat32AudioFrame(float32Buffer, sourceSampleRate) {
        const downsampled = downsampleFloat32ToInt16(float32Buffer, sourceSampleRate, TARGET_PCM_SAMPLE_RATE);
        for (let i = 0; i < downsampled.length; i++) {
            pcmSampleAccumulator.push(downsampled[i]);
        }

        // Send in ~100ms chunks (1,600 samples at 16kHz)
        const CHUNK_SAMPLES = 1600;
        while (pcmSampleAccumulator.length >= CHUNK_SAMPLES) {
            const chunkSamples = pcmSampleAccumulator.splice(0, CHUNK_SAMPLES);
            const int16Array = new Int16Array(chunkSamples);
            const uint8Array = new Uint8Array(int16Array.buffer);
            const pcmBase64 = uint8ArrayToBase64(uint8Array);

            if (liveWebSocket && liveWebSocket.readyState === WebSocket.OPEN && wsSetupComplete) {
                liveWebSocket.send(
                    JSON.stringify({
                        realtimeInput: {
                            audio: {
                                data: pcmBase64,
                                mimeType: `audio/pcm;rate=${TARGET_PCM_SAMPLE_RATE}`
                            }
                        }
                    })
                );
                unbilledPcmSamplesSent += CHUNK_SAMPLES;
            }
        }
    }

    function downsampleFloat32ToInt16(float32Buffer, inputSampleRate, targetSampleRate) {
        if (targetSampleRate === inputSampleRate) {
            const result = new Int16Array(float32Buffer.length);
            for (let i = 0; i < float32Buffer.length; i++) {
                const s = Math.max(-1, Math.min(1, float32Buffer[i]));
                result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            return result;
        }

        const ratio = inputSampleRate / targetSampleRate;
        const newLength = Math.round(float32Buffer.length / ratio);
        const result = new Int16Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Buffer.length; i++) {
                accum += float32Buffer[i];
                count++;
            }
            const avg = count > 0 ? accum / count : 0;
            const clamped = Math.max(-1, Math.min(1, avg));
            result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    function resetUtteranceActivity() {
        currentUtteranceActivity = {
            videoPeakRms: 0,
            micPeakRms: 0,
            videoActiveFrames: 0,
            micActiveFrames: 0
        };
    }

    function computeAnalyserRms(analyser) {
        if (!analyser) return 0;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        return Math.sqrt(sumSquares / bufferLength);
    }

    function startLevelMetersLoop() {
        if (meterAnimationId) return;

        const updateMeters = () => {
            const videoActive = Boolean(videoSourceType && videoAnalyser && !isVideoMuted);
            const micActive = Boolean(micStream && micAnalyser && !isMicMuted);

            const videoRms = videoActive ? computeAnalyserRms(videoAnalyser) : 0;
            const micRms = micActive ? computeAnalyserRms(micAnalyser) : 0;

            const videoPercent = Math.min(100, Math.round(Math.pow(videoRms * 4.5, 0.75) * 100));
            const micPercent = Math.min(100, Math.round(Math.pow(micRms * 4.5, 0.75) * 100));

            videoMeterFill.style.width = `${videoPercent}%`;
            micMeterFill.style.width = `${micPercent}%`;

            if (isRecording) {
                if (videoRms > currentUtteranceActivity.videoPeakRms) {
                    currentUtteranceActivity.videoPeakRms = videoRms;
                }
                if (micRms > currentUtteranceActivity.micPeakRms) {
                    currentUtteranceActivity.micPeakRms = micRms;
                }
                if (videoRms >= SILENCE_RMS_THRESHOLD) {
                    currentUtteranceActivity.videoActiveFrames++;
                    lastVoiceDetectedMs = Date.now();
                }
                if (micRms >= SILENCE_RMS_THRESHOLD) {
                    currentUtteranceActivity.micActiveFrames++;
                    lastVoiceDetectedMs = Date.now();
                }
            }

            meterAnimationId = requestAnimationFrame(updateMeters);
        };

        meterAnimationId = requestAnimationFrame(updateMeters);
    }

    function determineActiveSourceLabel() {
        const hasVideoConnected = Boolean(videoSourceType && !isVideoMuted);
        const hasMicConnected = Boolean(micStream && !isMicMuted);

        const videoSpoke =
            hasVideoConnected &&
            (currentUtteranceActivity.videoActiveFrames >= 3 ||
                currentUtteranceActivity.videoPeakRms >= SILENCE_RMS_THRESHOLD);
        const micSpoke =
            hasMicConnected &&
            (currentUtteranceActivity.micActiveFrames >= 3 ||
                currentUtteranceActivity.micPeakRms >= SILENCE_RMS_THRESHOLD);

        if (videoSpoke && micSpoke) return 'Video + Mic Voice';
        if (videoSpoke) return 'Video Voice';
        if (micSpoke) return 'Mic Voice';

        if (hasVideoConnected && hasMicConnected) return 'Video + Mic Voice';
        if (hasVideoConnected) return 'Video Voice';
        if (hasMicConnected) return 'Mic Voice';
        return 'Audio';
    }

    // =========================================================================
    // Source 1: Video / Meeting Voice (Screen/Tab Share OR Video/Audio File)
    // =========================================================================
    async function connectScreenOrTabAudio() {
        clearError();
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error('Screen/Tab audio capture (getDisplayMedia) is not supported in this browser.');
            }

            await ensureAudioContext();
            disconnectVideoSource(false);

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                stream.getTracks().forEach(t => t.stop());
                showError(
                    'No audio track was shared! When selecting a browser tab or window, please check "Share tab audio" or "Share system audio" in the popup dialog.'
                );
                return false;
            }

            videoDisplayStream = stream;
            videoSourceType = 'screen';
            isVideoMuted = false;

            meetingVideoPlayer.pause();
            meetingVideoPlayer.removeAttribute('src');
            meetingVideoPlayer.srcObject = stream;
            meetingVideoPlayer.muted = true;
            meetingVideoPlayer.play().catch(() => {});
            videoPreviewContainer.classList.remove('hidden');
            transcribeUploadedFileBtn.classList.add('hidden');

            const trackLabel = audioTracks[0].label || 'Shared Tab / System Audio';
            videoSourceLabel.textContent = `Live Capture: ${trackLabel}`;

            const audioOnlyStream = new MediaStream(audioTracks);
            videoStreamSourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
            videoGainNode = audioCtx.createGain();
            videoGainNode.gain.value = 1.0;
            videoAnalyser = audioCtx.createAnalyser();
            videoAnalyser.fftSize = 512;

            videoStreamSourceNode.connect(videoGainNode);
            videoGainNode.connect(videoAnalyser);
            videoAnalyser.connect(mixerGainNode);

            audioTracks[0].addEventListener('ended', () => {
                disconnectVideoSource(true);
                setStatus('Tab/Window audio sharing ended.');
            });
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length > 0) {
                videoTracks[0].addEventListener('ended', () => {
                    disconnectVideoSource(true);
                    setStatus('Tab/Window sharing ended.');
                });
            }

            updateVideoSourceUI();
            setStatus(`Connected Video/Meeting Voice (${trackLabel}).`);
            return true;
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                setStatus('Tab/Window sharing was cancelled.');
            } else {
                showError(`Failed to capture Tab/Window audio: ${err.message}`);
            }
            return false;
        }
    }

    async function loadLocalVideoOrAudioFile(file) {
        if (!file) return;
        clearError();
        try {
            await ensureAudioContext();
            disconnectVideoSource(false);

            uploadedMediaFile = file;
            uploadedFileObjectUrl = URL.createObjectURL(file);

            meetingVideoPlayer.srcObject = null;
            meetingVideoPlayer.src = uploadedFileObjectUrl;
            meetingVideoPlayer.muted = false;
            videoPreviewContainer.classList.remove('hidden');
            transcribeUploadedFileBtn.classList.remove('hidden');
            videoSourceLabel.textContent = `Loaded File: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;

            if (!mediaElementSourceNode) {
                mediaElementSourceNode = audioCtx.createMediaElementSource(meetingVideoPlayer);
            }

            videoGainNode = audioCtx.createGain();
            videoGainNode.gain.value = 1.0;
            videoAnalyser = audioCtx.createAnalyser();
            videoAnalyser.fftSize = 512;

            mediaElementSourceNode.disconnect();
            mediaElementSourceNode.connect(videoGainNode);
            videoGainNode.connect(videoAnalyser);
            // Route to both WebSocket PCM mixer and local speakers so the user hears the file playing
            videoAnalyser.connect(mixerGainNode);
            videoGainNode.connect(audioCtx.destination);

            videoSourceType = 'file';
            isVideoMuted = false;

            updateVideoSourceUI();
            setStatus(
                `Loaded "${file.name}". Click "Start Live Transcription (WebSocket)" and play the video to stream its audio alongside your microphone, or click "Transcribe Entire File Now".`
            );
        } catch (err) {
            showError(`Failed to load media file: ${err.message}`);
        }
    }

    function disconnectVideoSource(updateStatus = true) {
        if (videoStreamSourceNode) {
            try { videoStreamSourceNode.disconnect(); } catch (_) {}
            videoStreamSourceNode = null;
        }
        if (mediaElementSourceNode) {
            try { mediaElementSourceNode.disconnect(); } catch (_) {}
        }
        if (videoGainNode) {
            try { videoGainNode.disconnect(); } catch (_) {}
            videoGainNode = null;
        }
        if (videoAnalyser) {
            try { videoAnalyser.disconnect(); } catch (_) {}
            videoAnalyser = null;
        }
        if (videoDisplayStream) {
            videoDisplayStream.getTracks().forEach(t => t.stop());
            videoDisplayStream = null;
        }
        if (uploadedFileObjectUrl) {
            URL.revokeObjectURL(uploadedFileObjectUrl);
            uploadedFileObjectUrl = null;
        }
        uploadedMediaFile = null;
        meetingVideoPlayer.pause();
        meetingVideoPlayer.srcObject = null;
        meetingVideoPlayer.removeAttribute('src');
        videoPreviewContainer.classList.add('hidden');
        transcribeUploadedFileBtn.classList.add('hidden');

        videoSourceType = null;
        isVideoMuted = false;
        videoMeterFill.style.width = '0%';
        updateVideoSourceUI();

        if (updateStatus) {
            setStatus('Video/Meeting audio source disconnected.');
        }
    }

    function toggleVideoMute() {
        if (!videoSourceType || !videoGainNode) return;
        isVideoMuted = !isVideoMuted;
        videoGainNode.gain.value = isVideoMuted ? 0.0 : 1.0;
        updateVideoSourceUI();
    }

    function updateVideoSourceUI() {
        if (!videoSourceType) {
            videoSourceBox.classList.remove('active-source');
            videoStatusBadge.textContent = 'Disconnected';
            videoStatusBadge.className = 'source-badge';
            muteVideoBtn.disabled = true;
            muteVideoBtn.textContent = 'Mute Video';
            stopVideoSourceBtn.disabled = true;
        } else {
            videoSourceBox.classList.add('active-source');
            muteVideoBtn.disabled = false;
            stopVideoSourceBtn.disabled = false;
            if (isVideoMuted) {
                videoStatusBadge.textContent = 'Muted';
                videoStatusBadge.className = 'source-badge muted';
                muteVideoBtn.textContent = 'Unmute Video';
            } else {
                videoStatusBadge.textContent = videoSourceType === 'screen' ? 'Live (Tab/Window)' : 'Live (Media File)';
                videoStatusBadge.className = 'source-badge live';
                muteVideoBtn.textContent = 'Mute Video';
            }
        }
    }

    // =========================================================================
    // Source 2: Microphone Voice
    // =========================================================================
    async function refreshMicDeviceList() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            const currentVal = micDeviceSelect.value;
            micDeviceSelect.innerHTML = '<option value="">Default Microphone</option>';
            audioInputs.forEach((device, idx) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${idx + 1}`;
                micDeviceSelect.appendChild(option);
            });
            if (currentVal && queryOptionExists(micDeviceSelect, currentVal)) {
                micDeviceSelect.value = currentVal;
            }
        } catch (_) {}
    }

    async function connectMicrophone() {
        clearError();
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Microphone capture (getUserMedia) is not supported in this browser.');
            }

            await ensureAudioContext();
            disconnectMicSource(false);

            const selectedDeviceId = micDeviceSelect.value;
            const audioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };
            if (selectedDeviceId) {
                audioConstraints.deviceId = { exact: selectedDeviceId };
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
            micStream = stream;
            isMicMuted = false;

            micStreamSourceNode = audioCtx.createMediaStreamSource(stream);
            micGainNode = audioCtx.createGain();
            micGainNode.gain.value = 1.0;
            micAnalyser = audioCtx.createAnalyser();
            micAnalyser.fftSize = 512;

            micStreamSourceNode.connect(micGainNode);
            micGainNode.connect(micAnalyser);
            // Connect to mixerGainNode (never audioCtx.destination) so mic audio goes only to WebSocket PCM stream
            micAnalyser.connect(mixerGainNode);

            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.addEventListener('ended', () => {
                    disconnectMicSource(true);
                });
            }

            await refreshMicDeviceList();
            updateMicSourceUI();
            setStatus(`Connected Microphone (${audioTrack?.label || 'Default'}).`);
            return true;
        } catch (err) {
            showError(`Failed to access microphone: ${err.message}`);
            return false;
        }
    }

    function disconnectMicSource(updateStatus = true) {
        if (micStreamSourceNode) {
            try { micStreamSourceNode.disconnect(); } catch (_) {}
            micStreamSourceNode = null;
        }
        if (micGainNode) {
            try { micGainNode.disconnect(); } catch (_) {}
            micGainNode = null;
        }
        if (micAnalyser) {
            try { micAnalyser.disconnect(); } catch (_) {}
            micAnalyser = null;
        }
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            micStream = null;
        }
        isMicMuted = false;
        micMeterFill.style.width = '0%';
        updateMicSourceUI();

        if (updateStatus) {
            setStatus('Microphone disconnected.');
        }
    }

    function toggleMicMute() {
        if (!micStream || !micGainNode) return;
        isMicMuted = !isMicMuted;
        micGainNode.gain.value = isMicMuted ? 0.0 : 1.0;
        updateMicSourceUI();
    }

    function updateMicSourceUI() {
        if (!micStream) {
            micSourceBox.classList.remove('active-source');
            micStatusBadge.textContent = 'Disconnected';
            micStatusBadge.className = 'source-badge';
            muteMicBtn.disabled = true;
            muteMicBtn.textContent = 'Mute Mic';
            stopMicSourceBtn.disabled = true;
        } else {
            micSourceBox.classList.add('active-source');
            muteMicBtn.disabled = false;
            stopMicSourceBtn.disabled = false;
            if (isMicMuted) {
                micStatusBadge.textContent = 'Muted';
                micStatusBadge.className = 'source-badge muted';
                muteMicBtn.textContent = 'Unmute Mic';
            } else {
                micStatusBadge.textContent = 'Live (Mic)';
                micStatusBadge.className = 'source-badge live';
                muteMicBtn.textContent = 'Mute Mic';
            }
        }
    }

    // Audio Source Button Event Listeners
    shareScreenAudioBtn.addEventListener('click', () => connectScreenOrTabAudio());
    loadVideoFileBtn.addEventListener('click', () => videoFileInput.click());
    videoFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
            loadLocalVideoOrAudioFile(file);
        }
        videoFileInput.value = '';
    });
    muteVideoBtn.addEventListener('click', toggleVideoMute);
    stopVideoSourceBtn.addEventListener('click', () => disconnectVideoSource(true));

    connectMicBtn.addEventListener('click', () => connectMicrophone());
    micDeviceSelect.addEventListener('change', () => {
        if (micStream) {
            connectMicrophone();
        }
    });
    muteMicBtn.addEventListener('click', toggleMicMute);
    stopMicSourceBtn.addEventListener('click', () => disconnectMicSource(true));

    connectBothBtn.addEventListener('click', async () => {
        clearError();
        setStatus('Connecting Microphone and Tab/Window Audio...');
        const micOk = micStream ? true : await connectMicrophone();
        const screenOk = videoSourceType ? true : await connectScreenOrTabAudio();
        if (micOk && screenOk) {
            setStatus('Both Video/Tab Audio and Microphone are connected! Click "Start Live Transcription (WebSocket)" to begin.');
        }
    });

    // =========================================================================
    // Task 1: WebSocket Live Transcription (gemini-3.5-transcribe-live)
    // =========================================================================
    async function startLiveTranscription() {
        clearError();
        const apiKey = getValidatedApiKey();
        if (!apiKey) return;

        await ensureAudioContext();

        // If neither source is connected yet, auto-connect microphone as a helpful default
        if (!videoSourceType && !micStream) {
            setStatus('No audio source connected yet. Requesting microphone access...');
            const micConnected = await connectMicrophone();
            if (!micConnected && !videoSourceType) {
                showError('Please connect at least one audio source (Video/Tab Audio or Microphone) before starting live transcription.');
                return;
            }
        }

        // If a local video file is loaded and paused, start playing it so its audio streams into the mixer
        if (videoSourceType === 'file' && meetingVideoPlayer.paused) {
            meetingVideoPlayer.play().catch(() => {});
        }

        isRecording = true;
        recordingStartTimeMs = Date.now();
        pcmSampleAccumulator = [];
        unbilledPcmSamplesSent = 0;
        resetUtteranceActivity();

        startRecordingBtn.disabled = true;
        flushSegmentBtn.disabled = false;
        stopRecordingBtn.disabled = false;
        recDot.classList.add('recording');

        if (recordingTimerInterval) clearInterval(recordingTimerInterval);
        recordingTimerInterval = setInterval(onRecordingTick, 500);
        onRecordingTick();

        openLiveWebSocket(apiKey);
    }

    function buildSetupMessage(model) {
        const mode = transcriptionModeSelect.value || 'SMART';
        const lang = languageCodeSelect.value.trim();
        const customVocabRaw = transcriptionHintInput.value.trim();
        const customVocabulary = customVocabRaw
            ? customVocabRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const inputAudioTranscription = {
            languageCodes: lang ? [lang] : []
        };

        // gemini-3.5-transcribe-live supports mode ('SMART' | 'VERBATIM') and customVocabulary
        if (model.includes('transcribe')) {
            inputAudioTranscription.mode = mode;
            if (customVocabulary.length > 0) {
                inputAudioTranscription.customVocabulary = customVocabulary;
            }
        }

        return {
            setup: {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['TEXT']
                },
                inputAudioTranscription
            }
        };
    }

    function openLiveWebSocket(apiKey) {
        const model = transcriptionModelSelect.value;
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

        wsSetupComplete = false;
        wsSessionStartTimeMs = Date.now();
        updateWebSocketBadge('Connecting WebSocket...', 'muted');
        interimTranscriptText.textContent = `Connecting to ${model} over WebSocket...`;

        const ws = new WebSocket(wsUrl);
        liveWebSocket = ws;

        ws.onopen = () => {
            if (liveWebSocket !== ws) return;
            const setupMessage = buildSetupMessage(model);
            ws.send(JSON.stringify(setupMessage));
            recordApiLog(`WebSocket Setup (${model})`, model, setupMessage, { status: 'Sent setup frame' });
            updateWebSocketBadge('WebSocket Handshake...', 'live');
        };

        ws.onmessage = async (event) => {
            if (liveWebSocket !== ws) return;
            try {
                const rawText = (event.data instanceof Blob) ? await event.data.text() : event.data;
                if (!rawText) return;
                const response = JSON.parse(rawText);
                handleWebSocketServerMessage(model, response);
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };

        ws.onerror = () => {
            if (liveWebSocket !== ws) return;
            showError(`WebSocket error occurred while connected to ${model}. Check your API key and model access.`);
        };

        ws.onclose = (event) => {
            if (liveWebSocket !== ws) return;
            wsSetupComplete = false;
            commitPendingInterimToTranscript();

            if (isRecording && !isReconnectingWs) {
                // If closed unexpectedly or due to session timeout while still recording, auto-reconnect
                const reason = event.reason || `code ${event.code}`;
                if (event.code === 1000) {
                    reconnectLiveWebSocket();
                } else {
                    showError(`WebSocket closed (${reason}). Attempting to reconnect...`);
                    setTimeout(() => {
                        if (isRecording) reconnectLiveWebSocket();
                    }, 1200);
                }
            } else if (!isRecording) {
                updateWebSocketBadge('WebSocket Idle', '');
            }
        };
    }

    function handleWebSocketServerMessage(model, response) {
        // 1. Setup confirmation
        if (response.setupComplete !== undefined || response.setup_complete !== undefined) {
            wsSetupComplete = true;
            updateWebSocketBadge(`Streaming Live (${model})`, 'live');
            const activeSources = [];
            if (videoSourceType && !isVideoMuted) activeSources.push('Video Voice');
            if (micStream && !isMicMuted) activeSources.push('Mic Voice');
            interimTranscriptText.textContent = `Listening to ${activeSources.join(' + ') || 'Audio'}... Speak or play meeting video.`;
            setStatus(`WebSocket connected to ${model}. Streaming 16kHz PCM audio in real time.`);
            return;
        }

        // 2. Server usageMetadata (if emitted on turn completion)
        const usageMeta = response.usageMetadata || response.usage_metadata;
        if (usageMeta) {
            serverProvidedUsageOnCurrentTurn = true;
            unbilledPcmSamplesSent = 0;
            recordUsageStats('transcription', model, usageMeta);
        }

        // 3. Server content: interim & finalized transcriptions
        const content = response.serverContent || response.server_content;
        if (!content) return;

        // 3a. Interim real-time partial transcription -> update BOTH Live Stream bar AND Meeting Transcript box
        const interimObj = content.interimInputTranscription || content.interim_input_transcription;
        if (interimObj && interimObj.text) {
            const newInterimText = interimObj.text.trim();
            if (newInterimText) {
                // If the server started a new utterance without emitting inputTranscription for the previous one,
                // commit the previous interim text first so no live stream words are lost.
                if (
                    currentInterimText.length > 20 &&
                    newInterimText.length < currentInterimText.length * 0.45 &&
                    !currentInterimText.toLowerCase().startsWith(newInterimText.slice(0, 8).toLowerCase())
                ) {
                    commitPendingInterimToTranscript();
                }

                const now = Date.now();
                if (!currentInterimText) {
                    currentInterimTimestamp = formatClockTime(new Date());
                    currentInterimStartMs = now;
                    autoStreamEndSentForTurn = false;
                }
                if (newInterimText.length !== currentInterimText.length) {
                    lastVoiceDetectedMs = now;
                }
                currentInterimText = newInterimText;
                currentInterimSource = determineActiveSourceLabel();
                interimTranscriptText.textContent = `[${currentInterimSource}] ${currentInterimText}`;
                syncTranscriptBoxWithLiveStream();
            }
        }

        // 3b. Finalized utterance transcription
        const finalObj = content.inputTranscription || content.input_transcription;
        if (finalObj && finalObj.text) {
            const finalText = finalObj.text.trim();
            if (finalText) {
                const timestampLabel = currentInterimTimestamp || formatClockTime(new Date());
                const sourceLabel = currentInterimSource || determineActiveSourceLabel();
                const utteranceNum = ++utteranceSequenceCounter;

                // Clear active interim state and commit the finalized utterance into committedTranscript
                currentInterimText = '';
                currentInterimTimestamp = '';
                currentInterimSource = '';
                currentInterimStartMs = 0;
                autoStreamEndSentForTurn = false;

                transcribedSegmentsCount++;
                appendTranscriptionSegment(finalText, timestampLabel, sourceLabel);
                interimTranscriptText.textContent = 'Listening for next utterance...';

                // If server didn't emit usageMetadata on this turn, estimate from streamed PCM audio (25 tokens/sec per Gemini docs)
                if (!usageMeta && !serverProvidedUsageOnCurrentTurn && unbilledPcmSamplesSent > 0) {
                    const streamedSeconds = unbilledPcmSamplesSent / TARGET_PCM_SAMPLE_RATE;
                    const estimatedAudioTokens = Math.max(1, Math.round(streamedSeconds * 25));
                    const estimatedTextTokens = Math.max(1, Math.ceil(finalText.split(/\s+/).length * 1.3));
                    unbilledPcmSamplesSent = 0;
                    recordUsageStats('transcription', model, {
                        promptTokenCount: estimatedAudioTokens,
                        candidatesTokenCount: estimatedTextTokens,
                        cachedContentTokenCount: 0
                    });
                }
                serverProvidedUsageOnCurrentTurn = false;
                resetUtteranceActivity();

                recordApiLog(
                    `WebSocket Final Transcript #${utteranceNum} (${sourceLabel})`,
                    model,
                    { streamFormat: `audio/pcm;rate=${TARGET_PCM_SAMPLE_RATE}` },
                    response
                );
                setStatus(`Transcribed utterance #${utteranceNum} from ${sourceLabel} (${timestampLabel}).`);
            }
        }
    }

    function reconnectLiveWebSocket() {
        if (!isRecording) return;
        const apiKey = getValidatedApiKey();
        if (!apiKey) return;

        commitPendingInterimToTranscript();
        isReconnectingWs = true;
        if (liveWebSocket) {
            const oldWs = liveWebSocket;
            liveWebSocket = null;
            wsSetupComplete = false;
            try {
                if (oldWs.readyState === WebSocket.OPEN) {
                    oldWs.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
                }
                oldWs.close(1000, 'Session rollover');
            } catch (_) {}
        }
        isReconnectingWs = false;
        openLiveWebSocket(apiKey);
    }

    function finalizeCurrentUtteranceNow() {
        if (!isRecording || !liveWebSocket || liveWebSocket.readyState !== WebSocket.OPEN || !wsSetupComplete) {
            commitPendingInterimToTranscript();
            return;
        }
        liveWebSocket.send(
            JSON.stringify({
                realtimeInput: {
                    audioStreamEnd: true
                }
            })
        );
        setStatus('Sent audioStreamEnd signal over WebSocket to finalize current utterance immediately.');
    }

    function stopLiveTranscription() {
        if (!isRecording) return;
        isRecording = false;

        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }

        commitPendingInterimToTranscript();

        if (liveWebSocket) {
            const wsToClose = liveWebSocket;
            liveWebSocket = null;
            wsSetupComplete = false;
            try {
                if (wsToClose.readyState === WebSocket.OPEN) {
                    wsToClose.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
                }
                wsToClose.close(1000, 'User stopped transcription');
            } catch (_) {}
        }

        pcmSampleAccumulator = [];
        startRecordingBtn.disabled = false;
        flushSegmentBtn.disabled = true;
        stopRecordingBtn.disabled = true;
        recDot.classList.remove('recording');
        chunkCountdownEl.textContent = '';
        updateWebSocketBadge('WebSocket Idle', '');
        interimTranscriptText.textContent = 'Live transcription paused. Click "Start Live Transcription (WebSocket)" to resume.';
        setStatus('WebSocket live transcription stopped.');
    }

    function onRecordingTick() {
        if (!isRecording) return;
        const now = Date.now();
        const totalElapsedSec = Math.floor((now - recordingStartTimeMs) / 1000);
        recordingTimerEl.textContent = formatDurationSeconds(totalElapsedSec);

        // Hybrid VAD: auto-send audioStreamEnd when silence follows speech or utterance exceeds 20s
        if (
            wsSetupComplete &&
            currentInterimText &&
            !autoStreamEndSentForTurn &&
            liveWebSocket &&
            liveWebSocket.readyState === WebSocket.OPEN
        ) {
            const silenceElapsedMs = lastVoiceDetectedMs > 0 ? (now - lastVoiceDetectedMs) : 0;
            const utteranceDurationMs = currentInterimStartMs > 0 ? (now - currentInterimStartMs) : 0;
            if (silenceElapsedMs >= HYBRID_VAD_SILENCE_MS || utteranceDurationMs >= MAX_CONTINUOUS_UTTERANCE_MS) {
                autoStreamEndSentForTurn = true;
                try {
                    liveWebSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
                } catch (_) {}
            }
        }

        // Check 10-minute session limit rollover (reconnect every 9m30s)
        const sessionElapsedSec = Math.floor((now - wsSessionStartTimeMs) / 1000);
        const remainingSessionSec = Math.max(0, SESSION_MAX_SECONDS - sessionElapsedSec);
        chunkCountdownEl.textContent = wsSetupComplete ? '(WebSocket live)' : '(connecting...)';

        if (remainingSessionSec <= 0 && wsSetupComplete) {
            setStatus('Refreshing 10-minute WebSocket session for continuous meeting transcription...');
            reconnectLiveWebSocket();
        }
    }

    function updateWebSocketBadge(text, stateClass) {
        pendingChunksBadge.textContent = text;
        pendingChunksBadge.className = stateClass ? `source-badge ${stateClass}` : 'source-badge';
    }

    function formatTranscriptSegment(text, timestampLabel, sourceLabel) {
        const clean = (text || '').trim();
        if (!clean) return '';
        if (includeTimestampsToggle.checked) {
            return `[${timestampLabel} | ${sourceLabel}] ${clean}`;
        }
        return clean;
    }

    function syncTranscriptBoxWithLiveStream() {
        const shouldScroll =
            transcriptBox.scrollHeight - transcriptBox.scrollTop - transcriptBox.clientHeight < 80;

        const base = committedTranscript.trim();
        const liveLine = currentInterimText
            ? formatTranscriptSegment(
                currentInterimText,
                currentInterimTimestamp || formatClockTime(new Date()),
                currentInterimSource || determineActiveSourceLabel()
            )
            : '';

        const combined = base
            ? (liveLine ? `${base}\n\n${liveLine}` : base)
            : liveLine;

        transcriptBox.value = combined;
        localStorage.setItem('meetingAssistant_transcriptDraft', combined);
        updateTranscriptStats();

        if (shouldScroll) {
            transcriptBox.scrollTop = transcriptBox.scrollHeight;
        }
    }

    function commitPendingInterimToTranscript() {
        const pending = currentInterimText.trim();
        if (!pending) return;

        const ts = currentInterimTimestamp || formatClockTime(new Date());
        const src = currentInterimSource || determineActiveSourceLabel();
        const formatted = formatTranscriptSegment(pending, ts, src);
        const base = committedTranscript.trim();
        committedTranscript = base ? `${base}\n\n${formatted}` : formatted;
        transcribedSegmentsCount++;

        currentInterimText = '';
        currentInterimTimestamp = '';
        currentInterimSource = '';
        currentInterimStartMs = 0;
        autoStreamEndSentForTurn = false;
        syncTranscriptBoxWithLiveStream();
    }

    function appendTranscriptionSegment(text, timestampLabel, sourceLabel) {
        const formattedLine = formatTranscriptSegment(text, timestampLabel, sourceLabel);
        if (!formattedLine) return;

        const existing = committedTranscript.trim();
        committedTranscript = existing ? `${existing}\n\n${formattedLine}` : formattedLine;
        syncTranscriptBoxWithLiveStream();
    }

    startRecordingBtn.addEventListener('click', startLiveTranscription);
    flushSegmentBtn.addEventListener('click', finalizeCurrentUtteranceNow);
    stopRecordingBtn.addEventListener('click', stopLiveTranscription);

    // =========================================================================
    // Direct Full-File Transcription (for uploaded local video/audio files)
    // =========================================================================
    transcribeUploadedFileBtn.addEventListener('click', async () => {
        if (!uploadedMediaFile) return;
        const apiKey = getValidatedApiKey();
        if (!apiKey) return;

        const maxInlineBytes = 20 * 1024 * 1024;
        if (uploadedMediaFile.size > maxInlineBytes) {
            showError(
                `File "${uploadedMediaFile.name}" is ${(uploadedMediaFile.size / (1024 * 1024)).toFixed(1)} MB (exceeds 20 MB inline limit). ` +
                `Instead, click "Start Live Transcription (WebSocket)" and play the video to stream its audio over WebSocket!`
            );
            return;
        }

        clearError();
        transcribeUploadedFileBtn.disabled = true;
        transcribeUploadedFileBtn.textContent = 'Transcribing File...';

        try {
            const base64Data = await blobToBase64(uploadedMediaFile);
            const mimeType = uploadedMediaFile.type || 'audio/mp4';
            const model = assistantModelSelect.value;
            const instruction =
                'Transcribe all spoken words in this media file accurately. ' +
                'Distinguish speakers if multiple people speak, and return ONLY the transcription.';

            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: instruction },
                            { inlineData: { mimeType, data: base64Data } }
                        ]
                    }
                ],
                generationConfig: { temperature: 0.1 }
            };

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(responseData.error?.message || response.statusText);
            }

            recordUsageStats('transcription', model, responseData.usageMetadata);
            recordApiLog(`Direct File Transcription (${uploadedMediaFile.name})`, model, { instruction, mimeType }, responseData);

            const rawText = (responseData.candidates?.[0]?.content?.parts || [])
                .map(p => p.text || '')
                .join('')
                .trim();

            if (rawText) {
                transcribedSegmentsCount++;
                appendTranscriptionSegment(rawText, formatClockTime(new Date()), `File: ${uploadedMediaFile.name}`);
                setStatus(`Finished transcribing "${uploadedMediaFile.name}".`);
            }
        } catch (err) {
            showError(`File transcription error: ${err.message}`);
        } finally {
            transcribeUploadedFileBtn.disabled = false;
            transcribeUploadedFileBtn.textContent = 'Transcribe Entire File Now';
        }
    });

    // =========================================================================
    // Transcript Box Management
    // =========================================================================
    function updateTranscriptStats() {
        const text = transcriptBox.value.trim();
        const chars = text.length;
        const words = text ? text.split(/\s+/).length : 0;
        const liveInProgress = currentInterimText.trim() ? ' (+1 live stream active)' : '';
        transcriptStatsEl.textContent = `${words.toLocaleString()} words | ${chars.toLocaleString()} chars | ${transcribedSegmentsCount} utterances transcribed${liveInProgress}`;
    }

    transcriptBox.addEventListener('input', () => {
        committedTranscript = transcriptBox.value;
        currentInterimText = '';
        currentInterimTimestamp = '';
        currentInterimSource = '';
        localStorage.setItem('meetingAssistant_transcriptDraft', transcriptBox.value);
        updateTranscriptStats();
    });

    copyTranscriptBtn.addEventListener('click', async () => {
        const textToCopy = getEffectiveMeetingTranscript();
        if (!textToCopy) return;
        try {
            await navigator.clipboard.writeText(textToCopy);
            setStatus('Meeting transcript copied to clipboard.');
        } catch (_) {
            transcriptBox.select();
            document.execCommand('copy');
            setStatus('Meeting transcript copied.');
        }
    });

    downloadTranscriptBtn.addEventListener('click', () => {
        const content = getEffectiveMeetingTranscript();
        if (!content) {
            showError('Transcript is empty—nothing to download.');
            return;
        }
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `meeting-transcript-${dateStamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('Downloaded meeting transcript.');
    });

    clearTranscriptBtn.addEventListener('click', () => {
        if (transcriptBox.value.trim() && !confirm('Clear the entire meeting transcript?')) {
            return;
        }
        committedTranscript = '';
        currentInterimText = '';
        currentInterimTimestamp = '';
        currentInterimSource = '';
        transcriptBox.value = '';
        transcribedSegmentsCount = 0;
        localStorage.removeItem('meetingAssistant_transcriptDraft');
        updateTranscriptStats();
        setStatus('Transcript cleared.');
    });

    // =========================================================================
    // Task 2: Meeting Co-Pilot Prompt Execution (Transcript + Prompt -> Gemini REST API)
    // =========================================================================
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const presetKey = chip.getAttribute('data-preset');
            if (PRESET_PROMPTS[presetKey]) {
                promptInput.value = PRESET_PROMPTS[presetKey];
                promptInput.focus();
            }
        });
    });

    clearPromptBtn.addEventListener('click', () => {
        promptInput.value = '';
        promptInput.focus();
    });

    promptInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            sendPromptToGemini();
        }
    });

    sendPromptBtn.addEventListener('click', sendPromptToGemini);

    cancelPromptBtn.addEventListener('click', () => {
        if (promptAbortController) {
            promptAbortController.abort();
            promptAbortController = null;
        }
    });

    /**
     * Returns the full meeting transcript including both committed utterances and any
     * currently streaming text in the "Live Stream:" bar.
     */
    function getEffectiveMeetingTranscript() {
        if (currentInterimText.trim()) {
            syncTranscriptBoxWithLiveStream();
        }

        let text = transcriptBox.value.trim();
        if (!text) {
            const rawLiveBar = (interimTranscriptText.textContent || '').trim();
            const isPlaceholder =
                !rawLiveBar ||
                rawLiveBar.startsWith('Start live transcription') ||
                rawLiveBar.startsWith('Connecting to ') ||
                rawLiveBar.startsWith('Listening ') ||
                rawLiveBar.startsWith('Live transcription paused');
            if (!isPlaceholder) {
                text = rawLiveBar;
                committedTranscript = text;
                transcriptBox.value = text;
                localStorage.setItem('meetingAssistant_transcriptDraft', text);
                updateTranscriptStats();
            }
        }
        return text;
    }

    async function sendPromptToGemini() {
        clearError();
        const apiKey = getValidatedApiKey();
        if (!apiKey) return;

        const userPrompt = promptInput.value.trim();
        const transcriptText = getEffectiveMeetingTranscript();

        // If recording is active and there is an unfinalized interim utterance, signal audioStreamEnd
        // so the Live WebSocket finalizes the current speech segment.
        if (
            isRecording &&
            wsSetupComplete &&
            currentInterimText.trim() &&
            !autoStreamEndSentForTurn &&
            liveWebSocket &&
            liveWebSocket.readyState === WebSocket.OPEN
        ) {
            autoStreamEndSentForTurn = true;
            try {
                liveWebSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
            } catch (_) {}
        }

        if (!userPrompt) {
            showError('Please enter a prompt or select one of the quick meeting preset buttons.');
            promptInput.focus();
            return;
        }

        if (includeTranscriptToggle.checked && !transcriptText) {
            showError(
                'The meeting transcript box is currently empty. Start live transcription, type/paste notes into the transcript box, or uncheck "Attach current meeting transcript".'
            );
            return;
        }

        const model = assistantModelSelect.value;
        promptAbortController = new AbortController();

        sendPromptBtn.disabled = true;
        cancelPromptBtn.classList.remove('hidden');
        assistantOutput.textContent = 'Analyzing meeting transcript and generating response...';
        setStatus(`Sending meeting transcript & prompt to ${model}...`);

        try {
            const contents = [];

            if (includeHistoryContextToggle.checked && assistantHistory.length > 0) {
                const recentTurns = assistantHistory.slice(0, 5).reverse();
                for (const turn of recentTurns) {
                    contents.push({
                        role: 'user',
                        parts: [{ text: turn.prompt }]
                    });
                    contents.push({
                        role: 'model',
                        parts: [{ text: turn.response }]
                    });
                }
            }

            let combinedPromptText = '';
            if (includeTranscriptToggle.checked && transcriptText) {
                combinedPromptText =
                    `=== MEETING TRANSCRIPT (CAPTURED FROM VIDEO VOICE & MIC VOICE) ===\n` +
                    `${transcriptText}\n` +
                    `=== END OF MEETING TRANSCRIPT ===\n\n` +
                    `=== USER REQUEST / PROMPT ===\n` +
                    `${userPrompt}`;
            } else {
                combinedPromptText = userPrompt;
            }

            contents.push({
                role: 'user',
                parts: [{ text: combinedPromptText }]
            });

            const requestBody = {
                systemInstruction: {
                    parts: [
                        {
                            text:
                                'You are an expert AI Meeting Assistant and technical co-pilot. ' +
                                'You help the user understand, summarize, troubleshoot problems, extract action items, and answer questions based on live meeting transcripts captured from both meeting/video audio and the user\'s microphone. ' +
                                'Provide clear, well-structured, and actionable responses.'
                        }
                    ]
                },
                contents
            };

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: promptAbortController.signal
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errMsg = responseData.error?.message || response.statusText;
                recordApiLog('Meeting Assistant Prompt (Error)', model, requestBody, { error: errMsg });
                throw new Error(errMsg);
            }

            recordUsageStats('assistant', model, responseData.usageMetadata);
            recordApiLog('Meeting Assistant Prompt', model, requestBody, responseData);

            const answerText = (responseData.candidates?.[0]?.content?.parts || [])
                .map(part => part.text || '')
                .join('')
                .trim();

            const finalOutput = answerText || '(No text returned by the model.)';
            assistantOutput.textContent = finalOutput;

            assistantHistory.unshift({
                timestamp: formatClockTime(new Date()),
                prompt: userPrompt,
                response: finalOutput,
                model
            });
            renderAssistantHistory();
            setStatus(`Received response from ${model}.`);
        } catch (err) {
            if (err.name === 'AbortError') {
                assistantOutput.textContent = 'Request cancelled by user.';
                setStatus('Prompt request cancelled.');
            } else {
                assistantOutput.textContent = `Error: ${err.message}`;
                showError(`Gemini API error: ${err.message}`);
            }
        } finally {
            promptAbortController = null;
            sendPromptBtn.disabled = false;
            cancelPromptBtn.classList.add('hidden');
        }
    }

    copyResponseBtn.addEventListener('click', async () => {
        const text = assistantOutput.textContent.trim();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setStatus('Gemini response copied to clipboard.');
        } catch (_) {}
    });

    appendResponseToTranscriptBtn.addEventListener('click', () => {
        const text = assistantOutput.textContent.trim();
        if (!text || text.startsWith('Ask a question')) return;
        commitPendingInterimToTranscript();
        const stamp = formatClockTime(new Date());
        const noteBlock = `[${stamp} | Gemini Assistant Note]\n${text}`;
        const current = committedTranscript.trim();
        committedTranscript = current ? `${current}\n\n${noteBlock}` : noteBlock;
        syncTranscriptBoxWithLiveStream();
        transcriptBox.scrollTop = transcriptBox.scrollHeight;
        setStatus('Appended Gemini response to the meeting transcript notes.');
    });

    clearHistoryBtn.addEventListener('click', () => {
        assistantHistory = [];
        renderAssistantHistory();
    });

    function renderAssistantHistory() {
        historyCountEl.textContent = assistantHistory.length.toString();
        historyListEl.innerHTML = '';

        assistantHistory.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'history-item';

            const header = document.createElement('div');
            header.className = 'history-item-header';
            header.textContent = `${item.timestamp} • ${item.model}`;

            const promptDiv = document.createElement('div');
            promptDiv.className = 'history-item-prompt';
            promptDiv.textContent = `Prompt: ${item.prompt}`;

            const respDiv = document.createElement('div');
            respDiv.className = 'history-item-response';
            respDiv.textContent = item.response;

            div.appendChild(header);
            div.appendChild(promptDiv);
            div.appendChild(respDiv);
            historyListEl.appendChild(div);
        });
    }

    // =========================================================================
    // Token & Cost Tracking (Differentiating Cached vs Non-Cached Tokens)
    // =========================================================================
    function recordUsageStats(category, model, usageMetadata) {
        const usage = (typeof GEMINI_PRICING_CONFIG !== 'undefined' && GEMINI_PRICING_CONFIG.calculateUsageCost)
            ? GEMINI_PRICING_CONFIG.calculateUsageCost(model, usageMetadata)
            : {
                cost: 0,
                promptTokens: usageMetadata?.promptTokenCount || 0,
                uncachedTokens: (usageMetadata?.promptTokenCount || 0) - (usageMetadata?.cachedContentTokenCount || 0),
                cachedTokens: usageMetadata?.cachedContentTokenCount || 0,
                outputTokens: usageMetadata?.candidatesTokenCount || usageMetadata?.responseTokenCount || 0
            };

        lastCallTypeEl.textContent = category === 'transcription'
            ? `Live Transcription (${model})`
            : `Meeting Prompt (${model})`;
        lastInputTokensEl.textContent =
            `${usage.promptTokens.toLocaleString()} (Non-Cached: ${usage.uncachedTokens.toLocaleString()}, Cached: ${usage.cachedTokens.toLocaleString()})`;
        lastOutputTokensEl.textContent = usage.outputTokens.toLocaleString();
        lastCallCostEl.textContent = `$${usage.cost.toFixed(6)}`;

        const bucket = stats[category];
        if (bucket) {
            bucket.calls += 1;
            bucket.promptTokens += usage.promptTokens;
            bucket.uncachedTokens += usage.uncachedTokens;
            bucket.cachedTokens += usage.cachedTokens;
            bucket.outputTokens += usage.outputTokens;
            bucket.cost += usage.cost;
        }

        transSessionCallsEl.textContent = stats.transcription.calls.toLocaleString();
        transSessionInputTokensEl.textContent =
            `${stats.transcription.promptTokens.toLocaleString()} (Non-Cached: ${stats.transcription.uncachedTokens.toLocaleString()}, Cached: ${stats.transcription.cachedTokens.toLocaleString()})`;
        transSessionOutputTokensEl.textContent = stats.transcription.outputTokens.toLocaleString();
        transSessionCostEl.textContent = `$${stats.transcription.cost.toFixed(6)}`;

        assistSessionCallsEl.textContent = stats.assistant.calls.toLocaleString();
        assistSessionInputTokensEl.textContent =
            `${stats.assistant.promptTokens.toLocaleString()} (Non-Cached: ${stats.assistant.uncachedTokens.toLocaleString()}, Cached: ${stats.assistant.cachedTokens.toLocaleString()})`;
        assistSessionOutputTokensEl.textContent = stats.assistant.outputTokens.toLocaleString();
        assistSessionCostEl.textContent = `$${stats.assistant.cost.toFixed(6)}`;

        const grandTotal = stats.transcription.cost + stats.assistant.cost;
        grandTotalCostEl.textContent = `$${grandTotal.toFixed(6)}`;
    }

    // =========================================================================
    // Debug API Logs
    // =========================================================================
    function recordApiLog(actionTitle, model, requestPayload, responsePayload) {
        apiLogs.unshift({
            timestamp: new Date().toLocaleTimeString(),
            actionTitle,
            model,
            requestPayload,
            responsePayload
        });
        if (apiLogs.length > 30) {
            apiLogs.pop();
        }
        renderApiLogs();
    }

    function renderApiLogs() {
        logCountEl.textContent = apiLogs.length.toString();
        apiLogContainer.innerHTML = '';

        apiLogs.forEach((entry, idx) => {
            const div = document.createElement('div');
            div.className = 'api-log-entry';

            const header = document.createElement('div');
            header.style.fontWeight = '600';
            header.style.fontSize = '0.84rem';
            header.style.marginBottom = '6px';
            header.textContent = `[#${apiLogs.length - idx}] ${entry.timestamp} - ${entry.actionTitle} (${entry.model})`;

            const pre = document.createElement('pre');
            pre.textContent = JSON.stringify(
                {
                    request: entry.requestPayload,
                    response: entry.responsePayload
                },
                null,
                2
            );

            div.appendChild(header);
            div.appendChild(pre);
            apiLogContainer.appendChild(div);
        });
    }

    clearLogsBtn.addEventListener('click', () => {
        apiLogs = [];
        renderApiLogs();
    });

    // =========================================================================
    // Utility Helpers
    // =========================================================================
    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result || '';
                const commaIdx = dataUrl.indexOf(',');
                resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function formatClockTime(date) {
        return date.toTimeString().slice(0, 8);
    }

    function formatDurationSeconds(totalSec) {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    init();
});
