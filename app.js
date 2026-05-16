const SAMPLE_RATE = 44100;
let audioContext, analyser, mediaStream;
let isRecording = false;
let recordedNotes = [];
let lastNote = null;
let noteHoldCount = 0;
let currentNotes = {};
let recordedBlob = null;
let recordedUrl = null;
let mediaRecorder = null;
let recordedChunks = [];
let staffStates = {
    vocal:{mode:'auto',locked:false},
    organ:{mode:'auto',locked:false},
    guitar:{mode:'auto',locked:false},
    drums:{mode:'auto',locked:false},
    coro:{mode:'auto',locked:false}
};

document.getElementById('btnRecord').addEventListener('click', startRecording);
document.getElementById('btnStop').addEventListener('click', stopRecording);
document.getElementById('btnGenerate').addEventListener('click', generateScore);

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

async function startRecording() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio:{
                echoCancellation:true,
                noiseSuppression:true,
                autoGainControl:true
            }
        });
        audioContext = new AudioContext({sampleRate:SAMPLE_RATE});
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192;
        audioContext.createMediaStreamSource(mediaStream).connect(analyser);
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = e => {
            if(e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(recordedChunks, {type:'audio/webm'});
            recordedUrl = URL.createObjectURL(recordedBlob);
        };
        mediaRecorder.start();
        recordedNotes = [];
        lastNote = null;
        noteHoldCount = 0;
        isRecording = true;
        document.getElementById('btnRecord').disabled = true;
        document.getElementById('btnStop').disabled = false;
        document.getElementById('btnGenerate').disabled = true;
        setStatus('🔴 Recording... Sing clearly!');
        detectPitchLoop();
    } catch(e) {
        setStatus('Error: ' + e.message);
    }
}

function stopRecording() {
    isRecording = false;
    if(mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
    if(audioContext) audioContext.close();
    document.getElementById('btnRecord').disabled = false;
    document.getElementById('btnStop').disabled = true;
    document.getElementById('btnGenerate').disabled = false;
    setStatus('✅ Detected ' + recordedNotes.length + ' notes');
}

function detectPitchLoop() {
    if(!isRecording) return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let rms = 0;
    for(let i=0;i<buffer.length;i++) rms += buffer[i]*buffer[i];
    rms = Math.sqrt(rms/buffer.length);
    if(rms > 0.001) {
        const pitch = autocorrelate(buffer, SAMPLE_RATE);
        if(pitch > 80 && pitch < 1200) {
            const note = freqToNote(pitch);
            if(note === lastNote) {
                noteHoldCount++;
            } else {
                if(lastNote && noteHoldCount >= 3) {
                    recordedNotes.push(lastNote);
                    setStatus('🔴 ' + recordedNotes.length + ' notes');
                }
                lastNote = note;
                noteHoldCount = 1;
            }
        }
    }
    requestAnimationFrame(detectPitchLoop);
}

function autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE/2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let foundGoodCorrelation = false;
    let correlations = new Array(MAX_SAMPLES);
    let rms = 0;
    for(let i=0;i<SIZE;i++) rms += buffer[i]*buffer[i];
    rms = Math.sqrt(rms/SIZE);
    if(rms < 0.001) return -1;
    let lastCorrelation = 1;
    for(let offset=0;offset<MAX_SAMPLES;offset++) {
        let correlation = 0;
        for(let i=0;i<MAX_SAMPLES;i++) {
            correlation += Math.abs((buffer[i])-(buffer[i+offset]));
        }
        correlation = 1-(correlation/MAX_SAMPLES);
        correlations[offset] = correlation;
        if((correlation > 0.9) && (correlation > lastCorrelation)) {
            foundGoodCorrelation = true;
            if(correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        } else if(foundGoodCorrelation) {
            let shift = (correlations[bestOffset+1] -
                correlations[bestOffset-1])/correlations[bestOffset];
            return sampleRate/(bestOffset+(8*shift));
        }
        lastCorrelation = correlation;
    }
    if(bestCorrelation > 0.01) return sampleRate/bestOffset;
    return -1;
}

function freqToNote(freq) {
    if(freq<=0) return null;
    const n=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const midi = Math.round(12*Math.log2(freq/440)+69);
    return n[midi%12] + (Math.floor(midi/12)-1);
}

function noteToFreq(note) {
    const n=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const name = note.slice(0,-1);
    const oct = parseInt(note.slice(-1));
    const midi = n.indexOf(name)+(oct+1)*12;
    return 440*Math.pow(2,(midi-69)/12);
}

async function generateScore() {
    if(!recordedUrl) {
        setStatus('⚠️ No recording found!');
        return;
    }
    if(recordedNotes.length===0) {
        setStatus('⚠️ No notes detected!');
        return;
    }
    currentNotes = {
        vocal: recordedNotes.slice(),
        organ: recordedNotes.slice(),
        guitar: genGuitar(recordedNotes),
        drums: genDrums(recordedNotes.length),
        coro: genCoro(recordedNotes)
    };
    await buildOrganFromAudio();
    renderStaffs();
    setStatus('🎼 ' + recordedNotes.length + ' notes generated!');
}

async function buildOrganFromAudio() {
    if(!recordedUrl) return;
    const response = await fetch(recordedUrl);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = new AudioContext();
    window._organAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
}

function playOrganFromAudio() {
    if(!window._organAudioBuffer) return;
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = window._organAudioBuffer;

    const distortion = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for(let i=0;i<512;i++) {
        const x = (i*2)/512 - 1;
        curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x)*8));
    }
    distortion.curve = curve;

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 200;
    low.gain.value = -6;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 900;
    mid.Q.value = 1.2;
    mid.gain.value = 8;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3000;
    high.gain.value = -10;

    const gain = ctx.createGain();
    gain.gain.value = 0.7;

    src.connect(distortion);
    distortion.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(gain);
    gain.connect(ctx.destination);
    src.start();
}

function renderStaffs() {
    const sc = document.getElementById('staffContainer');
    sc.innerHTML = '';

    const pb = document.createElement('button');
    pb.className = 'btn';
    pb.style.cssText = 'background:#F9A825;color:black;margin-bottom:8px';
    pb.textContent = '▶ Play All Instruments';
    pb.onclick = playAll;
    sc.appendChild(pb);

    if(recordedUrl) {
        const vocalDiv = document.createElement('div');
        vocalDiv.className = 'staff';
        vocalDiv.innerHTML =
            '<div class="staff-header">'+
            '<span class="staff-label" style="color:#F9A825">🎤 Your Voice</span>'+
            '</div>'+
            '<audio controls style="width:100%;margin-top:8px" src="'+
            recordedUrl+'"></audio>';
        sc.appendChild(vocalDiv);
    }

    const organDiv = document.createElement('div');
    organDiv.className = 'staff';
    organDiv.innerHTML =
        '<div class="staff-header">'+
        '<span class="staff-label" style="color:#4CAF50">🎹 Organ</span>'+
        '<div class="staff-controls">'+
        '<button class="btn-play" onclick="playOrganFromAudio()">▶</button>'+
        '<button class="btn-manual" onclick="setMode(\'organ\',\'manual\')">✏️</button>'+
        '<button class="btn-lock" onclick="toggleLock(\'organ\')">🔒</button>'+
        '</div></div>'+
        '<div class="notes" id="notes-organ">'+
        currentNotes.organ.join(' ')+'</div>'+
        '<textarea class="manual-input" id="input-organ" '+
        'placeholder="Type notes e.g. C4 D4 E4 F4" '+
        'onchange="updateManual(\'organ\')"></textarea>';
    sc.appendChild(organDiv);

    [
        {id:'guitar',label:'🎸 Guitar',color:'#2196F3'},
        {id:'drums',label:'🥁 Drums',color:'#F44336'},
        {id:'coro',label:'🎺 Coro',color:'#9C27B0'}
    ].forEach(s => sc.appendChild(createStaff(s)));

    const vocalStaff = document.createElement('div');
    vocalStaff.className = 'staff';
    vocalStaff.innerHTML =
        '<div class="staff-header">'+
        '<span class="staff-label" style="color:#F9A825">🎵 Vocal Notes</span>'+
        '<div class="staff-controls">'+
        '<button class="btn-play" onclick="playStaff(\'vocal\')">▶</button>'+
        '<button class="btn-manual" onclick="setMode(\'vocal\',\'manual\')">✏️</button>'+
        '</div></div>'+
        '<div class="notes" id="notes-vocal">'+
        currentNotes.vocal.join(' ')+'</div>'+
        '<textarea class="manual-input" id="input-vocal" '+
        'placeholder="Type notes e.g. C4 D4 E4 F4" '+
        'onchange="updateManual(\'vocal\')"></textarea>';
    sc.appendChild(vocalStaff);
}

function createStaff(s) {
    const notes = currentNotes[s.id]||[];
    const div = document.createElement('div');
    div.className = 'staff';
    div.innerHTML =
        '<div class="staff-header">'+
        '<span class="staff-label" style="color:'+s.color+'">'+s.label+'</span>'+
        '<div class="staff-controls">'+
        '<button class="btn-play" onclick="playStaff(\''+s.id+'\')">▶</button>'+
        '<button class="btn-auto" onclick="setMode(\''+s.id+'\',\'auto\')">Auto</button>'+
        '<button class="btn-manual" onclick="setMode(\''+s.id+'\',\'manual\')">✏️</button>'+
        '<button class="btn-lock" onclick="toggleLock(\''+s.id+'\')">🔒</button>'+
        '</div></div>'+
        '<div class="notes" id="notes-'+s.id+'">'+notes.join(' ')+'</div>'+
        '<textarea class="manual-input" id="input-'+s.id+'" '+
        'placeholder="Type notes e.g. C4 D4 E4 F4" '+
        'onchange="updateManual(\''+s.id+'\')"></textarea>';
    return div;
}

function playStaff(id) {
    const notes = currentNotes[id];
    if(!notes||notes.length===0) return;
    const ctx = new AudioContext();
    playNotes(ctx, notes, id, 0.5, 0);
}

function playAll() {
    const delay = 0.3;
    if(recordedUrl) {
        const audio = new Audio(recordedUrl);
        setTimeout(() => audio.play(), delay * 1000);
    }
    setTimeout(() => playOrganFromAudio(), delay * 1000);
    const ctx = new AudioContext();
    ['guitar','drums','coro'].forEach(id => {
        const notes = currentNotes[id];
        if(notes) playNotes(ctx, notes, id, 0.5, delay);
    });
}

function playNotes(ctx, notes, id, dur, startDelay=0) {
    notes.forEach((note,i) => {
        if(note==='—') return;
        if(['Kick','Snare','Hi-hat'].includes(note)) {
            playDrum(ctx, note, startDelay + i*dur);
            return;
        }
        const freq = noteToFreq(note);
        if(!freq||isNaN(freq)) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = id==='coro'?'sawtooth':'sine';
        const t = ctx.currentTime + startDelay + i*dur;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t+dur);
        osc.start(t);
        osc.stop(t+dur);
    });
}

function playDrum(ctx, type, time) {
    const buf = ctx.createBuffer(1, ctx.sampleRate*0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) {
        data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = type==='Kick'?0.8:type==='Snare'?0.5:0.3;
    src.start(ctx.currentTime+time);
}

function setMode(id, mode) {
    staffStates[id].mode = mode;
    const input = document.getElementById('input-'+id);
    if(input) input.style.display = mode==='manual'?'block':'none';
}

function toggleLock(id) {
    staffStates[id].locked = !staffStates[id].locked;
    setStatus(staffStates[id].locked?
        '🔒 '+id+' locked':'🔓 '+id+' unlocked');
}

function updateManual(id) {
    if(staffStates[id].locked) return;
    const val = document.getElementById('input-'+id).value;
    currentNotes[id] = val.trim().split(/\s+/);
    document.getElementById('notes-'+id).textContent = val;
}

function genGuitar(notes) {
    const c=['C','G','Am','F','Dm','Em'];
    return notes.map((_,i)=>c[i%c.length]);
}

function genDrums(len) {
    const p=['Kick','Snare','Hi-hat','Snare'];
    return Array.from({length:len},(_,i)=>p[i%p.length]);
}

function genCoro(notes) {
    return notes.map((n,i)=>i%2===0?n:'—');
}

if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
