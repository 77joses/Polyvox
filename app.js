// ============================================================
// POLYVOX - Stage 1: Score Foundation (Fixed)
// ============================================================

const STAFF_LINE_COUNT = 5;
const STAFF_LINE_SPACING = 12;
const STAFF_HEIGHT = STAFF_LINE_SPACING * 4;
const STAFF_MARGIN_TOP = 40;
const STAFF_MARGIN_LEFT = 70;
const BAR_WIDTH = 200;
const NOTE_HEAD_RADIUS = 5;
const STEM_HEIGHT = 35;
const BARS_PER_LINE = 4;
const CLEF_WIDTH = 35;
const TIMESIG_WIDTH = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

let keyIndex = 0;
let timeSig = '4/4';
let bpm = 120;
let totalBars = 8;
let selectedDur = 'whole';
let isDotted = false;
let isSharp = false;
let isFlat = false;
let isRest = false;
let isDeleteMode = false;
let isRecording = false;
let recordedUrl = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioCtx = null;
let analyser = null;
let mediaStream = null;
let recordedNotes = [];
let lastNote = null;
let noteHoldCount = 0;

const KEY_NAMES = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const KEY_SHARPS = [0,1,2,3,4,5,6,0,0,0,0,0];
const KEY_FLATS  = [0,0,0,0,0,0,0,6,5,4,3,1];

const TREBLE_PITCHES = [
    'E4','F4','G4','A4','B4','C5','D5','E5',
    'F5','G5','A5','B5','C6','D6','E6'
];
const BASS_PITCHES = [
    'G2','A2','B2','C3','D3','E3','F3','G3',
    'A3','B3','C4','D4','E4','F4','G4'
];

const STAVES = [
    {id:'voice',       label:'Voice', clef:'treble',
     pitches:TREBLE_PITCHES, editable:false},
    {id:'organTreble', label:'Organ', clef:'treble',
     pitches:TREBLE_PITCHES, editable:true},
    {id:'organBass',   label:'',      clef:'bass',
     pitches:BASS_PITCHES,   editable:true},
    {id:'coro',        label:'Coro',  clef:'treble',
     pitches:TREBLE_PITCHES, editable:true},
    {id:'drums',       label:'Drums', clef:'perc',
     pitches:TREBLE_PITCHES, editable:true}
];

let scoreData = {
    voice:[], organTreble:[], organBass:[], coro:[], drums:[]
};

function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for(const [k,v] of Object.entries(attrs)) {
        el.setAttributeNS(null, k, String(v));
    }
    return el;
}

function svgText(content, attrs) {
    const el = document.createElementNS(SVG_NS, 'text');
    for(const [k,v] of Object.entries(attrs)) {
        el.setAttributeNS(null, k, String(v));
    }
    el.textContent = content;
    return el;
}

function getStaffSpacing() {
    return STAFF_HEIGHT + 60;
}

function getSystemHeight() {
    return STAVES.length * getStaffSpacing() + 20;
}

function getStaffY(staffIndex, systemY) {
    return systemY + staffIndex * getStaffSpacing();
}

function getLinesCount() {
    return Math.ceil(totalBars / BARS_PER_LINE);
}

function getTotalWidth() {
    return STAFF_MARGIN_LEFT + BARS_PER_LINE * BAR_WIDTH + 40;
}

function getTotalHeight() {
    return getLinesCount() * (getSystemHeight() + 60) + 80;
}

function getHeaderWidth(isFirstLine) {
    let w = CLEF_WIDTH + 8;
    if(isFirstLine) w += TIMESIG_WIDTH + 8;
    return w;
}

function drawScore() {
    const svg = document.getElementById('scoreSvg');
    if(!svg) return;
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const W = getTotalWidth();
    const H = getTotalHeight();
    svg.setAttributeNS(null, 'width', W);
    svg.setAttributeNS(null, 'height', H);

    // White background
    svg.appendChild(svgEl('rect', {
        x:0, y:0, width:W, height:H, fill:'#f5f0e8'
    }));

    const lines = getLinesCount();
    for(let line = 0; line < lines; line++) {
        const systemY = 40 + line * (getSystemHeight() + 60);
        const startBar = line * BARS_PER_LINE;
        const endBar = Math.min(startBar + BARS_PER_LINE, totalBars);
        const isFirstLine = line === 0;
        drawSystem(svg, systemY, startBar, endBar, isFirstLine);
    }

    attachClickListener(svg);
}

function drawSystem(svg, systemY, startBar, endBar, isFirstLine) {
    const barsInSystem = endBar - startBar;
    const headerW = getHeaderWidth(isFirstLine);
    const systemW = STAFF_MARGIN_LEFT + headerW +
        barsInSystem * BAR_WIDTH + 10;

    STAVES.forEach((staff, si) => {
        const staffY = getStaffY(si, systemY);
        drawOneStaff(svg, staff, si, staffY,
            systemW, startBar, endBar, isFirstLine);
    });

    // System bracket
    const topY = getStaffY(0, systemY);
    const botY = getStaffY(STAVES.length-1, systemY) + STAFF_HEIGHT;
    svg.appendChild(svgEl('line', {
        x1:STAFF_MARGIN_LEFT, y1:topY,
        x2:STAFF_MARGIN_LEFT, y2:botY,
        stroke:'#000', 'stroke-width':2
    }));

    // Organ brace
    const orgTop = getStaffY(1, systemY);
    const orgBot = getStaffY(2, systemY) + STAFF_HEIGHT;
    const braceEl = svgText('{', {
        x: STAFF_MARGIN_LEFT - 14,
        y: orgTop + (orgBot - orgTop)/2 + 8,
        'font-size': (orgBot - orgTop) + 10,
        'font-family': 'serif',
        fill: '#000'
    });
    svg.appendChild(braceEl);
}

function drawOneStaff(svg, staff, si, staffY,
        systemW, startBar, endBar, isFirstLine) {

    // 5 staff lines
    for(let l = 0; l < 5; l++) {
        const ly = staffY + l * STAFF_LINE_SPACING;
        svg.appendChild(svgEl('line', {
            x1:STAFF_MARGIN_LEFT, y1:ly,
            x2:systemW, y2:ly,
            stroke:'#000', 'stroke-width':0.9
        }));
    }

    // Label
    if(staff.label) {
        svg.appendChild(svgText(staff.label, {
            x:4, y:staffY + STAFF_HEIGHT/2 + 4,
            'font-size':12, 'font-family':'serif', fill:'#333'
        }));
    }

    let x = STAFF_MARGIN_LEFT + 4;

    // Clef
    if(staff.clef === 'treble') {
        svg.appendChild(svgText('𝄞', {
            x:x, y:staffY + STAFF_HEIGHT + 2,
            'font-size':46, 'font-family':'serif', fill:'#000'
        }));
    } else if(staff.clef === 'bass') {
        svg.appendChild(svgText('𝄢', {
            x:x, y:staffY + STAFF_HEIGHT - 4,
            'font-size':30, 'font-family':'serif', fill:'#000'
        }));
    } else {
        svg.appendChild(svgEl('rect', {
            x:x+2, y:staffY+3, width:4,
            height:STAFF_HEIGHT-6, fill:'#000'
        }));
        svg.appendChild(svgEl('rect', {
            x:x+10, y:staffY+3, width:4,
            height:STAFF_HEIGHT-6, fill:'#000'
        }));
    }
    x += CLEF_WIDTH;

    // Time signature (first line only)
    if(isFirstLine) {
        const parts = timeSig.split('/');
        svg.appendChild(svgText(parts[0], {
            x:x+2, y:staffY + STAFF_LINE_SPACING*2,
            'font-size':18, 'font-weight':'bold',
            'font-family':'serif', fill:'#000'
        }));
        svg.appendChild(svgText(parts[1], {
            x:x+2, y:staffY + STAFF_HEIGHT,
            'font-size':18, 'font-weight':'bold',
            'font-family':'serif', fill:'#000'
        }));
        x += TIMESIG_WIDTH + 8;
    }

    // Bars
    let barX = STAFF_MARGIN_LEFT + getHeaderWidth(isFirstLine);
    for(let b = startBar; b < endBar; b++) {
        const barEndX = barX + BAR_WIDTH;

        // Bar number above top staff
        if(si === 0) {
            svg.appendChild(svgText(String(b+1), {
                x:barX+4, y:staffY-6,
                'font-size':9, fill:'#888',
                'font-family':'sans-serif'
            }));
        }

        // Bar line
        svg.appendChild(svgEl('line', {
            x1:barEndX, y1:staffY,
            x2:barEndX, y2:staffY+STAFF_HEIGHT,
            stroke:'#000', 'stroke-width':0.9
        }));

        // Notes
        const notes = (scoreData[staff.id]||[])
            .filter(n => n.bar === b);
        notes.forEach(note => {
            drawNoteEl(svg, note, staff, barX, staffY);
        });

        barX += BAR_WIDTH;
    }

    // Final double bar
    if(endBar === totalBars) {
        svg.appendChild(svgEl('line', {
            x1:barX, y1:staffY,
            x2:barX, y2:staffY+STAFF_HEIGHT,
            stroke:'#000', 'stroke-width':3
        }));
        svg.appendChild(svgEl('line', {
            x1:barX-5, y1:staffY,
            x2:barX-5, y2:staffY+STAFF_HEIGHT,
            stroke:'#000', 'stroke-width':1
        }));
    }
}

function drawNoteEl(svg, note, staff, barX, staffY) {
    const nx = barX + note.beatX;
    const ny = staffY + STAFF_HEIGHT -
        (note.pitchIndex * STAFF_LINE_SPACING / 2);

    const g = svgEl('g', {'data-id':note.id, 'data-staff':staff.id});

    if(note.isRest) {
        g.appendChild(svgText('𝄽', {
            x:nx, y:ny, 'font-size':18,
            fill:'#000', 'font-family':'serif'
        }));
    } else {
        const filled = note.duration !== 'whole' &&
            note.duration !== 'half';
        g.appendChild(svgEl('ellipse', {
            cx:nx, cy:ny,
            rx:NOTE_HEAD_RADIUS, ry:NOTE_HEAD_RADIUS*0.75,
            fill: filled ? '#000' : 'none',
            stroke:'#000', 'stroke-width':1.2,
            transform:`rotate(-15,${nx},${ny})`
        }));

        if(note.duration !== 'whole') {
            const up = note.pitchIndex < 6;
            const sx = up ? nx+NOTE_HEAD_RADIUS-1 :
                nx-NOTE_HEAD_RADIUS+1;
            const sy2 = up ? ny-STEM_HEIGHT : ny+STEM_HEIGHT;
            g.appendChild(svgEl('line', {
                x1:sx, y1:ny, x2:sx, y2:sy2,
                stroke:'#000', 'stroke-width':1.2
            }));
            if(note.duration === 'eighth' ||
               note.duration === 'sixteenth') {
                const d = up ? 1 : -1;
                g.appendChild(svgEl('path', {
                    d:`M${sx},${sy2} C${sx+12},${sy2+d*10} ${sx+8},${sy2+d*22} ${sx+2},${sy2+d*28}`,
                    fill:'none', stroke:'#000', 'stroke-width':1.2
                }));
            }
        }

        if(note.accidental === 'sharp') {
            g.appendChild(svgText('♯', {
                x:nx-12, y:ny+4,
                'font-size':11, fill:'#000',
                'font-family':'serif'
            }));
        } else if(note.accidental === 'flat') {
            g.appendChild(svgText('♭', {
                x:nx-12, y:ny+4,
                'font-size':11, fill:'#000',
                'font-family':'serif'
            }));
        }

        if(note.dotted) {
            g.appendChild(svgEl('circle', {
                cx:nx+NOTE_HEAD_RADIUS+5, cy:ny-2,
                r:2, fill:'#000'
            }));
        }

        // Ledger lines
        if(ny < staffY) {
            for(let ly=staffY-STAFF_LINE_SPACING;
                ly>=ny-2; ly-=STAFF_LINE_SPACING) {
                g.appendChild(svgEl('line', {
                    x1:nx-9, y1:ly, x2:nx+9, y2:ly,
                    stroke:'#000', 'stroke-width':0.9
                }));
            }
        }
        if(ny > staffY+STAFF_HEIGHT) {
            for(let ly=staffY+STAFF_HEIGHT+STAFF_LINE_SPACING;
                ly<=ny+2; ly+=STAFF_LINE_SPACING) {
                g.appendChild(svgEl('line', {
                    x1:nx-9, y1:ly, x2:nx+9, y2:ly,
                    stroke:'#000', 'stroke-width':0.9
                }));
            }
        }
    }

    if(staff.editable) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', e => {
            e.stopPropagation();
            if(isDeleteMode) {
                deleteNote(staff.id, note.id);
            }
        });
    }

    svg.appendChild(g);
}

function attachClickListener(svg) {
    svg.addEventListener('click', e => {
        const wrapper = document.getElementById('scoreWrapper');
        const rect = wrapper.getBoundingClientRect();
        const svgX = e.clientX - rect.left + wrapper.scrollLeft;
        const svgY = e.clientY - rect.top + wrapper.scrollTop;
        handleScoreClick(svgX, svgY);
    });
}

function handleScoreClick(svgX, svgY) {
    const lines = getLinesCount();
    for(let line = 0; line < lines; line++) {
        const systemY = 40 + line * (getSystemHeight() + 60);
        const startBar = line * BARS_PER_LINE;
        const endBar = Math.min(startBar + BARS_PER_LINE, totalBars);
        const isFirstLine = line === 0;
        const headerW = getHeaderWidth(isFirstLine);

        STAVES.forEach((staff, si) => {
            if(!staff.editable) return;
            const staffY = getStaffY(si, systemY);
            if(svgY < staffY - 25 ||
               svgY > staffY + STAFF_HEIGHT + 25) return;

            let barX = STAFF_MARGIN_LEFT + headerW;
            for(let b = startBar; b < endBar; b++) {
                if(svgX >= barX && svgX < barX + BAR_WIDTH) {
                    const pitchIndex = Math.round(
                        (staffY + STAFF_HEIGHT - svgY) /
                        (STAFF_LINE_SPACING / 2)
                    );
                    const beatX = svgX - barX;
                    addNote(staff.id, b,
                        Math.max(0, Math.min(14, pitchIndex)),
                        beatX);
                    return;
                }
                barX += BAR_WIDTH;
            }
        });
    }
}

function addNote(staffId, bar, pitchIndex, beatX) {
    if(!scoreData[staffId]) scoreData[staffId] = [];
    const note = {
        id: Date.now() + Math.random(),
        bar, pitchIndex, beatX,
        duration: selectedDur,
        dotted: isDotted,
        accidental: isSharp?'sharp':isFlat?'flat':null,
        isRest
    };
    scoreData[staffId].push(note);
    saveScore();
    drawScore();
    const staff = STAVES.find(s=>s.id===staffId);
    const pitch = staff ?
        staff.pitches[pitchIndex] || '?' : '?';
    setStatus(`Added ${selectedDur} — ${pitch} — bar ${bar+1}`);
}

function deleteNote(staffId, noteId) {
    scoreData[staffId] = (scoreData[staffId]||[])
        .filter(n => n.id !== noteId);
    saveScore();
    drawScore();
    setStatus('Note deleted');
}

function saveScore() {
    try {
        localStorage.setItem('polyvox_score',
            JSON.stringify(scoreData));
    } catch(e) {}
}

function loadScore() {
    try {
        const s = localStorage.getItem('polyvox_score');
        if(s) scoreData = JSON.parse(s);
    } catch(e) {}
}

// --- Recording ---
document.getElementById('btnRecord')
    .addEventListener('click', startRecording);
document.getElementById('btnStop')
    .addEventListener('click', stopRecording);
document.getElementById('btnPlay')
    .addEventListener('click', () => {
        if(recordedUrl) new Audio(recordedUrl).play();
    });

async function startRecording() {
    try {
        mediaStream = await navigator.mediaDevices
            .getUserMedia({audio:{
                echoCancellation:true,
                noiseSuppression:true
            }});
        audioCtx = new AudioContext({sampleRate:44100});
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 8192;
        audioCtx.createMediaStreamSource(mediaStream)
            .connect(analyser);
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = e => {
            if(e.data.size>0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks,
                {type:'audio/webm'});
            recordedUrl = URL.createObjectURL(blob);
            document.getElementById('btnPlay').disabled = false;
            placeVoiceNotes();
        };
        mediaRecorder.start();
        recordedNotes = [];
        lastNote = null;
        noteHoldCount = 0;
        isRecording = true;
        document.getElementById('btnRecord').disabled = true;
        document.getElementById('btnStop').disabled = false;
        setStatus('🔴 Recording... sing clearly!');
        detectPitchLoop();
    } catch(e) {
        setStatus('Mic error: ' + e.message);
    }
}

function stopRecording() {
    isRecording = false;
    if(mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if(mediaStream) mediaStream.getTracks()
        .forEach(t=>t.stop());
    if(audioCtx) audioCtx.close();
    document.getElementById('btnRecord').disabled = false;
    document.getElementById('btnStop').disabled = true;
    setStatus('✅ ' + recordedNotes.length + ' notes detected');
}

function detectPitchLoop() {
    if(!isRecording) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let rms = 0;
    for(let i=0;i<buf.length;i++) rms += buf[i]*buf[i];
    rms = Math.sqrt(rms/buf.length);
    if(rms > 0.001) {
        const pitch = autocorrelate(buf, 44100);
        if(pitch > 80 && pitch < 1200) {
            const note = freqToNote(pitch);
            if(note === lastNote) {
                noteHoldCount++;
            } else {
                if(lastNote && noteHoldCount >= 3) {
                    recordedNotes.push(lastNote);
                    setStatus('🔴 ' + recordedNotes.length
                        + ' notes');
                }
                lastNote = note;
                noteHoldCount = 1;
            }
        }
    }
    requestAnimationFrame(detectPitchLoop);
}

function autocorrelate(buffer, sr) {
    const SIZE = buffer.length;
    const MAX = Math.floor(SIZE/2);
    let best = -1, bestC = 0, found = false;
    const corrs = new Array(MAX);
    let rms = 0;
    for(let i=0;i<SIZE;i++) rms += buffer[i]*buffer[i];
    if(Math.sqrt(rms/SIZE) < 0.001) return -1;
    let last = 1, sum = 0;
    for(let tau=0;tau<MAX;tau++) {
        let s = 0;
        for(let i=0;i<MAX;i++) {
            s += Math.abs(buffer[i]-buffer[i+tau]);
        }
        sum += s;
        corrs[tau] = sum>0 ? s*tau/sum : 0;
        if(tau>0 && corrs[tau]<0.15 && corrs[tau]<last) {
            found = true;
            if(corrs[tau] > bestC) { bestC=corrs[tau]; best=tau; }
        } else if(found) {
            return sr/best;
        }
        last = corrs[tau];
    }
    return best>0 ? sr/best : -1;
}

function freqToNote(freq) {
    if(freq<=0) return null;
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const midi = Math.round(12*Math.log2(freq/440)+69);
    return n[midi%12]+(Math.floor(midi/12)-1);
}

function placeVoiceNotes() {
    scoreData.voice = [];
    scoreData.organTreble = [];
    const beatsPerBar = parseInt(timeSig.split('/')[0]);
    const beatW = BAR_WIDTH / beatsPerBar;
    let bar = 0, beat = 0;

    recordedNotes.forEach(noteName => {
        const pi = TREBLE_PITCHES.indexOf(noteName);
        const pitchIndex = pi >= 0 ? pi : 4;
        const beatX = getHeaderWidth(bar===0) +
            beat * beatW + beatW/2;
        const noteObj = {
            id: Date.now() + Math.random(),
            bar, pitchIndex, beatX,
            duration:'quarter',
            dotted:false, accidental:null, isRest:false
        };
        scoreData.voice.push(noteObj);
        scoreData.organTreble.push({
            ...noteObj, id:Date.now()+Math.random()
        });
        beat++;
        if(beat >= beatsPerBar) {
            beat = 0; bar++;
            if(bar >= totalBars) totalBars++;
        }
    });

    saveScore();
    drawScore();
    setStatus('Score generated! Edit organ notes as needed.');
}

// --- Toolbar ---
document.getElementById('btnKeyUp')
    .addEventListener('click', () => {
        keyIndex = (keyIndex+1)%12;
        document.getElementById('keyDisplay').textContent =
            KEY_NAMES[keyIndex];
        drawScore();
    });

document.getElementById('btnKeyDown')
    .addEventListener('click', () => {
        keyIndex = ((keyIndex-1)+12)%12;
        document.getElementById('keyDisplay').textContent =
            KEY_NAMES[keyIndex];
        drawScore();
    });

document.getElementById('timeSig')
    .addEventListener('change', e => {
        timeSig = e.target.value;
        drawScore();
    });

document.getElementById('btnAddBar')
    .addEventListener('click', () => {
        totalBars += 4;
        drawScore();
        setStatus('Added 4 bars');
    });

document.getElementById('btnPrint')
    .addEventListener('click', () => window.print());

// Tap tempo
let tapTimes = [];
document.getElementById('btnTapTempo')
    .addEventListener('click', () => {
        const now = Date.now();
        tapTimes.push(now);
        if(tapTimes.length > 8) tapTimes.shift();
        if(tapTimes.length > 1) {
            const avg = tapTimes.slice(1).reduce((s,t,i) =>
                s + (t - tapTimes[i]), 0) / (tapTimes.length-1);
            bpm = Math.round(60000/avg);
            document.getElementById('bpmDisplay')
                .textContent = bpm;
        }
    });

// Note palette
document.querySelectorAll('[data-dur]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dur]')
            .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDur = btn.dataset.dur;
        isRest = false;
        document.getElementById('btnRest')
            .classList.remove('active');
        setStatus('Selected: ' + selectedDur + ' note');
    });
});

document.getElementById('btnDot')
    .addEventListener('click', () => {
        isDotted = !isDotted;
        document.getElementById('btnDot')
            .classList.toggle('active', isDotted);
    });

document.getElementById('btnSharp')
    .addEventListener('click', () => {
        isSharp = !isSharp; isFlat = false;
        document.getElementById('btnSharp')
            .classList.toggle('active', isSharp);
        document.getElementById('btnFlat')
            .classList.remove('active');
    });

document.getElementById('btnFlat')
    .addEventListener('click', () => {
        isFlat = !isFlat; isSharp = false;
        document.getElementById('btnFlat')
            .classList.toggle('active', isFlat);
        document.getElementById('btnSharp')
            .classList.remove('active');
    });

document.getElementById('btnRest')
    .addEventListener('click', () => {
        isRest = !isRest;
        document.getElementById('btnRest')
            .classList.toggle('active', isRest);
    });

document.getElementById('btnDelete')
    .addEventListener('click', () => {
        isDeleteMode = !isDeleteMode;
        document.getElementById('btnDelete')
            .classList.toggle('active', isDeleteMode);
        setStatus(isDeleteMode ?
            '🗑 Tap a note to delete it' :
            'Delete mode off');
    });

// Print styles
const ps = document.createElement('style');
ps.textContent = `
@media print {
    #header,#toolbar,#notePanel,#status {display:none!important;}
    #scoreWrapper {overflow:visible!important;padding:0!important;}
    body {background:white!important;}
}`;
document.head.appendChild(ps);

function setStatus(msg) {
    const el = document.getElementById('status');
    if(el) el.textContent = msg;
}

// --- Init ---
loadScore();
drawScore();
setStatus('Ready — record voice or tap staff to add notes');

if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
