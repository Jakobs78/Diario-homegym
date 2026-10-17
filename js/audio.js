// Audio for the short countdown and the longer final rest alarm.
// iOS home-screen PWAs can suspend Web Audio after backgrounding. A user
// gesture primes a reusable HTMLMediaElement fallback; this improves the
// foreground experience but cannot guarantee sounds under iOS screen lock.
let audioCtx = null;
let shortAudio = null;
let finalAudio = null;
let lastForegroundReset = false;

const onIOS = () => typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function createContext() {
    try {
        if (!audioCtx || audioCtx.state === 'closed') {
            const Constructor = window.AudioContext || window.webkitAudioContext;
            audioCtx = Constructor ? new Constructor() : null;
        }
    } catch (error) {
        console.warn('AudioContext non disponibile:', error);
        audioCtx = null;
    }
    return audioCtx;
}

function tryResume(ctx) {
    if (!ctx || ctx.state !== 'suspended') return;
    try {
        const resumed = ctx.resume();
        if (resumed?.catch) resumed.catch(() => {});
    } catch {}
}

// An embedded/generated PCM tone avoids any network calls, external files
// and autoplay of a remote stream. 22050Hz, 16-bit mono WAV.
function toneUrl(frequency, duration) {
    const rate = 22050;
    const frames = Math.ceil(rate * duration);
    const buf = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buf);
    const write = (offset, string) => {
        for (let i=0;i<string.length;i++) view.setUint8(offset+i,string.charCodeAt(i));
    };
    write(0,'RIFF');view.setUint32(4,36+frames*2,true);
    write(8,'WAVE');write(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);
    view.setUint16(22,1,true);view.setUint32(24,rate,true);
    view.setUint32(28,rate*2,true);view.setUint16(32,2,true);
    view.setUint16(34,16,true);write(36,'data');
    view.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++){
        const t=i/rate;
        const fade=Math.min(1,t/.012,Math.max(0,(duration-t)/.025));
        view.setInt16(44+2*i,Math.round(Math.sin(2*Math.PI*frequency*t) *
            0.45 * fade * 32767),true);
    }
    return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
}

function ensureHTMLPlayers() {
    if (typeof Audio !== 'function') return;
    if (!shortAudio) {
        shortAudio = new Audio(toneUrl(880,.16));
        shortAudio.preload='auto';
        shortAudio.playsInline=true;
    }
    if (!finalAudio) {
        finalAudio = new Audio(toneUrl(1700,1.25));
        finalAudio.preload='auto';
        finalAudio.playsInline=true;
    }
}


function beepWithContext(frequency,duration,type='sine') {
    const ctx=createContext();
    if(!ctx)return false;
    if(ctx.state==='suspended') {
        tryResume(ctx);
        return false;
    }
    if(ctx.state!=='running')return false;
    try {
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type=type;
        osc.frequency.setValueAtTime(frequency,ctx.currentTime);
        gain.gain.setValueAtTime(.22,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime+duration);
        osc.onended=()=>{try{osc.disconnect();gain.disconnect();}catch{}};
        return true;
    }catch(error){console.warn('Audio Web non disponibile:',error);return false;}
}

function playHTML(player,frequency=880,duration=.16,type='sine') {
    if(!player)return false;
    try {
        player.pause();
        player.currentTime=0;
        player.volume=.9;
        const promise=player.play();
        if(promise?.catch)promise.catch(error=>{
            console.warn('Beep HTML5 non autorizzato:',error?.message||error);
            beepWithContext(frequency,duration,type);
        });
        return true;
    }catch(error){
        console.warn('Beep HTML5 non disponibile:',error);
        return false;
    }
}

/** Play 5..1 short tones and a longer final tone without duplicate outputs. */
export function playBeep(frequency=800,duration=.15,type='sine') {
    if(typeof document!=='undefined' && document.visibilityState==='hidden')return;
    const player=duration>=.6?finalAudio:shortAudio;
    // Reusing preactivated HTML audio is usually more reliable in an iOS
    // standalone PWA than an oscillator from an old suspended context.
    if(onIOS() && player && playHTML(player,frequency,duration,type))return;
    if(beepWithContext(frequency,duration,type))return;
    if(player)playHTML(player,frequency,duration,type);
}

function wakeAudio({test=false}={}) {
    if(lastForegroundReset){
        lastForegroundReset=false;
        const old=audioCtx;
        audioCtx=null;
        if(old && old.state!=='closed') {
            try {const result=old.close();result?.catch?.(()=>{});} catch {}
        }
    }
    const ctx=createContext();
    tryResume(ctx);
    // Silent oscillator, scheduled inside the actual gesture, helps mobile
    // Safari authorize subsequent countdown oscillators without unexpected
    // audible tones at the first interaction.
    if(ctx){
        try {
            const osc=ctx.createOscillator(),gain=ctx.createGain();
            gain.gain.value=0;
            osc.connect(gain);gain.connect(ctx.destination);
            osc.start();osc.stop(ctx.currentTime+.04);
            osc.onended=()=>{osc.disconnect();gain.disconnect();};
        }catch{}
    }
    if(onIOS())ensureHTMLPlayers();
    if(test){
        // The test is explicitly requested by the athlete, during a click
        // gesture. It does not guarantee playback while the phone is locked.
        if(onIOS()&&shortAudio)playHTML(shortAudio,880,.2);
        else beepWithContext(880,.2);
    }
    return Boolean(ctx||shortAudio);
}

/** Explicit sound test for iOS PWA; a real tap can reauthorize playback. */
export function testTimerAudio() {
    return wakeAudio({test:true});
}

export function initAudioUnlock() {
    // No persistent silent oscillator in the background: that is unreliable
    // on iOS and can drain battery.
    const unlock=()=>wakeAudio();
    document.addEventListener('pointerdown',unlock,{once:true});
    document.addEventListener('touchend',unlock,{once:true});
    document.addEventListener('keydown',unlock,{once:true});
    document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible'){
            // A suspended or stale Web Audio context may be permanently
            // silent after foregrounding on some iOS versions.
            if(onIOS())lastForegroundReset=true;
            else tryResume(audioCtx);
        }
    });
    window.addEventListener('pageshow',event=>{
        if(event.persisted&&onIOS())lastForegroundReset=true;
    });
}
