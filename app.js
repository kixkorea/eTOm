let audioCtx;
let microphone;
let gainNode;
let stream;
let wakeLock = null;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const volumeSlider = document.getElementById('volumeSlider');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const errorMessage = document.getElementById('errorMessage');

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        }
    } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
            });
    }
}

// Handle visibility change to re-acquire wake lock if active
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

async function startAudio() {
    errorMessage.textContent = '';
    try {
        // Request microphone access with ultra-low latency settings
        // Disabling built-in processing reduces latency and "pumping" artifacts
        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                latency: 0 // Request lowest possible latency
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Initialize AudioContext if not already created
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext({ latencyHint: 'interactive' });
        
        // Professional Hearing Aid Mode Filters
        
        // 1. High Pass Filter: Remove low-frequency rumble (below 300Hz)
        const highPass = audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 300; 
        
        // 2. Presence Filter: Boost vocal clarity frequencies (2kHz)
        const presenceFilter = audioCtx.createBiquadFilter();
        presenceFilter.type = 'peaking';
        presenceFilter.frequency.value = 2000;
        presenceFilter.Q.value = 1.0;
        presenceFilter.gain.value = 10; // Boost vocal range by +10dB
        
        // 3. Dynamics Compressor: Level the sound and prevent clipping
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(40, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        // Create audio graph: microphone -> filters -> compressor -> gainNode -> destination
        microphone = audioCtx.createMediaStreamSource(stream);
        gainNode = audioCtx.createGain();
        gainNode.gain.value = parseFloat(volumeSlider.value);
        
        // Connect nodes
        microphone.connect(highPass);
        highPass.connect(presenceFilter);
        presenceFilter.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Update UI
        btnStart.disabled = true;
        btnStop.disabled = false;
        statusIndicator.classList.remove('stopped');
        statusIndicator.classList.add('running');
        statusText.textContent = '연결됨 (작동 중)';
        
        // Request screen wake lock
        await requestWakeLock();

    } catch (err) {
        console.error('Error starting audio:', err);
        errorMessage.textContent = '마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해주세요.';
    }
}

function stopAudio() {
    if (microphone) {
        microphone.disconnect();
    }
    if (gainNode) {
        gainNode.disconnect();
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
    }
    
    releaseWakeLock();
    
    // Update UI
    btnStart.disabled = false;
    btnStop.disabled = true;
    statusIndicator.classList.remove('running');
    statusIndicator.classList.add('stopped');
    statusText.textContent = '대기 중';
}

if (btnStart) btnStart.addEventListener('click', startAudio);
if (btnStop) btnStop.addEventListener('click', stopAudio);

if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        if (gainNode) {
            gainNode.gain.value = parseFloat(e.target.value);
        }
    });
}

// --- PWA App Install Logic ---
let deferredPrompt;
const installSection = document.getElementById('installSection');
const installFallback = document.getElementById('installFallback');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    if (installSection) {
        // Change visual cue to show it's ready to install
        installSection.style.border = '2px solid #FF8C00';
        installSection.style.backgroundColor = '#382a1b'; // Highlight color
        if (installFallback) {
            installFallback.textContent = "(클릭하여 설치를 진행하세요)";
            installFallback.style.color = "#FF8C00";
            installFallback.style.fontWeight = "bold";
        }
        
        installSection.onclick = async () => {
            if (deferredPrompt) {
                // Show the install prompt
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                // We've used the prompt, and can't use it again, throw it away
                deferredPrompt = null;
                
                // Reset styles after interaction
                installSection.style.border = 'none';
                installSection.style.backgroundColor = '#2a2a2a';
                if (installFallback) {
                    installFallback.textContent = "(설치가 완료되었거나 프롬프트가 닫혔습니다)";
                    installFallback.style.color = "#888";
                    installFallback.style.fontWeight = "normal";
                }
            }
        };
    }
});
