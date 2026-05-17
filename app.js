// ============================================================
// POLYVOX - Stage 1: Score Foundation
// ============================================================

// --- Constants ---
const STAFF_LINE_COUNT = 5;
const STAFF_LINE_SPACING = 10; // px between lines
const STAFF_HEIGHT = STAFF_LINE_SPACING * 4;
const STAFF_MARGIN_TOP = 40;
const STAFF_MARGIN_LEFT = 60;
const BAR_WIDTH = 180;
const SYSTEM_PADDING = 30;
const BRACE_WIDTH = 12;
const CLEF_WIDTH = 30;
const KEYSIG_WIDTH = 20;
const TIMESIG_WIDTH = 20;
const NOTE_HEAD_RADIUS = 4.5;
const STEM_HEIGHT = 35;
const BARS_PER_LINE = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

// --- State ---
let keyIndex = 0; // 0=C, 1=G, 2=D... -1=F, -2=Bb...
let timeSig = '4/4';
let bpm = 120;
let totalBars = 8;
let selectedDur = 'quarter';
let isDotted = false;
let isSharp = false;
let isFlat = false;
let isRest = false;
let isRecording = false;
let recordedUrl = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let analyser = null;
let mediaStream = null;
let recordedNotes = [];
let lastNote = null;
let noteHoldCount = 0;
let recordingStartTime = 0;

// Score data — one array per staff
let scoreData = {
    voice: [],
    organTreble: [],
    organBass: [],
    coro: [],
    drums: []
};

// Key names
const KEY_NAMES = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const KEY_SHARPS = [0,1,2,3,4,5,6,0,0,0,0,0];
const KEY_FLATS  = [0,0,0,0,0,0,0,6,5,4,3,1];

// Treble clef pitch names per line/space (bottom to top)
// Line 0 = bottom line (E4), Space 0 = F4, etc.
const TREBLE_PITCHES = [
    'E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5','C6'
];
const BASS_PITCHES = [
    'G2','A2','B2','C3','D3','E3','F3','G3','A3','B3','C4','D4','E4'
];

// Staff definitions
const STAVES = [
    {id:'voice',     label:'Voice',  clef:'treble', pitches:TREBLE_PITCHES, color:'#000', editable:false},
    {id:'organTreble',label:'Organ', clef:'treble', pitches:TREBLE_PITCHES, color:'#000', editable:true, brace:'organ'},
    {id:'organBass', label:'',       clef:'bass',   pitches:BASS_PITCHES,   color:'#000', editable:true, brace:'organ'},
    {id:'coro',      label:'Coro',   clef:'treble', pitches:TREBLE_PITCHES, color:'#000', editable:true},
    {id:'drums',     label:'Drums',  clef:'perc',   pitches:TREBLE_PITCHES, color:'#000', editable:true}
];

// --- SVG Helper ---
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for(const [k,v] of Object.entries(attrs)) {
        el.setAttributeNS(null, k, v);
    }
    return el;
}

function svgText(content, attrs) {
    const el = svgEl('text', attrs);
    el.textContent = content;
    return el;
}

// --- Layout Calculations ---
function getSystemHeight() {
    // voice + organ(treble+bass) + coro + drums + spacing
    return STAVES.length * (STAFF_HEIGHT + 50) + 20;
}

function getStaffY(staffIndex, systemY) {
    let y = systemY;
    for(let i = 0; i < staffIndex; i++) {
        y += STAFF_HEIGHT + 50;
        if(STAVES[i].brace === 'organ' && STAVES[i+1] &&
           STAVES[i+1].brace === 'organ') {
            y -= 20;
        }
    }
    return y;
}

function getLinesPerSystem() {
    return Math.ceil(totalBars / BARS_PER_LINE);
}

function getTotalWidth() {
    return STAFF_MARGIN_LEFT + BARS_PER_LINE * BAR_WIDTH + 40;
}

function getTotalHeight() {
    return getLinesPerSystem() * (getSystemHeight() + 40) + 60;
}

// --- Draw Score ---
function drawScore() {
    const svg = document.getElementById('scoreSvg');
    svg.innerHTML = '';

    const W = getTotalWidth();
    const H = getTotalHeight();
    svg.setAttributeNS(null, 'width', W);
    svg.setAttributeNS(null, 'height', H);
    svg.setAttributeNS(null, 'viewBox', `0 0 ${W} ${H}`);
    svg.style.background = '#f5f0e8';

    const lines = getLinesPerSystem();

    for(let line = 0; line < lines; line++) {
        const systemY = 40 + line * (getSystemHeight() + 40);
        drawSystem(svg, line, systemY, W);
    }

    // Attach touch/click listeners
    attachNoteInputListeners(svg);
}

function drawSystem(svg, lineIndex, systemY, W) {
    const startBar = lineIndex * BARS_PER_LINE;
    const endBar = Math.min(startBar + BARS_PER_LINE, totalBars);
    const barsInSystem = endBar - startBar;
    const systemWidth = STAFF_MARGIN_LEFT +
        barsInSystem * BAR_WIDTH + 10;

    STAVES.forEach((staff, si) => {
        const staffY = getStaffY(si, systemY);
        drawStaff(svg, staff, si, staffY,
            systemWidth, startBar, endBar, lineIndex === 0);
    });

    // Draw brace for organ
    drawBrace(svg, systemY);

    // Draw system bar line at left
    const topY = getStaffY(0, systemY);
    const bottomY = getStaffY(STAVES.length-1, systemY) + STAFF_HEIGHT;
    svg.appendChild(svgEl('line', {
        x1: STAFF_MARGIN_LEFT,
        y1: topY,
        x2: STAFF_MARGIN_LEFT,
        y2: bottomY,
        stroke: '#000',
        'stroke-width': 1.5
    }));
}

function drawStaff(svg, staff, staffIndex, staffY,
    systemWidth, startBar, endBar, isFirst) {

    // Draw 5 staff lines
    for(let l = 0; l < STAFF_LINE_COUNT; l++) {
        const y = staffY + l * STAFF_LINE_SPACING;
        svg.appendChild(svgEl('line', {
            x1: STAFF_MARGIN_LEFT,
            y1: y,
            x2: systemWidth,
            y2: y,
            stroke: '#000',
            'stroke-width': 0.8
        }));
    }

    // Staff label
    if(staff.label) {
        svg.appendChild(svgText(staff.label, {
            x: 4,
            y: staffY + STAFF_HEIGHT/2 + 4,
            'font-size': 11,
            'font-family': 'serif',
            fill: '#333'
        }));
    }

    // Clef
    drawClef(svg, staff.clef, STAFF_MARGIN_LEFT + 4, staffY);

    // Key signature
    let xOffset = STAFF_MARGIN_LEFT + CLEF_WIDTH + 4;
    drawKeySignature(svg, staff.clef, xOffset, staffY);
    xOffset += getKeyWidth();

    // Time signature (first system only)
    if(isFirst) {
        drawTimeSig(svg, xOffset, staffY);
        xOffset += TIMESIG_WIDTH + 4;
    }

    // Bar lines and note areas
    let barX = STAFF_MARGIN_LEFT + getHeaderWidth(isFirst);
    for(let b = startBar; b < endBar; b++) {
        // Bar line at end
        const barEndX = barX + BAR_WIDTH;
        svg.appendChild(svgEl('line', {
            x1: barEndX,
            y1: staffY,
            x2: barEndX,
            y2: staffY + STAFF_HEIGHT,
            stroke: '#000',
            'stroke-width': 0.8
        }));

        // Bar number
        if(staffIndex === 0) {
            svg.appendChild(svgText((b+1).toString(), {
                x: barX + 4,
                y: staffY - 4,
                'font-size': 9,
                fill: '#888',
                'font-family': 'sans-serif'
            }));
        }

        // Draw notes in this bar
        drawBarNotes(svg, staff, b, barX, staffY);

        barX += BAR_WIDTH;
    }

    // Final double bar line at very end
    if(endBar === totalBars) {
        svg.appendChild(svgEl('line', {
            x1: barX,
            y1: staffY,
            x2: barX,
            y2: staffY + STAFF_HEIGHT,
            stroke: '#000',
            'stroke-width': 3
        }));
        svg.appendChild(svgEl('line', {
            x1: barX - 4,
            y1: staffY,
            x2: barX - 4,
            y2: staffY + STAFF_HEIGHT,
            stroke: '#000',
            'stroke-width': 1
        }));
    }
}

function getHeaderWidth(isFirst) {
    let w = CLEF_WIDTH + 4 + getKeyWidth();
    if(isFirst) w += TIMESIG_WIDTH + 8;
    return w;
}

function getKeyWidth() {
    const sharps = KEY_SHARPS[((keyIndex % 12) + 12) % 12];
    const flats = KEY_FLATS[((keyIndex % 12) + 12) % 12];
    const count = sharps + flats;
    return count > 0 ? count * 8 + 4 : 4;
}

function drawClef(svg, clef, x, staffY) {
    if(clef === 'treble') {
        const el = svgText('𝄞', {
            x: x,
            y: staffY + STAFF_HEIGHT - 2,
            'font-size': 42,
            'font-family': 'serif',
            fill: '#000'
        });
        svg.appendChild(el);
    } else if(clef === 'bass') {
        const el = svgText('𝄢', {
            x: x,
            y: staffY + STAFF_HEIGHT - 8,
            'font-size': 28,
            'font-family': 'serif',
            fill: '#000'
        });
        svg.appendChild(el);
    } else if(clef === 'perc') {
        svg.appendChild(svgEl('rect', {
            x: x + 2,
            y: staffY + 4,
            width: 4,
            height: STAFF_HEIGHT - 8,
            fill: '#000'
        }));
        svg.appendChild(svgEl('rect', {
            x: x + 10,
            y: staffY + 4,
            width: 4,
            height: STAFF_HEIGHT - 8,
            fill: '#000'
        }));
    }
}

function drawKeySignature(svg, clef, x, staffY) {
    const idx = ((keyIndex % 12) + 12) % 12;
    const sharps = KEY_SHARPS[idx];
    const flats = KEY_FLATS[idx];

    const sharpPositions = clef === 'treble' ?
        [0,3,−1,2,5,1,4] : [2,5,1,4,7,3,6];
    const flatPositions = clef === 'treble' ?
        [4,1,5,2,6,3,7] : [6,3,7,4,8,5,9];

    for(let i = 0; i < sharps; i++) {
        const pos = sharpPositions[i];
        const y = staffY + STAFF_HEIGHT -
            (pos * STAFF_LINE_SPACING / 2) - 6;
        svg.appendChild(svgText('♯', {
            x: x + i * 8,
            y: y,
            'font-size': 12,
            fill: '#000',
            'font-family': 'serif'
        }));
    }

    for(let i = 0; i < flats; i++) {
        const pos = flatPositions[i];
        const y = staffY + STAFF_HEIGHT -
            (pos * STAFF_LINE_SPACING / 2) - 2;
        svg.appendChild(svgText('♭', {
            x: x + i * 8,
            y: y,
            'font-size': 12,
            fill: '#000',
            'font-family': 'serif'
        }));
    }
}

function drawTimeSig(svg, x, staffY) {
    const parts = timeSig.split('/');
    svg.appendChild(svgText(parts[0], {
        x: x + 4,
        y: staffY + STAFF_LINE_SPACING * 2 - 1,
        'font-size': 16,
        'font-weight': 'bold',
        'font-family': 'serif',
        fill: '#000'
    }));
    svg.appendChild(svgText(parts[1], {
        x: x + 4,
        y: staffY + STAFF_HEIGHT - 1,
        'font-size': 16,
        'font-weight': 'bold',
        'font-family': 'serif',
        fill: '#000'
    }));
}

function drawBrace(svg, systemY) {
    const trebleY = getStaffY(1, systemY);
    const bassY = getStaffY(2, systemY);
    const topY = trebleY;
    const bottomY = bassY + STAFF_HEIGHT;
    const x = STAFF_MARGIN_LEFT - 12;

    svg.appendChild(svgText('{', {
        x: x - 8,
        y: topY + (bottomY - topY) / 2 + 10,
        'font-size': (bottomY - topY) * 1.2,
        'font-family': 'serif',
        fill: '#000'
    }));
}

function drawBarNotes(svg, staff, barIndex, barX, staffY) {
    const notes = (scoreData[staff.id] || [])
        .filter(n => n.bar === barIndex);

    notes.forEach(note => {
        drawNote(svg, note, staff, barX, staffY);
    });
}

function drawNote(svg, note, staff, barX, staffY) {
    const noteX = barX + note.beatX;
    const pitchIndex = note.pitchIndex;
    const noteY = staffY + STAFF_HEIGHT -
        (pitchIndex * STAFF_LINE_SPACING / 2);

    const g = svgEl('g', {
        'data-noteid': note.id,
        'data-staffid': staff.id,
        cursor: staff.editable ? 'pointer' : 'default'
    });

    if(note.isRest) {
        g.appendChild(svgText('𝄽', {
            x: noteX,
            y: noteY,
            'font-size': 16,
            fill: '#000',
            'font-family': 'serif'
        }));
    } else {
        const filled = note.duration !== 'whole' &&
            note.duration !== 'half';

        g.appendChild(svgEl('ellipse', {
            cx: noteX,
            cy: noteY,
            rx: NOTE_HEAD_RADIUS,
            ry: NOTE_HEAD_RADIUS * 0.75,
            fill: filled ? '#000' : 'none',
            stroke: '#000',
            'stroke-width': 1.2,
            transform: `rotate(-15,${noteX},${noteY})`
        }));

        if(note.duration !== 'whole') {
            const stemUp = pitchIndex < 6;
            const stemX = stemUp ?
                noteX + NOTE_HEAD_RADIUS - 1 :
                noteX - NOTE_HEAD_RADIUS + 1;
            const stemY1 = noteY;
            const stemY2 = stemUp ?
                noteY - STEM_HEIGHT : noteY + STEM_HEIGHT;
            g.appendChild(svgEl('line', {
                x1: stemX, y1: stemY1,
                x2: stemX, y2: stemY2,
                stroke: '#000',
                'stroke-width': 1.2
            }));

            if(note.duration === 'eighth') {
                const flagX = stemX;
                const flagY = stemY2;
                const dir = stemUp ? 1 : -1;
                g.appendChild(svgEl('path', {
                    d: `M${flagX},${flagY} C${flagX+12},${flagY+dir*8} ${flagX+10},${flagY+dir*20} ${flagX+2},${flagY+dir*25}`,
                    fill: 'none',
                    stroke: '#000',
                    'stroke-width': 1.2
                }));
            }
        }

        if(note.accidental) {
            g.appendChild(svgText(
                note.accidental === 'sharp' ? '♯' : '♭', {
                x: noteX - 10,
                y: noteY + 4,
                'font-size': 10,
                fill: '#000',
                'font-family': 'serif'
            }));
        }

        if(note.dotted) {
            g.appendChild(svgEl('circle', {
                cx: noteX + NOTE_HEAD_RADIUS + 4,
                cy: noteY - 2,
                r: 2,
                fill: '#000'
            }));
        }

        // Ledger lines
        drawLedgerLines(svg, noteX, noteY, staffY, pitchIndex);
    }

    if(staff.editable) {
        g.addEventListener('click', (e) => {
            e.stopPropagation();
            if(document.getElementById('btnDelete').classList.contains('active')) {
                deleteNote(staff.id, note.id);
            }
        });
    }

    svg.appendChild(g);
}

function drawLedgerLines(svg, noteX, noteY, staffY, pitchIndex) {
    const topLine = staffY;
    const bottomLine = staffY + STAFF_HEIGHT;

    if(noteY < topLine) {
        let ly = topLine - STAFF_LINE_SPACING;
        while(ly >= noteY - 2) {
            svg.appendChild(svgEl('line', {
                x1: noteX - 8, y1: ly,
                x2: noteX + 8, y2: ly,
                stroke: '#000',
                'stroke-width': 0.8
            }));
            ly -= STAFF_LINE_SPACING;
        }
    }

    if(noteY > bottomLine) {
        let ly = bottomLine + STAFF_LINE_SPACING;
        while(ly <= noteY + 2) {
            svg.appendChild(svgEl('line', {
                x1: noteX - 8, y1: ly,
                x2: noteX + 8, y2: ly,
                stroke: '#000',
                'stroke-width': 0.8
            }));
            ly += STAFF_LINE_SPACING;
        }
    }
}

// --- Note Input ---
function attachNoteInputListeners(svg) {
    svg.addEventListener('click', onScoreClick);
}

function onScoreClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scrollEl = document.getElementById('scoreWrapper');
    const scrollX = scrollEl.scrollLeft;
    const scrollY = scrollEl.scrollTop;
    const svgX = x + scrollX;
    const svgY = y + scrollY;
    placeNoteAtPosition(svgX, svgY);
}

function placeNoteAtPosition(svgX, svgY) {
    const lines = getLinesPerSystem();
    for(let line = 0; line < lines; line++) {
        const systemY = 40 + line * (getSystemHeight() + 40);
        const startBar = line * BARS_PER_LINE;
        const endBar = Math.min(startBar + BARS_PER_LINE, totalBars);

        STAVES.forEach((staff, si) => {
            if(!staff.editable) return;
            const staffY = getStaffY(si, systemY);
            const staffBottom = staffY + STAFF_HEIGHT + 20;
            const staffTop = staffY - 20;

            if(svgY < staffTop || svgY > staffBottom) return;

            const isFirst = line === 0;
            const headerW = getHeaderWidth(isFirst);
            const barAreaStart = STAFF_MARGIN_LEFT + headerW;

            for(let b = startBar; b < endBar; b++) {
                const barX = barAreaStart +
                    (b - startBar) * BAR_WIDTH;
                const barEndX = barX + BAR_WIDTH;

                if(svgX >= barX && svgX < barEndX) {
                    const pitchIndex = yToPitchIndex(svgY, staffY);
                    const beatX = svgX - barX;
                    addNote(staff.id, b, pitchIndex, beatX);
                    return;
                }
            }
        });
    }
}

function yToPitchIndex(y, staffY) {
    const relY = staffY + STAFF_HEIGHT - y;
    return Math.round(relY / (STAFF_LINE_SPACING / 2));
}

function addNote(staffId, bar, pitchIndex, beatX) {
    if(!scoreData[staffId]) scoreData[staffId] = [];
    const note = {
        id: Date.now() + Math.random(),
        bar: bar,
        pitchIndex: pitchIndex,
        beatX: beatX,
        duration: selectedDur,
        dotted: isDotted,
        accidental: isSharp ? 'sharp' : isFlat ? 'flat' : null,
        isRest: isRest
    };
    scoreData[staffId].push(note);
    saveScore();
    drawScore();
    setStatus(`Added ${selectedDur} note to ${staffId} bar ${bar+1}`);
}

function deleteNote(staffId, noteId) {
    scoreData[staffId] = scoreData[staffId]
        .filter(n => n.id !== noteId);
    saveScore();
    drawScore();
    setStatus('Note deleted');
}

// --- Persistence ---
function saveScore() {
    localStorage.setItem('polyvox_score',
        JSON.stringify(scoreData));
}

function loadScore() {
    const saved = localStorage.getItem('polyvox_score');
    if(saved) {
        try {
            scoreData = JSON.parse(saved);
        } catch(e) {}
    }
}

// --- Recording ---
document.getElementById('btnRecord').addEventListener('click', startRecording);
document.getElementById('btnStop').addEventListener('click', stopRecording);

async function startRecording() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio:{echoCancellation:true,noiseSuppression:true}
        });
        audioContext = new AudioContext({sampleRate:44100});
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192;
        audioContext.createMediaStreamSource(mediaStream)
            .connect(analyser);
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = e => {
            if(e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks,
                {type:'audio/webm'});
            recordedUrl = URL.createObjectURL(blob);
            document.getElementById('btnPlay').disabled = false;
        };
        mediaRecorder.start();
        recordedNotes = [];
        lastNote = null;
        noteHoldCount = 0;
        isRecording = true;
        recordingStartTime = performance.now();
        document.getElementById('btnRecord').disabled = true;
        document.getElementById('btnStop').disabled = false;
        setStatus('🔴 Recording...');
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
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
    if(audioContext) audioContext.close();
    document.getElementById('btnRecord').disabled = false;
    document.getElementById('btnStop').disabled = true;
    setStatus('✅ Recorded ' + recordedNotes.length + ' notes — tap Generate');
    placeVoiceNotes();
}

function detectPitchLoop() {
    if(!isRecording) return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let rms = 0;
    for(let i=0;i<buffer.length;i++) rms += buffer[i]*buffer[i];
    rms = Math.sqrt(rms/buffer.length);
    if(rms > 0.001) {
        const pitch = autocorrelate(buffer, 44100);
        if(pitch > 80 && pitch < 1200) {
            const note = freqToNote(pitch);
            if(note === lastNote) {
                noteHoldCount++;
            } else {
                if(lastNote && noteHoldCount >= 3) {
                    recordedNotes.push(lastNote);
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
            correlation += Math.abs(
                (buffer[i])-(buffer[i+offset]));
        }
        correlation = 1-(correlation/MAX_SAMPLES);
        correlations[offset] = correlation;
        if((correlation>0.9)&&(correlation>lastCorrelation)) {
            foundGoodCorrelation = true;
            if(correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        } else if(foundGoodCorrelation) {
            let shift = (correlations[bestOffset+1] -
                correlations[bestOffset-1]) /
                correlations[bestOffset];
            return sampleRate/(bestOffset+(8*shift));
        }
        lastCorrelation = correlation;
    }
    if(bestCorrelation > 0.01) return sampleRate/bestOffset;
    return -1;
}

function freqToNote(freq) {
    if(freq<=0) return null;
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const midi = Math.round(12*Math.log2(freq/440)+69);
    return n[midi%12] + (Math.floor(midi/12)-1);
}

function placeVoiceNotes() {
    scoreData.voice = [];
    const beatsPerBar = parseInt(timeSig.split('/')[0]);
    const beatWidth = BAR_WIDTH / beatsPerBar;
    let bar = 0;
    let beat = 0;

    recordedNotes.forEach(noteName => {
        const pitchIndex = noteToPitchIndex(
            noteName, TREBLE_PITCHES);
        scoreData.voice.push({
            id: Date.now() + Math.random(),
            bar: bar,
            pitchIndex: pitchIndex,
            beatX: getHeaderWidth(bar===0) +
                beat * beatWidth + beatWidth/2,
            duration: 'quarter',
            dotted: false,
            accidental: null,
            isRest: false
        });
        beat++;
        if(beat >= beatsPerBar) {
            beat = 0;
            bar++;
            if(bar >= totalBars) {
                totalBars++;
            }
        }
    });

    scoreData.organTreble = scoreData.voice.map(n => ({...n,
        id: Date.now() + Math.random()}));

    saveScore();
    drawScore();
    setStatus('Score generated! Edit organ notes as needed.');
}

function noteToPitchIndex(noteName, pitches) {
    const idx = pitches.indexOf(noteName);
    if(idx >= 0) return idx;
    return 4;
}

// --- Toolbar Controls ---
document.getElementById('btnKeyUp').addEventListener('click', () => {
    keyIndex = (keyIndex + 1) % 12;
    updateKeyDisplay();
    drawScore();
});

document.getElementById('btnKeyDown').addEventListener('click', () => {
    keyIndex = ((keyIndex - 1) + 12) % 12;
    updateKeyDisplay();
    drawScore();
});

function updateKeyDisplay() {
    document.getElementById('keyDisplay').textContent =
        KEY_NAMES[((keyIndex%12)+12)%12];
}

document.getElementById('timeSig').addEventListener('change', (e) => {
    timeSig = e.target.value;
    drawScore();
});

document.getElementById('btnAddBar').addEventListener('click', () => {
    totalBars += 4;
    drawScore();
    setStatus('Added 4 bars');
});

document.getElementById('btnPrint').addEventListener('click', () => {
    window.print();
});

// Tap tempo
let tapTimes = [];
document.getElementById('btnTapTempo').addEventListener('click', () => {
    const now = Date.now();
    tapTimes.push(now);
    if(tapTimes.length > 8) tapTimes.shift();
    if(tapTimes.length > 1) {
        const intervals = [];
        for(let i=1;i<tapTimes.length;i++) {
            intervals.push(tapTimes[i]-tapTimes[i-1]);
        }
        const avg = intervals.reduce((a,b)=>a+b,0)/intervals.length;
        bpm = Math.round(60000/avg);
        document.getElementById('bpmDisplay').textContent = bpm;
    }
});

// Note palette
document.querySelectorAll('[data-dur]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dur]').forEach(b =>
            b.classList.remove('active'));
        btn.classList.add('active');
        selectedDur = btn.dataset.dur;
        isRest = false;
        document.getElementById('btnRest')
            .classList.remove('active');
    });
});

document.getElementById('btnDot').addEventListener('click', () => {
    isDotted = !isDotted;
    document.getElementById('btnDot')
        .classList.toggle('active', isDotted);
});

document.getElementById('btnSharp').addEventListener('click', () => {
    isSharp = !isSharp;
    isFlat = false;
    document.getElementById('btnSharp')
        .classList.toggle('active', isSharp);
    document.getElementById('btnFlat')
        .classList.remove('active');
});

document.getElementById('btnFlat').addEventListener('click', () => {
    isFlat = !isFlat;
    isSharp = false;
    document.getElementById('btnFlat')
        .classList.toggle('active', isFlat);
    document.getElementById('btnSharp')
        .classList.remove('active');
});

document.getElementById('btnRest').addEventListener('click', () => {
    isRest = !isRest;
    document.getElementById('btnRest')
        .classList.toggle('active', isRest);
});

document.getElementById('btnDelete').addEventListener('click', () => {
    const btn = document.getElementById('btnDelete');
    btn.classList.toggle('active');
    setStatus(btn.classList.contains('active') ?
        '🗑 Delete mode — tap a note to delete' :
        'Delete mode off');
});

document.getElementById('btnPlay').addEventListener('click', () => {
    if(recordedUrl) {
        const audio = new Audio(recordedUrl);
        audio.play();
    }
});

// --- Print Styles ---
const printStyle = document.createElement('style');
printStyle.textContent = `
@media print {
    #header, #toolbar, #notePanel, #status { display: none !important; }
    #scoreWrapper {
        overflow: visible !important;
        background: white !important;
        padding: 0 !important;
    }
    body { background: white !important; }
}`;
document.head.appendChild(printStyle);

// --- Init ---
function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

loadScore();
drawScore();
setStatus('Ready — record your voice or tap staff to add notes');

if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
