// PolyVox - Stage 1 Fixed + Organ Playback + Touch Edit
const SVG_NS = 'http://www.w3.org/2000/svg';
const SL = 12;  // staff line spacing
const SH = SL * 4;  // staff height
const ML = 70;  // margin left
const BW = 200; // bar width
const BPL = 4;  // bars per line
const CW = 38;  // clef width
const TW = 26;  // time sig width
const NR = 5;   // note head radius
const ST = 35;  // stem height

let keyIdx = 0;
let timeSig = '4/4';
let bpm = 120;
let totalBars = 8;
let selDur = 'whole';
let dotted = false;
let sharp = false;
let flat = false;
let rest = false;
let delMode = false;
let isRecording = false;
let recUrl = null;
let mediaRec = null;
let recChunks = [];
let audioCtx = null;
let analyser = null;
let mediaStream = null;
let recNotes = [];
let lastNote = null;
let holdCount = 0;
let wafPlayer = null;
let organFont = null;
let organCtx = null;

const KEY_NAMES = ['C','G','D','A','E','B',
    'F#','Db','Ab','Eb','Bb','F'];

const TP = ['E4','F4','G4','A4','B4','C5','D5','E5',
    'F5','G5','A5','B5','C6','D6','E6'];
const BP = ['G2','A2','B2','C3','D3','E3','F3','G3',
    'A3','B3','C4','D4','E4','F4','G4'];

const NOTE_MIDI = {
    'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
    'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11
};

const STAVES = [
    {id:'voice',       label:'Voice', clef:'treble', pitches:TP, editable:false},
    {id:'organTreble', label:'Organ', clef:'treble', pitches:TP, editable:true},
    {id:'organBass',   label:'',      clef:'bass',   pitches:BP, editable:true},
    {id:'coro',        label:'Coro',  clef:'treble', pitches:TP, editable:true},
    {id:'drums',       label:'Drums', clef:'perc',   pitches:TP, editable:true}
];

let score = {voice:[],organTreble:[],organBass:[],coro:[],drums:[]};

// --- Init WebAudioFont ---
function initOrgan() {
    try {
        organCtx = new AudioContext();
        wafPlayer = new WebAudioFontPlayer();
        organFont = _tone_0190_Chaos_sf2_file;
        wafPlayer.loader.decodeAfterLoading(
            organCtx, '_tone_0190_Chaos_sf2_file');
        setStatus('Ready — record or tap staff to add notes');
    } catch(e) {
        setStatus('Organ load error: ' + e.message);
    }
}
window.addEventListener('load', () => setTimeout(initOrgan, 600));

// --- SVG helpers ---
function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for(const [k,v] of Object.entries(attrs))
        e.setAttributeNS(null, k, String(v));
    return e;
}
function tx(txt, attrs) {
    const e = el('text', attrs);
    e.textContent = txt;
    return e;
}

// --- Layout ---
function staffSpacing() { return SH + 65; }
function systemH() { return STAVES.length * staffSpacing() + 10; }
function staffY(si, sysY) { return sysY + si * staffSpacing(); }
function lineCount() { return Math.ceil(totalBars / BPL); }
function totalW() { return ML + BPL * BW + 50; }
function totalH() { return lineCount() * (systemH() + 60) + 80; }
function headerW(first) {
    return CW + 8 + (first ? TW + 10 : 0);
}

// --- Draw ---
function drawScore() {
    const svg = document.getElementById('scoreSvg');
    if(!svg) return;
    svg.innerHTML = '';
    const W = totalW(), H = totalH();
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.appendChild(el('rect',
        {x:0,y:0,width:W,height:H,fill:'#f5f0e8'}));

    for(let ln=0; ln<lineCount(); ln++) {
        const sysY = 40 + ln * (systemH() + 60);
        const sb = ln * BPL;
        const eb = Math.min(sb + BPL, totalBars);
        drawSystem(svg, sysY, sb, eb, ln===0);
    }

    setupTouch(svg);
}

function drawSystem(svg, sysY, sb, eb, first) {
    const hw = headerW(first);
    const sw = ML + hw + (eb-sb)*BW + 10;

    STAVES.forEach((staff, si) => {
        const sy = staffY(si, sysY);
        drawStaff(svg, staff, si, sy, sw, sb, eb, first);
    });

    // System bar line
    const ty = staffY(0, sysY);
    const by = staffY(STAVES.length-1, sysY) + SH;
    svg.appendChild(el('line',{x1:ML,y1:ty,x2:ML,y2:by,
        stroke:'#000','stroke-width':2}));

    // Organ brace
    const oty = staffY(1, sysY);
    const oby = staffY(2, sysY) + SH;
    const braceEl = tx('{', {
        x: ML-16,
        y: oty + (oby-oty)/2 + 8,
        'font-size': (oby-oty)+12,
        'font-family':'serif', fill:'#000'
    });
    svg.appendChild(braceEl);
}

function drawStaff(svg, staff, si, sy, sw, sb, eb, first) {
    // 5 lines
    for(let l=0;l<5;l++) {
        const ly = sy + l*SL;
        svg.appendChild(el('line',{
            x1:ML,y1:ly,x2:sw,y2:ly,
            stroke:'#000','stroke-width':0.9
        }));
    }

    // Label
    if(staff.label) svg.appendChild(tx(staff.label,{
        x:2, y:sy+SH/2+4,
        'font-size':11,'font-family':'serif',fill:'#444'
    }));

    let x = ML+4;

    // Clef
    if(staff.clef==='treble') {
        svg.appendChild(tx('𝄞',{
            x,y:sy+SH+2,'font-size':48,
            'font-family':'serif',fill:'#000'
        }));
    } else if(staff.clef==='bass') {
        svg.appendChild(tx('𝄢',{
            x,y:sy+SH-4,'font-size':32,
            'font-family':'serif',fill:'#000'
        }));
    } else {
        svg.appendChild(el('rect',{
            x:x+2,y:sy+3,width:5,
            height:SH-6,fill:'#000'
        }));
        svg.appendChild(el('rect',{
            x:x+11,y:sy+3,width:5,
            height:SH-6,fill:'#000'
        }));
    }
    x += CW;

    // Time sig (first line only)
    if(first) {
        const [top,bot] = timeSig.split('/');
        svg.appendChild(tx(top,{
            x:x+2,y:sy+SL*2,
            'font-size':20,'font-weight':'bold',
            'font-family':'serif',fill:'#000'
        }));
        svg.appendChild(tx(bot,{
            x:x+2,y:sy+SH,
            'font-size':20,'font-weight':'bold',
            'font-family':'serif',fill:'#000'
        }));
        x += TW+10;
    }

    // Bars
    let bx = ML + headerW(first);
    for(let b=sb; b<eb; b++) {
        const bex = bx + BW;
        // Bar number
        if(si===0) svg.appendChild(tx(String(b+1),{
            x:bx+4,y:sy-5,
            'font-size':9,fill:'#999',
            'font-family':'sans-serif'
        }));
        // Bar line
        svg.appendChild(el('line',{
            x1:bex,y1:sy,x2:bex,y2:sy+SH,
            stroke:'#000','stroke-width':0.9
        }));
        // Notes
        (score[staff.id]||[])
            .filter(n=>n.bar===b)
            .forEach(n=>drawNote(svg,n,staff,bx,sy));

        bx += BW;
    }

    // Final double barline
    if(eb===totalBars) {
        svg.appendChild(el('line',{
            x1:bx,y1:sy,x2:bx,y2:sy+SH,
            stroke:'#000','stroke-width':3
        }));
        svg.appendChild(el('line',{
            x1:bx-5,y1:sy,x2:bx-5,y2:sy+SH,
            stroke:'#000','stroke-width':1
        }));
    }
}

function drawNote(svg, note, staff, bx, sy) {
    const nx = bx + note.beatX;
    const ny = sy + SH - (note.pitchIndex * SL/2);
    const g = el('g',{
        'data-id':note.id,
        'data-staff':staff.id,
        'data-nx':nx,
        'data-ny':ny
    });

    if(note.isRest) {
        g.appendChild(tx('𝄽',{
            x:nx,y:ny,'font-size':18,
            fill:'#000','font-family':'serif'
        }));
    } else {
        const filled = note.duration!=='whole' &&
            note.duration!=='half';
        g.appendChild(el('ellipse',{
            cx:nx,cy:ny,rx:NR,ry:NR*0.75,
            fill:filled?'#000':'none',
            stroke:'#000','stroke-width':1.2,
            transform:`rotate(-15,${nx},${ny})`
        }));

        if(note.duration!=='whole') {
            const up = note.pitchIndex < 6;
            const sx = up ? nx+NR-1 : nx-NR+1;
            const sy2 = up ? ny-ST : ny+ST;
            g.appendChild(el('line',{
                x1:sx,y1:ny,x2:sx,y2:sy2,
                stroke:'#000','stroke-width':1.2
            }));
            if(note.duration==='eighth'||
               note.duration==='sixteenth') {
                const d = up?1:-1;
                g.appendChild(el('path',{
                    d:`M${sx},${sy2} C${sx+12},${sy2+d*10} ${sx+8},${sy2+22*d} ${sx+2},${sy2+28*d}`,
                    fill:'none',stroke:'#000','stroke-width':1.2
                }));
            }
        }

        if(note.accidental) {
            g.appendChild(tx(
                note.accidental==='sharp'?'♯':'♭',{
                x:nx-13,y:ny+4,'font-size':11,
                fill:'#000','font-family':'serif'
            }));
        }
        if(note.dotted) {
            g.appendChild(el('circle',{
                cx:nx+NR+5,cy:ny-2,r:2,fill:'#000'
            }));
        }

        // Ledger lines above
        for(let ly=sy-SL; ly>=ny-2; ly-=SL) {
            g.appendChild(el('line',{
                x1:nx-9,y1:ly,x2:nx+9,y2:ly,
                stroke:'#000','stroke-width':0.9
            }));
        }
        // Ledger lines below
        for(let ly=sy+SH+SL; ly<=ny+2; ly+=SL) {
            g.appendChild(el('line',{
                x1:nx-9,y1:ly,x2:nx+9,y2:ly,
                stroke:'#000','stroke-width':0.9
            }));
        }
    }

    // Large invisible touch target
    const hit = el('rect',{
        x:nx-15, y:ny-15,
        width:30, height:30,
        fill:'transparent',
        'data-id':note.id,
        'data-staff':staff.id
    });
    hit.style.cursor = staff.editable ? 'pointer' : 'default';
    g.appendChild(hit);
    svg.appendChild(g);
}

// --- Touch/Click Setup ---
function setupTouch(svg) {
    // Use touchend for reliable mobile response
    svg.addEventListener('touchend', e => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        handleTap(touch.clientX, touch.clientY, svg);
    }, {passive:false});

    svg.addEventListener('click', e => {
        handleTap(e.clientX, e.clientY, svg);
    });
}

function handleTap(cx, cy, svg) {
    const wrapper = document.getElementById('scoreWrapper');
    const rect = wrapper.getBoundingClientRect();
    const svgX = cx - rect.left + wrapper.scrollLeft;
    const svgY = cy - rect.top + wrapper.scrollTop;

    // Check if tapped on existing note
    const els = document.elementsFromPoint(cx, cy);
    for(const el of els) {
        const id = el.getAttribute('data-id');
        const staffId = el.getAttribute('data-staff');
        if(id && staffId) {
            const staff = STAVES.find(s=>s.id===staffId);
            if(staff && staff.editable) {
                if(delMode) {
                    deleteNote(staffId, parseFloat(id));
                    return;
                }
            }
        }
    }

    // Place new note
    if(!delMode) placeNote(svgX, svgY);
}

function placeNote(svgX, svgY) {
    for(let ln=0; ln<lineCount(); ln++) {
        const sysY = 40 + ln * (systemH() + 60);
        const sb = ln * BPL;
        const eb = Math.min(sb + BPL, totalBars);
        const first = ln===0;
        const hw = headerW(first);

        STAVES.forEach((staff, si) => {
            if(!staff.editable) return;
            const sy = staffY(si, sysY);
            if(svgY < sy-30 || svgY > sy+SH+30) return;

            let bx = ML + hw;
            for(let b=sb; b<eb; b++) {
                if(svgX >= bx && svgX < bx+BW) {
                    const pi = Math.round(
                        (sy+SH-svgY)/(SL/2));
                    addNote(staff.id, b,
                        Math.max(0,Math.min(14,pi)),
                        svgX-bx);
                    return;
                }
                bx += BW;
            }
        });
    }
}

function addNote(staffId, bar, pitchIndex, beatX) {
    if(!score[staffId]) score[staffId]=[];
    score[staffId].push({
        id: Date.now()+Math.random(),
        bar, pitchIndex, beatX,
        duration:selDur, dotted,
        accidental:sharp?'sharp':flat?'flat':null,
        isRest:rest
    });
    saveScore();
    drawScore();
    const staff = STAVES.find(s=>s.id===staffId);
    const pitch = staff&&staff.pitches[pitchIndex]||'?';
    setStatus(`Added ${selDur} — ${pitch} — bar ${bar+1}`);
}

function deleteNote(staffId, noteId) {
    score[staffId] = (score[staffId]||[])
        .filter(n=>n.id!==noteId);
    saveScore();
    drawScore();
    setStatus('Note deleted');
}

// --- Organ Playback ---
function noteNameToMidi(name) {
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const note = name.slice(0,-1);
    const oct = parseInt(name.slice(-1));
    return n.indexOf(note) + (oct+1)*12;
}

function playOrgan() {
    if(!wafPlayer||!organFont) {
        setStatus('Organ not loaded yet, please wait');
        return;
    }
    const ctx = new AudioContext();
    wafPlayer.loader.decodeAfterLoading(
        ctx,'_tone_0190_Chaos_sf2_file');

    const beatsPerBar = parseInt(timeSig.split('/')[0]);
    const secPerBeat = 60/bpm;
    const barDur = beatsPerBar * secPerBeat;

    const notes = (score['organTreble']||[]);
    if(notes.length===0) {
        setStatus('No organ notes to play');
        return;
    }

    notes.forEach(note => {
        if(note.isRest) return;
        const staff = STAVES.find(s=>s.id==='organTreble');
        if(!staff) return;
        const pitchName = staff.pitches[note.pitchIndex];
        if(!pitchName) return;
        const midi = noteNameToMidi(pitchName);
        const when = ctx.currentTime +
            note.bar * barDur +
            (note.beatX/BW) * barDur;
        const dur = getDurSeconds(note.duration, secPerBeat);
        wafPlayer.queueWaveTable(
            ctx, ctx.destination, organFont,
            when, midi, dur, 0.8);
    });

    setStatus('▶ Playing organ...');
}

function getDurSeconds(dur, secPerBeat) {
    switch(dur) {
        case 'whole':     return secPerBeat * 4;
        case 'half':      return secPerBeat * 2;
        case 'quarter':   return secPerBeat;
        case 'eighth':    return secPerBeat / 2;
        case 'sixteenth': return secPerBeat / 4;
        default:          return secPerBeat;
    }
}

// --- Recording ---
document.getElementById('btnRecord')
    .addEventListener('click', startRec);
document.getElementById('btnStop')
    .addEventListener('click', stopRec);
document.getElementById('btnPlay')
    .addEventListener('click', ()=>{
        if(recUrl) new Audio(recUrl).play();
    });
document.getElementById('btnPlayOrgan')
    .addEventListener('click', playOrgan);

async function startRec() {
    try {
        mediaStream = await navigator.mediaDevices
            .getUserMedia({audio:{
                echoCancellation:true,
                noiseSuppression:true,
                autoGainControl:true
            }});
        audioCtx = new AudioContext({sampleRate:44100});
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 8192;
        audioCtx.createMediaStreamSource(mediaStream)
            .connect(analyser);
        recChunks=[];
        mediaRec = new MediaRecorder(mediaStream);
        mediaRec.ondataavailable = e=>{
            if(e.data.size>0) recChunks.push(e.data);
        };
        mediaRec.onstop = ()=>{
            const blob=new Blob(recChunks,{type:'audio/webm'});
            recUrl=URL.createObjectURL(blob);
            document.getElementById('btnPlay').disabled=false;
            placeVoiceNotes();
        };
        mediaRec.start();
        recNotes=[]; lastNote=null; holdCount=0;
        isRecording=true;
        document.getElementById('btnRecord').disabled=true;
        document.getElementById('btnStop').disabled=false;
        setStatus('🔴 Recording... sing clearly!');
        pitchLoop();
    } catch(e) {
        setStatus('Mic error: '+e.message);
    }
}

function stopRec() {
    isRecording=false;
    if(mediaRec&&mediaRec.state!=='inactive') mediaRec.stop();
    if(mediaStream) mediaStream.getTracks()
        .forEach(t=>t.stop());
    if(audioCtx) audioCtx.close();
    document.getElementById('btnRecord').disabled=false;
    document.getElementById('btnStop').disabled=true;
    setStatus('✅ '+recNotes.length+' notes detected');
}

function pitchLoop() {
    if(!isRecording) return;
    const buf=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let rms=0;
    for(let i=0;i<buf.length;i++) rms+=buf[i]*buf[i];
    rms=Math.sqrt(rms/buf.length);
    if(rms>0.0005) {
        const pitch=autocorr(buf,44100);
        if(pitch>80&&pitch<1200) {
            const note=freqToNote(pitch);
            if(note===lastNote) {
                holdCount++;
            } else {
                if(lastNote&&holdCount>=2) {
                    recNotes.push(lastNote);
                    setStatus('🔴 '+recNotes.length+' notes');
                }
                lastNote=note; holdCount=1;
            }
        }
    }
    requestAnimationFrame(pitchLoop);
}

function autocorr(buf, sr) {
    const SIZE=buf.length, MAX=Math.floor(SIZE/2);
    let best=-1,bestC=0,found=false,last=1,sum=0;
    const c=new Array(MAX);
    let rms=0;
    for(let i=0;i<SIZE;i++) rms+=buf[i]*buf[i];
    if(Math.sqrt(rms/SIZE)<0.001) return -1;
    for(let tau=0;tau<MAX;tau++) {
        let s=0;
        for(let i=0;i<MAX;i++)
            s+=Math.abs(buf[i]-buf[i+tau]);
        sum+=s;
        c[tau]=sum>0?s*tau/sum:0;
        if(tau>1&&c[tau]<0.15&&c[tau]<last) {
            found=true;
            if(c[tau]<bestC||best===-1){
                bestC=c[tau];best=tau;
            }
        } else if(found) return sr/best;
        last=c[tau];
    }
    return best>0?sr/best:-1;
}

function freqToNote(freq) {
    if(freq<=0) return null;
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const midi=Math.round(12*Math.log2(freq/440)+69);
    return n[midi%12]+(Math.floor(midi/12)-1);
}

function placeVoiceNotes() {
    score.voice=[];
    score.organTreble=[];
    const bpb=parseInt(timeSig.split('/')[0]);
    const beatW=BW/bpb;
    let bar=0,beat=0;

    recNotes.forEach(name=>{
        const pi=TP.indexOf(name);
        const pitchIndex=pi>=0?pi:4;
        const bx=beat*beatW+beatW/2;
        const note={
            id:Date.now()+Math.random(),
            bar,pitchIndex,beatX:bx,
            duration:'quarter',dotted:false,
            accidental:null,isRest:false
        };
        score.voice.push(note);
        score.organTreble.push({
            ...note,id:Date.now()+Math.random()
        });
        beat++;
        if(beat>=bpb){beat=0;bar++;
            if(bar>=totalBars)totalBars++;}
    });

    document.getElementById('btnPlayOrgan').disabled=false;
    saveScore();
    drawScore();
    setStatus('Score ready! Tap ▶ Organ to play');
}

// --- Toolbar ---
document.getElementById('btnKeyUp')
    .addEventListener('click',()=>{
        keyIdx=(keyIdx+1)%12;
        document.getElementById('keyDisplay')
            .textContent=KEY_NAMES[keyIdx];
        drawScore();
    });
document.getElementById('btnKeyDown')
    .addEventListener('click',()=>{
        keyIdx=((keyIdx-1)+12)%12;
        document.getElementById('keyDisplay')
            .textContent=KEY_NAMES[keyIdx];
        drawScore();
    });
document.getElementById('timeSig')
    .addEventListener('change',e=>{
        timeSig=e.target.value;drawScore();});
document.getElementById('btnAddBar')
    .addEventListener('click',()=>{
        totalBars+=4;drawScore();
        setStatus('Added 4 bars');});
document.getElementById('btnPrint')
    .addEventListener('click',()=>window.print());

let tapTimes=[];
document.getElementById('btnTapTempo')
    .addEventListener('click',()=>{
        const now=Date.now();
        tapTimes.push(now);
        if(tapTimes.length>8) tapTimes.shift();
        if(tapTimes.length>1){
            const avg=tapTimes.slice(1)
                .reduce((s,t,i)=>s+(t-tapTimes[i]),0)/
                (tapTimes.length-1);
            bpm=Math.round(60000/avg);
            document.getElementById('bpmDisplay')
                .textContent=bpm;
        }
    });

document.querySelectorAll('[data-dur]').forEach(btn=>{
    btn.addEventListener('click',()=>{
        document.querySelectorAll('[data-dur]')
            .forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        selDur=btn.dataset.dur;
        rest=false;
        document.getElementById('btnRest')
            .classList.remove('active');
        setStatus('Duration: '+selDur);
    });
});

document.getElementById('btnDot')
    .addEventListener('click',()=>{
        dotted=!dotted;
        document.getElementById('btnDot')
            .classList.toggle('active',dotted);
    });
document.getElementById('btnSharp')
    .addEventListener('click',()=>{
        sharp=!sharp;flat=false;
        document.getElementById('btnSharp')
            .classList.toggle('active',sharp);
        document.getElementById('btnFlat')
            .classList.remove('active');
    });
document.getElementById('btnFlat')
    .addEventListener('click',()=>{
        flat=!flat;sharp=false;
        document.getElementById('btnFlat')
            .classList.toggle('active',flat);
        document.getElementById('btnSharp')
            .classList.remove('active');
    });
document.getElementById('btnRest')
    .addEventListener('click',()=>{
        rest=!rest;
        document.getElementById('btnRest')
            .classList.toggle('active',rest);
    });
document.getElementById('btnDelete')
    .addEventListener('click',()=>{
        delMode=!delMode;
        document.getElementById('btnDelete')
            .classList.toggle('active',delMode);
        setStatus(delMode?
            '🗑 Tap a note to delete':'Delete mode off');
    });

// Print
const ps=document.createElement('style');
ps.textContent=`@media print {
    #header,#toolbar,#notePanel,#status{display:none!important;}
    #scoreWrapper{overflow:visible!important;height:auto!important;}
    body{background:white!important;}
}`;
document.head.appendChild(ps);

function setStatus(msg) {
    const el=document.getElementById('status');
    if(el) el.textContent=msg;
}

function saveScore() {
    try{localStorage.setItem('pvx',JSON.stringify(score));}
    catch(e){}
}
function loadScore() {
    try{
        const s=localStorage.getItem('pvx');
        if(s) score=JSON.parse(s);
    }catch(e){}
}

loadScore();
drawScore();

if('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js');
