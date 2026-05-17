// ============================================================
// POLYVOX SCORE EDITOR — STAGE 1
// Score foundation: staves, clefs, bars, note palette
// ============================================================

// --- State ---
const state = {
    key: 'C',
    timeSig: { top: 4, bottom: 4 },
    barsPerLine: 4,
    totalBars: 8,
    selectedDuration: 4,
    dotted: false,
    accidental: null,
    isRest: false,
    eraseMode: false,
    scores: {
        voice: [],
        organTreble: [],
        organBass: [],
        coro: [],
        drums: []
    }
};

// --- Layout Constants ---
const L = {
    leftMargin: 60,
    topMargin: 20,
    staffLineGap: 8,
    staffHeight: function() { return this.staffLineGap * 4; },
    barWidth: 160,
    clefWidth: 30,
    timeSigWidth: 20,
    keySigWidth: 10,
    instrumentGap: 40,
    grandStaffGap: 20,
    sectionGap: 60,
    noteRadius: 4.5,
};

// --- Instrument Definitions ---
const INSTRUMENTS = [
    {
        id: 'voice',
        label: 'Voice',
        clef: 'treble',
        staves: ['voice'],
        editable: false,
        color: '#F9A825'
    },
    {
        id: 'organ',
        label: 'Organ',
        clef: 'grand',
        staves: ['organTreble', 'organBass'],
        editable: true,
        color: '#4CAF50'
    },
    {
        id: 'coro',
        label: 'Coro',
        clef: 'treble',
        staves: ['coro'],
        editable: true,
        color: '#9C27B0'
    },
    {
        id: 'drums',
        label: 'Drums',
        clef: 'percussion',
        staves: ['drums'],
        editable: true,
        color: '#F44336'
    }
];

// --- Note name to staff position mapping (treble clef) ---
// Position 0 = top line (F5), increases downward
// Lines: F5(0), D5(2), B4(4), G4(6), E4(8)
// Spaces: E5(1), C5(3), A4(5), F4(7)
const TREBLE_MIDI_TO_POS = {};
function buildMidiPosMap() {
    // Middle C (C4) = MIDI 60
    // Treble clef: position relative to top staff line (F5 = MIDI 77)
    // Each position = half step in staff space
    for(let midi = 40; midi <= 96; midi++) {
        const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const name = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        // Staff position: F5 is position 0 (top line)
        // Each staff space = 2 semitones (roughly)
        // We use diatonic position
        const diatonicNotes = ['C','D','E','F','G','A','B'];
        const diatonicIndex = diatonicNotes.indexOf(name.replace('#','').replace('b',''));
        if(diatonicIndex === -1) continue;
        const diatonicMidi = octave * 7 + diatonicIndex;
        const f5Diatonic = 5 * 7 + 3; // F5: octave 5, F is index 3
        TREBLE_MIDI_TO_POS[midi] = f5Diatonic - diatonicMidi;
    }
}
buildMidiPosMap();

// --- Calculate staff Y positions ---
function getStaffLayouts() {
    const layouts = [];
    let y = L.topMargin + 30;

    INSTRUMENTS.forEach(inst => {
        const instLayout = {
            id: inst.id,
            label: inst.label,
            clef: inst.clef,
            color: inst.color,
            editable: inst.editable,
            staves: []
        };

        if(inst.clef === 'grand') {
            // Treble staff
            instLayout.staves.push({
                id: inst.staves[0],
                y: y,
                clef: 'treble'
            });
            y += L.staffHeight() + L.grandStaffGap;
            // Bass staff
            instLayout.staves.push({
                id: inst.staves[1],
                y: y,
                clef: 'bass'
            });
            y += L.staffHeight() + L.sectionGap;
        } else {
            instLayout.staves.push({
                id: inst.staves[0],
                y: y,
                clef: inst.clef
            });
            y += L.staffHeight() + L.sectionGap;
        }

        layouts.push(instLayout);
    });

    return { layouts, totalHeight: y };
}

// --- SVG Helpers ---
function svgEl(tag, attrs, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if(attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
    if(text) el.textContent = text;
    return el;
}

// --- Draw Staff Lines ---
function drawStaffLines(svg, y, x1, x2) {
    for(let i = 0; i < 5; i++) {
        const lineY = y + i * L.staffLineGap;
        svg.appendChild(svgEl('line', {
            x1, y1: lineY, x2, y2: lineY,
            class: 'staff-line'
        }));
    }
}

// --- Draw Treble Clef ---
function drawTrebleClef(svg, x, y) {
    const text = svgEl('text', {
        x: x,
        y: y + L.staffHeight() - 2,
        'font-size': '38',
        'font-family': 'serif',
        fill: '#FFFFFF'
    }, '𝄞');
    svg.appendChild(text);
}

// --- Draw Bass Clef ---
function drawBassClef(svg, x, y) {
    const text = svgEl('text', {
        x: x,
        y: y + L.staffHeight() - 8,
        'font-size': '24',
        'font-family': 'serif',
        fill: '#FFFFFF'
    }, '𝄢');
    svg.appendChild(text);
}

// --- Draw Percussion Clef ---
function drawPercussionClef(svg, x, y) {
    const mx = x + 4;
    // Two vertical rectangles
    svg.appendChild(svgEl('rect', {
        x: mx, y: y + 4,
        width: 4, height: L.staffHeight() - 8,
        fill: '#FFFFFF'
    }));
    svg.appendChild(svgEl('rect', {
        x: mx +
