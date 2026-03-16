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
        
        // Create audio graph: microphone -> gainNode -> destination (speakers/earphones)
        microphone = audioCtx.createMediaStreamSource(stream);
        gainNode = audioCtx.createGain();
        
        gainNode.gain.value = parseFloat(volumeSlider.value);
        
        microphone.connect(gainNode);
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

btnStart.addEventListener('click', startAudio);
btnStop.addEventListener('click', stopAudio);

volumeSlider.addEventListener('input', (e) => {
    if (gainNode) {
        gainNode.gain.value = parseFloat(e.target.value);
    }
});
