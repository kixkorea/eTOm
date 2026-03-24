let audioCtx;
let microphone;
let gainNode;
let stream;
let wakeLock = null;

let highPass;
let presenceFilter;
let lowPass;
let compressor;
window.currentPresetMode = 1;

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
        
        // Initialize Global Filters
        highPass = audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        
        presenceFilter = audioCtx.createBiquadFilter();
        presenceFilter.type = 'peaking';
        
        lowPass = audioCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        
        compressor = audioCtx.createDynamicsCompressor();

        microphone = audioCtx.createMediaStreamSource(stream);
        gainNode = audioCtx.createGain();
        
        // Connect nodes: Mic -> HighPass -> Presence -> LowPass -> Compressor -> Gain -> Destination
        microphone.connect(highPass);
        highPass.connect(presenceFilter);
        presenceFilter.connect(lowPass);
        lowPass.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Apply Mode 
        applyPreset(window.currentPresetMode);
        
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

function applyPreset(mode) {
    window.currentPresetMode = mode;
    for(let i=1; i<=5; i++) {
        const btn = document.getElementById('btnMode' + i);
        if(btn) btn.classList.remove('active');
    }
    const activeBtn = document.getElementById('btnMode' + mode);
    if(activeBtn) activeBtn.classList.add('active');

    let hpFreq = 20, pFreq = 2000, pGain = 0, lpFreq = 20000, compThresh = -10, compRatio = 1, fixedGain = 1.0;

    switch(mode) {
        case 1: // 기본 증폭 (Standard)
            hpFreq = 50; lpFreq = 16000; compThresh = -10; compRatio = 2; fixedGain = 2.0; break;
        case 2: // 강력 증폭 (Compressor)
            hpFreq = 100; lpFreq = 12000; compThresh = -30; compRatio = 12; fixedGain = 2.8; break;
        case 3: // 대화 집중 (Vocal EQ Boost)
            hpFreq = 200; pFreq = 2500; pGain = 12; lpFreq = 10000; compThresh = -24; compRatio = 8; fixedGain = 2.2; break;
        case 4: // 소음 억제 (Noise Filter)
            hpFreq = 400; pFreq = 2000; pGain = 5; lpFreq = 8000; compThresh = -20; compRatio = 6; fixedGain = 2.5; break;
        case 5: // 귀 보호 (De-esser / Lowpass)
            hpFreq = 100; pFreq = 2000; pGain = 2; lpFreq = 3000; compThresh = -24; compRatio = 10; fixedGain = 2.5; break;
    }

    if (volumeSlider && audioCtx) {
        volumeSlider.value = fixedGain;
    }

    if (!audioCtx) return;

    if (gainNode) gainNode.gain.setTargetAtTime(fixedGain, audioCtx.currentTime, 0.1);
    
    highPass.frequency.setTargetAtTime(hpFreq, audioCtx.currentTime, 0.1);
    presenceFilter.frequency.setTargetAtTime(pFreq, audioCtx.currentTime, 0.1);
    presenceFilter.gain.setTargetAtTime(pGain, audioCtx.currentTime, 0.1);
    lowPass.frequency.setTargetAtTime(lpFreq, audioCtx.currentTime, 0.1);
    compressor.threshold.setTargetAtTime(compThresh, audioCtx.currentTime, 0.1);
    compressor.ratio.setTargetAtTime(compRatio, audioCtx.currentTime, 0.1);
}

for(let i=1; i<=5; i++) {
    const btn = document.getElementById('btnMode' + i);
    if(btn) btn.addEventListener('click', () => applyPreset(i));
}

// --- PWA App Install Logic ---
let deferredPrompt;
const installSection = document.getElementById('installSection');
const installFallback = document.getElementById('installFallback');
const iosPopup = document.getElementById('iosInstallPopup');
const closeIosPopup = document.getElementById('closeIosPopup');

// 1. Detect device/environment
const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};
const isStandalone = () => {
    return ('standalone' in window.navigator && window.navigator.standalone) ||
           window.matchMedia('(display-mode: standalone)').matches;
};

// 2. Catch the install prompt (Android/PC only)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// 2.5. Auto-popup for iOS on page load
window.addEventListener('DOMContentLoaded', () => {
    if (isIos() && !isStandalone() && iosPopup) {
        iosPopup.style.display = 'flex';
    }
});

// 3. Setup Install Button (Left Section)
if (installSection) {
    if (isStandalone()) {
        // 이미 앱으로 설치된 상태
        // installSection.style.border = 'none';
        // installSection.style.backgroundColor = '#2a2a2a';
        if (installFallback) {
            installFallback.textContent = "(이미 앱으로 완벽하게 설치되었습니다 🎉)";
            installFallback.style.color = "#888";
        }
    } else {
        // 설치 가능한 상태 (강조 효과 제거 - 디자인에서 처리)
        // installSection.style.border = '2px solid #FF8C00';
        // installSection.style.backgroundColor = '#382a1b';
        if (installFallback) {
            installFallback.innerText = "-클릭하시면설치가진행됩니다-";
            installFallback.style.color = "white";
            installFallback.style.fontWeight = "bold";
        }
        
        installSection.onclick = async () => {
            if (isStandalone()) {
                alert("이미 앱으로 설치되어 있습니다!");
                return;
            }

            if (deferredPrompt) {
                // Android & PC: 기본 브라우저 팝업
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                
                // 프롬프트 응답 후 UI 원상복구
                // installSection.style.border = 'none';
                // installSection.style.backgroundColor = '#2a2a2a';
                if (installFallback) {
                    installFallback.textContent = "(설치 창을 띄웠습니다)";
                    installFallback.style.color = "#888";
                    installFallback.style.fontWeight = "normal";
                }
            } else if (isIos()) {
                // iOS (Apple): 자체 제작한 설명서 팝업 띄우기
                if (iosPopup) iosPopup.style.display = 'flex';
            } else {
                // 기타 예외 상황
                alert("현재 사용중인 브라우저에서는 자동 설치를 지원하지 않습니다.\n메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 찾아주세요.");
            }
        };
    }
}

// 4. Close iOS Popup
if (closeIosPopup) {
    closeIosPopup.onclick = (e) => {
        e.stopPropagation(); // 클릭 이벤트가 뒷배경으로 넘어가지 않도록 차단
        iosPopup.style.display = 'none';
    };
}
