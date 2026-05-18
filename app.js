// PolyVox - Stage 1 Fixed v2
const SVG_NS = 'http://www.w3.org/2000/svg';
const SL = 12;
const SH = SL * 4;
const ML = 70;
const BW = 200;
const BPL = 4;
const CW = 38;
const TW = 26;
const NR = 5;
const ST = 35;

let keyIdx = 0;
let timeSig = '4/4';
let bpm = 120;
let totalBars = 8;
let selDur = 'quarter';
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

const KEY_NAMES = ['C','G','D','A','E','B',
    'F#','Db','Ab','Eb','Bb','F'];

const TP = [
    'C3','D3','E3','F3','G3','A3','B3',
    'C4','D4','E4','F4','G4','A4','B4',
    'C5','D5','E5','F5','G5','A5','B5',
    'C6','D6','E6'
];

const BP = [
    'C1','D1','E1','F1','G1','A1','B1',
    'C2','D2','E2','F2','G2','A2','B2',
    'C3','D3','E3','F3','G3','A3','B3',
    'C4','D4','E4'
];

const STAVES = [
    {id:'voice',       label:'Voice', clef:'treble', pitches:TP, editable:false},
    {id:'organTreble', label:'Organ', clef:'treble', pitches:TP, editable:true},
    {id:'organBass',   label:'',      clef:'bass',   pitches:BP, editable:true},
    {id:'coro',        label:'Coro',  clef:'treble', pitches:TP, editable:true},
    {id:'drums',       label:'Drums', clef:'perc',   pitches:TP, editable:true}
];

let score = {
    voice:[],organTreble:[],organBass:[],
    coro:[],drums:[]
};

function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for(const [k,v] of Object.entries(attrs))
        e.setAttributeNS(null, k, String(v));
    return e;
}

function tx(txt, attrs) {
    const e = document.createElementNS(SVG_NS, 'text');
    for(const [k,v] of Object.entries(attrs))
        e.setAttributeNS(null, k, String(v));
    e.textContent = txt;
    return e;
}

function staffSpacing() { return SH + 65; }
function systemH() { return STAVES.length * staffSpacing() + 10; }
function staffY(si, sysY) { return sysY + si * staffSpacing(); }
function lineCount() { return Math.ceil(totalBars / BPL); }
function totalW() { return ML + BPL * BW + 50; }
function totalH() { return lineCount() * (systemH() + 60) + 80; }
function headerW(first) { return CW + 8 + (first ? TW + 10 : 0); }

function initOrgan() {
    try {
        const ctx = new AudioContext();
        wafPlayer = new WebAudioFontPlayer();
        organFont = _tone_0190_Chaos_sf2_file;
        wafPlayer.loader.decodeAfterLoading(
            ctx, '_tone_0190_Chaos_sf2_file');
        setStatus('Ready — record or tap staff to add notes');
    } catch(e) {
        setStatus('Organ load error: ' + e.message);
    }
}
window.addEventListener('load', () => setTimeout(initOrgan, 800));

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
        drawStaff(svg, staff, si,
            staffY(si,sysY), sw, sb, eb, first);
    });

    const ty = staffY(0, sysY);
    const by = staffY(STAVES.length-1, sysY) + SH;
    svg.appendChild(el('line',{
        x1:ML,y1:ty,x2:ML,y2:by,
        stroke:'#000','stroke-width':2
    }));

    const oty = staffY(1, sysY);
    const oby = staffY(2, sysY) + SH;
    svg.appendChild(tx('{',{
        x:ML-16,
        y:oty+(oby-oty)/2+8,
        'font-size':(oby-oty)+12,
        'font-family':'serif',fill:'#000'
    }));
}

function drawStaff(svg, staff, si, sy, sw, sb, eb, first) {
    for(let l=0;l<5;l++) {
        svg.appendChild(el('line',{
            x1:ML,y1:sy+l*SL,x2:sw,y2:sy+l*SL,
            stroke:'#000','stroke-width':0.9
        }));
    }

    if(staff.label) svg.appendChild(tx(staff.label,{
        x:2,y:sy+SH/2+4,
        'font-size':11,'font-family':'serif',fill:'#444'
    }));

    let x = ML+4;
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
            x:x+2,y:sy+3,width:5,height:SH-6,fill:'#000'
        }));
        svg.appendChild(el('rect',{
            x:x+11,y:sy+3,width:5,height:SH-6,fill:'#000'
        }));
    }
    x += CW;

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

    let bx = ML + headerW(first);
    for(let b=sb; b<eb; b++) {
        if(si===0) svg.appendChild(tx(String(b+1),{
            x:bx+4,y:sy-5,
            'font-size':9,fill:'#999',
            'font-family':'sans-serif'
        }));
        svg.appendChild(el('line',{
            x1:bx+BW,y1:sy,x2:bx+BW,y2:sy+SH,
            stroke:'#000','stroke-width':0.9
        }));
        (score[staff.id]||[])
            .filter(n=>n.bar===b)
            .forEach(n=>drawNote(svg,n,staff,bx,sy));
        bx += BW;
    }

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
        'data-id':String(note.id),
        'data-staff':staff.id
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
            const up = note.pitchIndex < 12;
            const sx2 = up ? nx+NR-1 : nx-NR+1;
            const sy2 = up ? ny-ST : ny+ST;
            g.appendChild(el('line',{
                x1:sx2,y1:ny,x2:sx2,y2:sy2,
                stroke:'#000','stroke-width':1.2
            }));
            if(note.duration==='eighth'||
               note.duration==='sixteenth') {
                const d = up?1:-1;
                g.appendChild(el('path',{
                    d:`M${sx2},${sy2} C${sx2+12},${sy2+d*10} ${sx2+8},${sy2+d*22} ${sx2+2},${sy2+d*28}`,
                    fill:'none',stroke:'#000',
                    'stroke-width':1.2
                }));
            }
        }

        if(note.accidental==='sharp') {
            g.appendChild(tx('♯',{
                x:nx-13,y:ny+4,'font-size':11,
                fill:'#000','font-family':'serif'
            }));
        } else if(note.accidental==='flat') {
            g.appendChild(tx('♭',{
                x:nx-13,y:ny+4,'font-size':11,
                fill:'#000','font-family':'serif'
            }));
        }

        if(note.dotted) {
            g.appendChild(el('circle',{
                cx:nx+NR+5,cy:ny-2,r:2,fill:'#000'
            }));
        }

        for(let ly=sy-SL;ly>=ny-2;ly-=SL) {
            g.appendChild(el('line',{
                x1:nx-9,y1:ly,x2:nx+9,y2:ly,
                stroke:'#000','stroke-width':0.9
            }));
        }
        for(let ly=sy+SH+SL;ly<=ny+2;ly+=SL) {
            g.appendChild(el('line',{
                x1:nx-9,y1:ly,x2:nx+9,y2:ly,
                stroke:'#000','stroke-width':0.9
            }));
        }
    }

    const hit = el('rect',{
        x:nx-16,y:ny-16,width:32,height:32,
        fill:'transparent',
        'data-id':String(note.id),
        'data-staff':staff.id
    });
    g.appendChild(hit);
    svg.appendChild(g);
}

function setupTouch(svg) {
    svg.addEventListener('touchend', e=>{
        e.preventDefault();
        const t = e.changedTouches[0];
        handleTap(t.clientX, t.clientY);
    }, {passive:false});

    svg.addEventListener('click', e=>{
        handleTap(e.clientX, e.clientY);
    });
}

function handleTap(cx, cy) {
    const wrapper = document.getElementById('scoreWrapper');
    const rect = wrapper.getBoundingClientRect();
    const svgX = cx - rect.left + wrapper.scrollLeft;
    const svgY = cy - rect.top + wrapper.scrollTop;

    const els = document.elementsFromPoint(cx, cy);
    for(const elem of els) {
        const id = elem.getAttribute('data-id');
        const staffId = elem.getAttribute('data-staff');
        if(id && staffId) {
            const staff = STAVES.find(s=>s.id===staffId);
            if(staff && staff.editable && delMode) {
                deleteNote(staffId, id);
                return;
            }
        }
    }

    if(!delMode) placeNote(svgX, svgY);
}

function placeNote(svgX, svgY) {
    for(let ln=0; ln<lineCount(); ln++) {
        const sysY = 40 + ln*(systemH()+60);
        const sb = ln*BPL;
        const eb = Math.min(sb+BPL, totalBars);
        const first = ln===0;
        const hw = headerW(first);

        for(let si=0; si<STAVES.length; si++) {
            const staff = STAVES[si];
            if(!staff.editable) continue;
            const sy = staffY(si, sysY);
            if(svgY < sy-30 || svgY > sy+SH+30) continue;

            let bx = ML + hw;
            for(let b=sb; b<eb; b++) {
                if(svgX >= bx && svgX < bx+BW) {
                    const pi = Math.round(
                        (sy+SH-svgY)/(SL/2));
                    addNote(staff.id, b,
                        Math.max(0,Math.min(23,pi)),
                        svgX-bx);
                    return;
                }
                bx += BW;
            }
        }
    }
}

function addNote(staffId, bar, pitchIndex, beatX) {
    if(!score[staffId]) score[staffId]=[];
    score[staffId].push({
        id: Date.now()+Math.random(),
        bar, pitchIndex, beatX,
        duration: selDur,
        dotted, accidental:sharp?'sharp':flat?'flat':null,
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
        .filter(n=>String(n.id)!==String(noteId));
    saveScore();
    drawScore();
    setStatus('Note deleted');
}

function noteToMidi(name) {
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const note=name.slice(0,-1);
    const oct=parseInt(name.slice(-1));
    return n.indexOf(note)+(oct+1)*12;
}

function getDurSeconds(dur, spb) {
    return {whole:spb*4,half:spb*2,quarter:spb,
        eighth:spb/2,sixteenth:spb/4}[dur]||spb;
}

function playOrgan() {
    if(!wafPlayer||!organFont) {
        setStatus('Organ not ready yet');
        return;
    }
    const ctx = new AudioContext();
    wafPlayer.loader.decodeAfterLoading(
        ctx,'_tone_0190_Chaos_sf2_file');
    const bpb = parseInt(timeSig.split('/')[0]);
    const spb = 60/bpm;
    const barDur = bpb*spb;
    const notes = score['organTreble']||[];
    if(!notes.length){setStatus('No organ notes');return;}

    notes.forEach(note=>{
        if(note.isRest) return;
        const staff=STAVES.find(s=>s.id==='organTreble');
        if(!staff) return;
        const pname=staff.pitches[note.pitchIndex];
        if(!pname) return;
        const midi=noteToMidi(pname);
        const when=ctx.currentTime+
            note.bar*barDur+(note.beatX/BW)*barDur;
        const dur=getDurSeconds(note.duration,spb);
        wafPlayer.queueWaveTable(
            ctx,ctx.destination,organFont,
            when,midi,dur,0.8);
    });
    setStatus('▶ Playing organ...');
}

document.getElementById('btnRecord')
    .addEventListener('click', startRec);
document.getElementById('btnStop')
    .addEventListener('click', stopRec);
document.getElementById('btnPlay')
    .addEventListener('click',()=>{
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
        mediaRec.ondataavailable=e=>{
            if(e.data.size>0) recChunks.push(e.data);
        };
        mediaRec.onstop=()=>{
            const blob=new Blob(recChunks,{type:'audio/webm'});
            recUrl=URL.createObjectURL(blob);
            document.getElementById('btnPlay').disabled=false;
            placeVoiceNotes();
        };
        mediaRec.start();
        recNotes=[];lastNote=null;holdCount=0;
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
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
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
                lastNote=note;holdCount=1;
            }
        }
    }
    requestAnimationFrame(pitchLoop);
}

function autocorr(buf, sr) {
    const SIZE=buf.length,MAX=Math.floor(SIZE/2);
    let best=-1,bestC=1,found=false,last=1,sum=0;
    let rms=0;
    for(let i=0;i<SIZE;i++) rms+=buf[i]*buf[i];
    if(Math.sqrt(rms/SIZE)<0.001) return -1;
    const c=new Array(MAX);
    for(let tau=0;tau<MAX;tau++) {
        let s=0;
        for(let i=0;i<MAX;i++)
            s+=Math.abs(buf[i]-buf[i+tau]);
        sum+=s;
        c[tau]=sum>0?s*tau/sum:0;
        if(tau>1&&c[tau]<0.15&&c[tau]<last) {
            found=true;
            if(c[tau]<bestC){bestC=c[tau];best=tau;}
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

function findPitchIndex(name, pitches) {
    let pi = pitches.indexOf(name);
    if(pi>=0) return pi;
    const base=name.slice(0,-1);
    const oct=parseInt(name.slice(-1));
    pi=pitches.indexOf(base+(oct+1));
    if(pi>=0) return pi;
    pi=pitches.indexOf(base+(oct-1));
    if(pi>=0) return pi;
    pi=pitches.indexOf(base+(oct+2));
    if(pi>=0) return pi;
    return 7; // middle C as fallback
}

function placeVoiceNotes() {
    score.voice=[];
    score.organTreble=[];
    const bpb=parseInt(timeSig.split('/')[0]);
    const beatW=BW/bpb;
    let bar=0,beat=0;

    recNotes.forEach(name=>{
        const pitchIndex=findPitchIndex(name,TP);
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
        if(beat>=bpb){
            beat=0;bar++;
            if(bar>=totalBars) totalBars++;
        }
    });

    document.getElementById('btnPlayOrgan').disabled=false;
    saveScore();
    drawScore();
    setStatus('Score ready! Tap ▶ Organ to play');
}

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
    ['click','touchend'].forEach(evt=>{
        btn.addEventListener(evt,e=>{
            e.preventDefault();
            e.stopPropagation();
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
});

['btnDot','btnSharp','btnFlat','btnRest','btnDelete']
    .forEach(id=>{
        const btn=document.getElementById(id);
        ['click','touchend'].forEach(evt=>{
            btn.addEventListener(evt,e=>{
                e.preventDefault();
                e.stopPropagation();
                if(id==='btnDot'){
                    dotted=!dotted;
                    btn.classList.toggle('active',dotted);
                } else if(id==='btnSharp'){
                    sharp=!sharp;flat=false;
                    btn.classList.toggle('active',sharp);
                    document.getElementById('btnFlat')
                        .classList.remove('active');
                } else if(id==='btnFlat'){
                    flat=!flat;sharp=false;
                    btn.classList.toggle('active',flat);
                    document.getElementById('btnSharp')
                        .classList.remove('active');
                } else if(id==='btnRest'){
                    rest=!rest;
                    btn.classList.toggle('active',rest);
                } else if(id==='btnDelete'){
                    delMode=!delMode;
                    btn.classList.toggle('active',delMode);
                    setStatus(delMode?
                        '🗑 Tap note to delete':
                        'Delete mode off');
                }
            });
        });
    });

const ps=document.createElement('style');
ps.textContent=`@media print {
    #header,#toolbar,#notePanel,#status
        {display:none!important;}
    #scoreWrapper{overflow:visible!important;
        height:auto!important;}
    body{background:white!important;}
}`;
document.head.appendChild(ps);

function setStatus(msg) {
    const e=document.getElementById('status');
    if(e) e.textContent=msg;
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
