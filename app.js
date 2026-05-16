const SAMPLE_RATE = 44100;
let audioContext, analyser, mediaStream;
let isRecording = false;
let recordedNotes = [];
let lastNote = null;
let noteHoldCount = 0;
let currentNotes = {};
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
            audio:{echoCancellation:true,noiseSuppression:true}
        });
        audioContext = new AudioContext({sampleRate:SAMPLE_RATE});
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 4096;
        audioContext.createMediaStreamSource(mediaStream).connect(analyser);
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
        const pitch = yin(buffer, SAMPLE_RATE);
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

function yin(buffer, sampleRate) {
    const threshold = 0.15;
    const half = Math.floor(buffer.length/2);
    const yb = new Float32Array(half);
    yb[0] = 1;
    let sum = 0;
    for(let tau=1;tau<half;tau++) {
        let s = 0;
        for(let i=0;i<half;i++) {
            const d = buffer[i]-buffer[i+tau];
            s += d*d;
        }
        sum += s;
        yb[tau] = sum>0 ? s*tau/sum : 0;
    }
    for(let tau=2;tau<half;tau++) {
        if(yb[tau]<threshold) {
            while(tau+1<half && yb[tau+1]<yb[tau]) tau++;
            return sampleRate/tau;
        }
    }
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

function generateScore() {
    if(recordedNotes.length===0) {
        setStatus('⚠️ No notes detected!');
        return;
    }
    currentNotes = {
        vocal: recordedNotes.slice(),
        organ: genOrgan(recordedNotes),
        guitar: genGuitar(recordedNotes),
        drums: genDrums(recordedNotes.length),
        coro: genCoro(recordedNotes)
    };
    renderStaffs();
    setStatus('🎼 ' + recordedNotes.length + ' notes generated!');
}

function renderStaffs() {
    const sc = document.getElementById('staffContainer');
    sc.innerHTML = '';
    const pb = document.createElement('button');
    pb.className = 'btn';
    pb.style.cssText = 'background:#F9A825;color:black;margin-bottom:12px';
    pb.textContent = '▶ Play All Instruments';
    pb.onclick = playAll;
    sc.appendChild(pb);
    [
        {id:'vocal',label:'🎤 Vocal',color:'#F9A825'},
        {id:'organ',label:'🎹 Organ',color:'#4CAF50'},
        {id:'guitar',label:'🎸 Guitar',color:'#2196F3'},
        {id:'drums',label:'🥁 Drums',color:'#F44336'},
        {id:'coro',label:'🎺 Coro',color:'#9C27B0'}
    ].forEach(s => sc.appendChild(createStaff(s)));
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
    playNotes(ctx, notes, id, 0.5);
}

function playAll() {
    const ctx = new AudioContext();
    ['vocal','organ','guitar','drums','coro'].forEach(id => {
        const notes = currentNotes[id];
        if(notes) playNotes(ctx, notes, id, 0.5);
    });
}

function playNotes(ctx, notes, id, dur) {
    notes.forEach((note,i) => {
        if(note==='—') return;
        if(['Kick','Snare','Hi-hat'].includes(note)) {
            playDrum(ctx, note, i*dur);
            return;
        }
        const freq = noteToFreq(note);
        if(!freq||isNaN(freq)) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = id==='organ'?'square':id==='coro'?'sawtooth':'sine';
        const t = ctx.currentTime+i*dur;
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
    document.getElementById('input-'+id).style.display =
        mode==='manual'?'block':'none';
}

function toggleLock(id) {
    staffStates[id].locked = !staffStates[id].locked;
    setStatus(staffStates[id].locked?'🔒 '+id+' locked':'🔓 '+id+' unlocked');
}

function updateManual(id) {
    if(staffStates[id].locked) return;
    const val = document.getElementById('input-'+id).value;
    currentNotes[id] = val.trim().split(/\s+/);
    document.getElementById('notes-'+id).textContent = val;
}

function genOrgan(notes) {
    const r=[];
    for(const n of notes) {
        r.push(n);
        const base=n.slice(0,-1);
        const oct=parseInt(n.slice(-1));
        if(!isNaN(oct)) r.push(base+Math.max(1,oct-1));
    }
    return r;
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
