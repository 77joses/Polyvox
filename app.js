const SAMPLE_RATE = 44100;
let audioContext, analyser, mediaStream;
let isRecording = false;
let recordedPitches = [];
let currentNotes = {};
let staffStates = {
    vocal: { mode: 'auto', locked: false },
    organ: { mode: 'auto', locked: false },
    guitar: { mode: 'auto', locked: false },
    drums: { mode: 'auto', locked: false },
    coro: { mode: 'auto', locked: false }
};

const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const btnGenerate = document.getElementById('btnGenerate');
const status = document.getElementById('status');
const staffContainer = document.getElementById('staffContainer');

btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnGenerate.addEventListener('click', generateScore);

async function startRecording() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);
        recordedPitches = [];
        isRecording = true;
        btnRecord.disabled = true;
        btnStop.disabled = false;
        btnGenerate.disabled = true;
        status.textContent = '🔴 Recording...';
        detectPitchLoop();
    } catch (e) {
        status.textContent = 'Microphone access denied!';
    }
}

function stopRecording() {
    isRecording = false;
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    btnRecord.disabled = false;
    btnStop.disabled = true;
    btnGenerate.disabled = false;
    status.textContent = `✅ Recorded ${recordedPitches.length} pitches`;
}

function detectPitchLoop() {
    if (!isRecording) return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const pitch = yin(buffer, SAMPLE_RATE);
    if (pitch > 80 && pitch < 1200) {
        recordedPitches.push(pitch);
    }
    requestAnimationFrame(detectPitchLoop);
}

function yin(buffer, sampleRate) {
    const threshold = 0.15;
    const halfLen = Math.floor(buffer.length / 2);
    const yinBuf = new Float32Array(halfLen);
    yinBuf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfLen; tau++) {
        let sum = 0;
        for (let i = 0; i < halfLen; i++) {
            const delta = buffer[i] - buffer[i + tau];
            sum += delta * delta;
        }
        runningSum += sum;
        yinBuf[tau] = sum * tau / runningSum;
    }
    for (let tau = 2; tau < halfLen; tau++) {
        if (yinBuf[tau] < threshold) {
            while (tau + 1 < halfLen && yinBuf[tau + 1] < yinBuf[tau]) tau++;
            return sampleRate / tau;
        }
    }
    return -1;
}

function freqToNote(freq) {
    if (freq <= 0) return null;
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    const octave = Math.floor(midi / 12) - 1;
    return notes[midi % 12] + octave;
}

function noteToFreq(note) {
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const name = note.slice(0, -1);
    const oct = parseInt(note.slice(-1));
    const midi = notes.indexOf(name) + (oct + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function generateScore() {
    if (recordedPitches.length === 0) {
        status.textContent = '⚠️ No pitches detected. Record first!';
        return;
    }
    const notes = [];
    for (const p of recordedPitches) {
        const n = freqToNote(p);
        if (n && (notes.length === 0 || notes[notes.length-1] !== n)) {
            notes.push(n);
        }
    }
    currentNotes = {
        vocal: notes,
        organ: genOrgan(notes),
        guitar: genGuitar(notes),
        drums: genDrums(notes.length),
        coro: genCoro(notes)
    };
    renderStaffs();
    status.textContent = '🎼 Score generated!';
}

function renderStaffs() {
    staffContainer.innerHTML = '';
    const staffs = [
        { id: 'vocal', label: '🎤 Vocal', color: '#F9A825' },
        { id: 'organ', label: '🎹 Organ', color: '#4CAF50' },
        { id: 'guitar', label: '🎸 Guitar', color: '#2196F3' },
        { id: 'drums', label: '🥁 Drums', color: '#F44336' },
        { id: 'coro', label: '🎺 Coro', color: '#9C27B0' }
    ];

    // Add master play button
    const playAll = document.createElement('button');
    playAll.className = 'btn';
    playAll.style.background = '#F9A825';
    playAll.style.color = 'black';
    playAll.style.marginBottom = '12px';
    playAll.textContent = '▶ Play All Instruments';
    playAll.onclick = playAllInstruments;
    staffContainer.appendChild(playAll);

    for (const s of staffs) {
        staffContainer.appendChild(createStaff(s));
    }
}

function createStaff(s) {
    const notes = currentNotes[s.id] || [];
    const div = document.createElement('div');
    div.className = 'staff';
    div.innerHTML = `
        <div class="staff-header">
            <span class="staff-label" style="color:${s.color}">${s.label}</span>
            <div class="staff-controls">
                <button class="btn-play" onclick="playStaff('${s.id}')">▶</button>
                <button class="btn-auto" onclick="setMode('${s.id}','auto')">Auto</button>
                <button class="btn-manual" onclick="setMode('${s.id}','manual')">✏️</button>
                <button class="btn-lock" onclick="toggleLock('${s.id}')">🔒</button>
            </div>
        </div>
        <div class="notes" id="notes-${s.id}">${notes.join(' ')}</div>
        <textarea class="manual-input" id="input-${s.id}"
            placeholder="Type notes e.g. C4 D4 E4 F4"
            onchange="updateManual('${s.id}')"></textarea>
    `;
    return div;
}

function playStaff(id) {
    const notes = currentNotes[id];
    if (!notes || notes.length === 0) return;
    const ctx = new AudioContext();
    const noteDuration = 0.3;
    notes.forEach((note, i) => {
        if (note === '—' || note === 'Kick' ||
            note === 'Snare' || note === 'Hi-hat') {
            playDrumHit(ctx, note, i * noteDuration);
            return;
        }
        const freq = noteToFreq(note);
        if (!freq || isNaN(freq)) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = id === 'organ' ? 'square' :
                   id === 'coro' ? 'sawtooth' : 'sine';
        const start = ctx.currentTime + i * noteDuration;
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
        osc.start(start);
        osc.stop(start + noteDuration);
    });
}

function playDrumHit(ctx, type, time) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) *
            Math.pow(1 - i / data.length, 3);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = type === 'Kick' ? 0.8 :
                      type === 'Snare' ? 0.5 : 0.3;
    src.start(ctx.currentTime + time);
}

function playAllInstruments() {
    const ids = ['vocal','organ','guitar','drums','coro'];
    const ctx = new AudioContext();
    const noteDuration = 0.3;
    for (const id of ids) {
        const notes = currentNotes[id];
        if (!notes) continue;
        notes.forEach((note, i) => {
            if (note === '—' || note === 'Kick' ||
                note === 'Snare' || note === 'Hi-hat') {
                playDrumHit(ctx, note, i * noteDuration);
                return;
            }
            const freq = noteToFreq(note);
            if (!freq || isNaN(freq)) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = id === 'organ' ? 'square' :
                       id === 'coro' ? 'sawtooth' : 'sine';
            const start = ctx.currentTime + i * noteDuration;
            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001,
                start + noteDuration);
            osc.start(start);
            osc.stop(start + noteDuration);
        });
    }
}

function setMode(id, mode) {
    staffStates[id].mode = mode;
    const input = document.getElementById('input-' + id);
    input.style.display = mode === 'manual' ? 'block' : 'none';
}

function toggleLock(id) {
    staffStates[id].locked = !staffStates[id].locked;
    status.textContent = staffStates[id].locked ?
        `🔒 ${id} locked` : `🔓 ${id} unlocked`;
}

function updateManual(id) {
    if (staffStates[id].locked) return;
    const val = document.getElementById('input-' + id).value;
    currentNotes[id] = val.trim().split(/\s+/);
    document.getElementById('notes-' + id).textContent = val;
}

function genOrgan(notes) {
    const result = [];
    for (const n of notes) {
        result.push(n);
        const base = n.slice(0, -1);
        const oct = parseInt(n.slice(-1));
        if (!isNaN(oct)) result.push(base + Math.max(1, oct - 1));
    }
    return result;
}

function genGuitar(notes) {
    const chords = ['C','G','Am','F','Dm','Em'];
    return notes.map((_, i) => chords[i % chords.length]);
}

function genDrums(len) {
    const pattern = ['Kick','Snare','Hi-hat','Snare'];
    return Array.from({length: len}, (_, i) => pattern[i % pattern.length]);
}

function genCoro(notes) {
    return notes.map((n, i) => i % 2 === 0 ? n : '—');
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
