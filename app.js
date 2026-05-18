// PolyVox — Full Music Writing App v2
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SL  = 12;
const SH  = SL * 4;
const ML  = 72;
const BW  = 220;
const BPL = 4;
const CW  = 40;
const TW  = 28;
const NR  = 5;
const STH = 36;

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

const KEY_NAMES = ['C','G','D','A','E','B',
    'F#','Db','Ab','Eb','Bb','F'];
const KEY_SHARPS = [0,1,2,3,4,5,6,0,0,0,0,0];
const KEY_FLATS  = [0,0,0,0,0,0,0,6,5,4,3,1];
const DUR_BEATS  = {
    whole:4,half:2,quarter:1,eighth:0.5,sixteenth:0.25
};

const STAVES = [
    {id:'voice', label:'Voice',clef:'treble',pitches:TP,editable:false},
    {id:'organT',label:'Organ',clef:'treble',pitches:TP,editable:true},
    {id:'organB',label:'',    clef:'bass',  pitches:BP,editable:true},
    {id:'coro',  label:'Coro', clef:'treble',pitches:TP,editable:true},
    {id:'drums', label:'Drums',clef:'perc',  pitches:TP,editable:true}
];

// ── State ──
let keyIdx=0, timeSig='4/4', bpm=120, totalBars=8;
let selDur='quarter', selRest=false;
let useSharp=false, useFlat=false, useNat=false, useDot=false;
let eraseMode=false;
let selNote=null; // {staffId, noteId}
let longPressTimer=null;
let touchMoved=false;

let score={voice:[],organT:[],organB:[],coro:[],drums:[]};
let recUrl=null, mediaRec=null, recChunks=[];
let micCtx=null, analyser=null, micStream=null;
let recNotes=[], lastPitch=null, holdCnt=0, isRec=false;
let wafPlayer=null, organFont=null;
let playCtx=null, voiceAudio=null;
let tapTimes=[];

// ── Init organ ──
function initOrgan() {
    try {
        const ctx=new AudioContext();
        wafPlayer=new WebAudioFontPlayer();
        organFont=_tone_0190_Chaos_sf2_file;
        wafPlayer.loader.decodeAfterLoading(
            ctx,'_tone_0190_Chaos_sf2_file');
        setStatus('Ready — record or tap staff to write notes');
    } catch(e) {
        setStatus('Organ load failed: '+e.message);
    }
}
window.addEventListener('load',()=>setTimeout(initOrgan,800));

// ── SVG helpers ──
function el(tag,a={}) {
    const e=document.createElementNS(SVG_NS,tag);
    for(const[k,v] of Object.entries(a))
        e.setAttributeNS(null,k,String(v));
    return e;
}
function tx(t,a={}) {
    const e=el('text',a);
    e.textContent=t;
    return e;
}

// ── Layout ──
const staffSp  =()=>SH+70;
const systemH  =()=>STAVES.length*staffSp()+10;
const staffY   =(si,sy)=>sy+si*staffSp();
const lineCount=()=>Math.ceil(totalBars/BPL);
const totalW   =()=>ML+BPL*BW+60;
const totalH   =()=>lineCount()*(systemH()+70)+80;
const headW    =(first)=>CW+8+(first?TW+12:0);

// ── Draw ──
function drawScore() {
    const svg=document.getElementById('scoreSvg');
    if(!svg) return;
    svg.innerHTML='';
    const W=totalW(),H=totalH();
    svg.setAttribute('width',W);
    svg.setAttribute('height',H);
    svg.appendChild(el('rect',
        {x:0,y:0,width:W,height:H,fill:'#f5f0e8'}));
    for(let ln=0;ln<lineCount();ln++) {
        const sysY=50+ln*(systemH()+70);
        const sb=ln*BPL;
        const eb=Math.min(sb+BPL,totalBars);
        drawSystem(svg,sysY,sb,eb,ln===0);
    }
    attachSvgEvents(svg);
}

function drawSystem(svg,sysY,sb,eb,first) {
    const ty=staffY(0,sysY);
    const by=staffY(STAVES.length-1,sysY)+SH;
    svg.appendChild(el('line',{x1:ML,y1:ty,x2:ML,y2:by,
        stroke:'#000','stroke-width':2.5}));
    const oty=staffY(1,sysY);
    const oby=staffY(2,sysY)+SH;
    svg.appendChild(tx('{',{
        x:ML-18,y:oty+(oby-oty)/2+10,
        'font-size':(oby-oty)+14,
        'font-family':'serif',fill:'#000'
    }));
    STAVES.forEach((staff,si)=>{
        drawStaff(svg,staff,si,
            staffY(si,sysY),sb,eb,first);
    });
}

function drawStaff(svg,staff,si,sy,sb,eb,first) {
    const sw=ML+headW(first)+(eb-sb)*BW+10;
    for(let l=0;l<5;l++) {
        svg.appendChild(el('line',{
            x1:ML,y1:sy+l*SL,x2:sw,y2:sy+l*SL,
            stroke:'#000','stroke-width':0.9
        }));
    }
    if(staff.label) svg.appendChild(tx(staff.label,{
        x:2,y:sy+SH/2+4,
        'font-size':11,'font-family':'serif',fill:'#333'
    }));

    let x=ML+4;
    if(staff.clef==='treble') {
        svg.appendChild(tx('𝄞',{x,y:sy+SH+4,
            'font-size':50,'font-family':'serif',fill:'#000'}));
    } else if(staff.clef==='bass') {
        svg.appendChild(tx('𝄢',{x,y:sy+SH-2,
            'font-size':34,'font-family':'serif',fill:'#000'}));
    } else {
        svg.appendChild(el('rect',{x:x+2,y:sy+3,
            width:5,height:SH-6,fill:'#000'}));
        svg.appendChild(el('rect',{x:x+11,y:sy+3,
            width:5,height:SH-6,fill:'#000'}));
    }

    if(first) {
        const [top,bot]=timeSig.split('/');
        svg.appendChild(tx(top,{x:x+CW+2,y:sy+SL*2,
            'font-size':22,'font-weight':'bold',
            'font-family':'serif',fill:'#000'}));
        svg.appendChild(tx(bot,{x:x+CW+2,y:sy+SH,
            'font-size':22,'font-weight':'bold',
            'font-family':'serif',fill:'#000'}));
    }

    let bx=ML+headW(first);
    for(let b=sb;b<eb;b++) {
        if(si===0) svg.appendChild(tx(String(b+1),{
            x:bx+4,y:sy-6,
            'font-size':9,fill:'#aaa',
            'font-family':'sans-serif'
        }));
        svg.appendChild(el('line',{
            x1:bx+BW,y1:sy,x2:bx+BW,y2:sy+SH,
            stroke:'#000','stroke-width':0.9
        }));
        (score[staff.id]||[])
            .filter(n=>n.bar===b)
            .forEach(n=>drawNote(svg,n,staff,bx,sy));
        bx+=BW;
    }
    if(eb===totalBars) {
        svg.appendChild(el('line',{
            x1:bx,y1:sy,x2:bx,y2:sy+SH,
            stroke:'#000','stroke-width':3.5}));
        svg.appendChild(el('line',{
            x1:bx-5,y1:sy,x2:bx-5,y2:sy+SH,
            stroke:'#000','stroke-width':1}));
    }
}

function drawNote(svg,note,staff,bx,sy) {
    const nx=bx+note.beatX;
    const ny=sy+SH-(note.pitchIndex*SL/2);
    const isSel=selNote&&
        selNote.staffId===staff.id&&
        selNote.noteId===String(note.id);
    const color=isSel?'#1565C0':'#000';

    const g=el('g',{
        'data-id':String(note.id),
        'data-staff':staff.id,
        cursor:staff.editable?'pointer':'default'
    });

    // Selection halo
    if(isSel) {
        g.appendChild(el('ellipse',{
            cx:nx,cy:ny,rx:NR+8,ry:NR+8,
            fill:'#F9A825',opacity:'0.5'
        }));
    }

    const restSyms={
        whole:'𝄻',half:'𝄼',quarter:'𝄽',
        eighth:'𝄾',sixteenth:'𝄿'
    };

    if(note.isRest) {
        g.appendChild(tx(restSyms[note.duration]||'𝄽',{
            x:nx,y:ny,'font-size':18,
            fill:color,'font-family':'serif'
        }));
    } else {
        const filled=note.duration!=='whole'&&
            note.duration!=='half';
        g.appendChild(el('ellipse',{
            cx:nx,cy:ny,rx:NR,ry:NR*0.75,
            fill:filled?color:'none',
            stroke:color,'stroke-width':1.3,
            transform:`rotate(-15,${nx},${ny})`
        }));
        if(note.duration!=='whole') {
            const up=note.pitchIndex<12;
            const sx=up?nx+NR-1:nx-NR+1;
            const sy2=up?ny-STH:ny+STH;
            g.appendChild(el('line',{
                x1:sx,y1:ny,x2:sx,y2:sy2,
                stroke:color,'stroke-width':1.3}));
            if(note.duration==='eighth'||
               note.duration==='sixteenth') {
                const d=up?1:-1;
                g.appendChild(el('path',{
                    d:`M${sx},${sy2} C${sx+14},${sy2+d*8} ${sx+10},${sy2+d*20} ${sx+2},${sy2+d*26}`,
                    fill:'none',stroke:color,
                    'stroke-width':1.3}));
            }
            if(note.duration==='sixteenth') {
                const d=up?1:-1;
                g.appendChild(el('path',{
                    d:`M${sx},${sy2+d*8} C${sx+14},${sy2+d*16} ${sx+10},${sy2+d*28} ${sx+2},${sy2+d*34}`,
                    fill:'none',stroke:color,
                    'stroke-width':1.3}));
            }
        }
        if(note.accidental==='sharp')
            g.appendChild(tx('♯',{x:nx-14,y:ny+4,
                'font-size':12,fill:color,
                'font-family':'serif'}));
        else if(note.accidental==='flat')
            g.appendChild(tx('♭',{x:nx-13,y:ny+5,
                'font-size':13,fill:color,
                'font-family':'serif'}));
        else if(note.accidental==='natural')
            g.appendChild(tx('♮',{x:nx-13,y:ny+4,
                'font-size':12,fill:color,
                'font-family':'serif'}));
        if(note.dotted)
            g.appendChild(el('circle',{
                cx:nx+NR+5,cy:ny-2,r:2.5,fill:color}));
        for(let ly=sy-SL;ly>=ny-2;ly-=SL)
            g.appendChild(el('line',{
                x1:nx-10,y1:ly,x2:nx+10,y2:ly,
                stroke:'#000','stroke-width':0.9}));
        for(let ly=sy+SH+SL;ly<=ny+2;ly+=SL)
            g.appendChild(el('line',{
                x1:nx-10,y1:ly,x2:nx+10,y2:ly,
                stroke:'#000','stroke-width':0.9}));
    }

    // Large tap target
    g.appendChild(el('rect',{
        x:nx-20,y:ny-20,width:40,height:40,
        fill:'transparent',
        'data-id':String(note.id),
        'data-staff':staff.id
    }));
    svg.appendChild(g);
}

// ── Touch/Click ──
function attachSvgEvents(svg) {
    // Touch start — begin long press timer
    svg.addEventListener('touchstart',e=>{
        touchMoved=false;
        const t=e.touches[0];
        const target=e.target;
        const id=target.getAttribute('data-id');
        const sid=target.getAttribute('data-staff');

        if(id&&sid) {
            longPressTimer=setTimeout(()=>{
                if(!touchMoved) {
                    onLongPress(id,sid);
                }
            },500);
        }
    },{passive:true});

    svg.addEventListener('touchmove',()=>{
        touchMoved=true;
        clearLongPress();
    },{passive:true});

    svg.addEventListener('touchend',e=>{
        e.preventDefault();
        clearLongPress();
        if(touchMoved) return;
        const t=e.changedTouches[0];
        const target=e.target;
        const id=target.getAttribute('data-id');
        const sid=target.getAttribute('data-staff');
        const wrap=document.getElementById('scoreWrapper');
        const rect=wrap.getBoundingClientRect();
        const svgX=t.clientX-rect.left+wrap.scrollLeft;
        const svgY=t.clientY-rect.top+wrap.scrollTop;
        onTap(t.clientX,t.clientY,svgX,svgY,id,sid);
    },{passive:false});

    svg.addEventListener('click',e=>{
        const id=e.target.getAttribute('data-id');
        const sid=e.target.getAttribute('data-staff');
        const wrap=document.getElementById('scoreWrapper');
        const rect=wrap.getBoundingClientRect();
        const svgX=e.clientX-rect.left+wrap.scrollLeft;
        const svgY=e.clientY-rect.top+wrap.scrollTop;
        onTap(e.clientX,e.clientY,svgX,svgY,id,sid);
    });
}

function clearLongPress() {
    if(longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer=null;
    }
}

function onLongPress(noteId,staffId) {
    const staff=STAVES.find(s=>s.id===staffId);
    if(!staff||!staff.editable) return;
    selNote={staffId,noteId};
    drawScore();
    showNoteEditPanel(staffId,noteId);
}

function showNoteEditPanel(staffId,noteId) {
    const n=findNote(staffId,noteId);
    if(!n) return;
    const staff=STAVES.find(s=>s.id===staffId);
    const pitch=staff?staff.pitches[n.pitchIndex]||'?':'?';

    // Remove existing panel if any
    const old=document.getElementById('editPanel');
    if(old) old.remove();

    const panel=document.createElement('div');
    panel.id='editPanel';
    panel.style.cssText=`
        position:fixed;bottom:70px;left:0;right:0;
        background:#1A2A3A;border-top:2px solid #F9A825;
        padding:10px;z-index:200;
        display:flex;flex-wrap:wrap;gap:6px;
        align-items:center;`;

    panel.innerHTML=`
        <span style="color:#F9A825;font-size:13px;
            font-weight:bold">
            ✏️ ${pitch} ${n.duration}${n.dotted?'•':''}
        </span>
        <button class="epbtn" data-action="erase"
            style="background:#B71C1C">🗑 Erase</button>
        <button class="epbtn" data-action="dur-whole">𝅝</button>
        <button class="epbtn" data-action="dur-half">𝅗𝅥</button>
        <button class="epbtn" data-action="dur-quarter">♩</button>
        <button class="epbtn" data-action="dur-eighth">♪</button>
        <button class="epbtn" data-action="dur-sixteenth">𝅘𝅥𝅯</button>
        <button class="epbtn" data-action="acc-sharp">♯</button>
        <button class="epbtn" data-action="acc-flat">♭</button>
        <button class="epbtn" data-action="acc-nat">♮</button>
        <button class="epbtn" data-action="dot">•</button>
        <button class="epbtn" data-action="close"
            style="background:#333;margin-left:auto">✕</button>
    `;

    // Style all buttons
    panel.querySelectorAll('.epbtn').forEach(b=>{
        b.style.cssText=`
            background:#2A4A6A;color:white;
            border:1px solid #446;border-radius:4px;
            padding:7px 11px;font-size:14px;
            cursor:pointer;touch-action:manipulation;`;
        ['click','touchend'].forEach(ev=>{
            b.addEventListener(ev,e=>{
                e.preventDefault();
                e.stopPropagation();
                handleEditAction(
                    b.dataset.action,staffId,noteId);
            },{passive:false});
        });
    });

    document.body.appendChild(panel);
    setStatus(`Editing: ${pitch} ${n.duration} — choose action`);
}

function handleEditAction(action,staffId,noteId) {
    const n=findNote(staffId,noteId);
    if(!n&&action!=='close') return;

    if(action==='erase') {
        eraseNote(staffId,noteId);
        closeEditPanel();
        // Stay in edit mode for next note
        eraseMode=true;
        setStatus('Note erased — long press another note to erase');
        return;
    }
    if(action==='close') {
        closeEditPanel();
        selNote=null;
        eraseMode=false;
        drawScore();
        setStatus('Edit closed');
        return;
    }
    if(action.startsWith('dur-')) {
        n.duration=action.replace('dur-','');
        n.isRest=false;
    }
    if(action==='acc-sharp') n.accidental='sharp';
    if(action==='acc-flat')  n.accidental='flat';
    if(action==='acc-nat')   n.accidental='natural';
    if(action==='dot')       n.dotted=!n.dotted;

    saveScore();
    drawScore();
    // Refresh panel with new values
    closeEditPanel();
    showNoteEditPanel(staffId,noteId);
}

function closeEditPanel() {
    const p=document.getElementById('editPanel');
    if(p) p.remove();
}

function onTap(cx,cy,svgX,svgY,tapId,tapSid) {
    // If tapped on a note
    if(tapId&&tapSid) {
        const staff=STAVES.find(s=>s.id===tapSid);
        if(!staff) return;

        if(eraseMode&&staff.editable) {
            eraseNote(tapSid,tapId);
            // Don't exit erase mode — keep erasing
            setStatus('Note erased — tap another to erase, or tap 🗑 again to stop');
            return;
        }

        if(staff.editable) {
            if(selNote&&selNote.staffId===tapSid&&
               selNote.noteId===tapId) {
                // Second tap — apply current palette settings
                applyPaletteToNote(tapSid,tapId);
            } else {
                selNote={staffId:tapSid,noteId:tapId};
                closeEditPanel();
                drawScore();
                const n=findNote(tapSid,tapId);
                if(n) {
                    const p=staff.pitches[n.pitchIndex]||'?';
                    setStatus(`Tap again to apply ${selDur}, long-press to edit`);
                }
            }
            return;
        }
    }

    // Tapped empty space
    selNote=null;
    closeEditPanel();
    if(!eraseMode) placeNoteAt(svgX,svgY);
}

function applyPaletteToNote(staffId,noteId) {
    const n=findNote(staffId,noteId);
    if(!n) return;
    n.duration=selDur;
    n.dotted=useDot;
    n.isRest=selRest;
    if(useSharp) n.accidental='sharp';
    else if(useFlat) n.accidental='flat';
    else if(useNat) n.accidental='natural';
    selNote=null;
    closeEditPanel();
    saveScore();
    drawScore();
    setStatus('Note updated');
}

function findNote(staffId,noteId) {
    return (score[staffId]||[])
        .find(n=>String(n.id)===String(noteId));
}

function placeNoteAt(svgX,svgY) {
    for(let ln=0;ln<lineCount();ln++) {
        const sysY=50+ln*(systemH()+70);
        const sb=ln*BPL;
        const eb=Math.min(sb+BPL,totalBars);
        const first=ln===0;
        const hw=headW(first);
        for(let si=0;si<STAVES.length;si++) {
            const staff=STAVES[si];
            if(!staff.editable) continue;
            const sy=staffY(si,sysY);
            if(svgY<sy-35||svgY>sy+SH+35) continue;
            let bx=ML+hw;
            for(let b=sb;b<eb;b++) {
                if(svgX>=bx&&svgX<bx+BW) {
                    const pi=Math.round(
                        (sy+SH-svgY)/(SL/2));
                    addNote(staff.id,b,
                        Math.max(0,
                        Math.min(staff.pitches.length-1,pi)),
                        svgX-bx);
                    return;
                }
                bx+=BW;
            }
        }
    }
}

// ── Note CRUD ──
function addNote(staffId,bar,pitchIndex,beatX) {
    if(!score[staffId]) score[staffId]=[];
    score[staffId].push({
        id:Date.now()+Math.random(),
        bar,pitchIndex,beatX,
        duration:selDur,dotted:useDot,
        accidental:useSharp?'sharp':useFlat?'flat':
            useNat?'natural':null,
        isRest:selRest
    });
    saveScore();
    drawScore();
    const staff=STAVES.find(s=>s.id===staffId);
    const pitch=(!selRest&&staff)?
        (staff.pitches[pitchIndex]||'?'):'rest';
    setStatus(`Added: ${selDur}${useDot?'•':''} ${pitch} bar ${bar+1}`);
}

function eraseNote(staffId,noteId) {
    score[staffId]=(score[staffId]||[])
        .filter(n=>String(n.id)!==String(noteId));
    selNote=null;
    saveScore();
    drawScore();
}

// ── Playback ──
function stopAll() {
    if(voiceAudio){
        voiceAudio.pause();
        voiceAudio.currentTime=0;
        voiceAudio=null;
    }
    if(playCtx){
        try{playCtx.close();}catch(e){}
        playCtx=null;
    }
    updatePlayBtns();
    setStatus('⏹ Stopped');
}

function playVoiceOnly() {
    stopAll();
    if(!recUrl) return;
    voiceAudio=new Audio(recUrl);
    voiceAudio.play();
    voiceAudio.onended=()=>{
        voiceAudio=null;
        updatePlayBtns();
        setStatus('Playback complete');
    };
    document.getElementById('btnStopPlay').disabled=false;
    setStatus('▶ Playing voice...');
}

function playOrganOnly() {
    stopAll();
    if(!wafPlayer||!organFont){
        setStatus('Organ not ready');return;}
    const notes=score.organT||[];
    if(!notes.length){setStatus('No organ notes');return;}
    playCtx=new AudioContext();
    wafPlayer.loader.decodeAfterLoading(
        playCtx,'_tone_0190_Chaos_sf2_file');
    scheduleOrgan(playCtx,0,notes);
    document.getElementById('btnStopPlay').disabled=false;
    setStatus('▶ Playing organ...');
    const dur=calcTotalDur(notes);
    setTimeout(()=>{
        if(playCtx){playCtx=null;}
        updatePlayBtns();
        setStatus('Playback complete');
    },(dur+1)*1000);
}

function playBoth() {
    stopAll();
    if(!recUrl){setStatus('No voice recorded');return;}
    if(!wafPlayer||!organFont){
        setStatus('Organ not ready');return;}
    playCtx=new AudioContext();
    wafPlayer.loader.decodeAfterLoading(
        playCtx,'_tone_0190_Chaos_sf2_file');
    voiceAudio=new Audio(recUrl);
    voiceAudio.play();
    const notes=score.organT||[];
    if(notes.length) scheduleOrgan(playCtx,0,notes);
    voiceAudio.onended=()=>{
        voiceAudio=null;
        updatePlayBtns();
        setStatus('Playback complete');
    };
    document.getElementById('btnStopPlay').disabled=false;
    setStatus('▶ Playing voice + organ...');
}

function scheduleOrgan(ctx,delay,notes) {
    const bpb=parseInt(timeSig.split('/')[0]);
    const spb=60/bpm;
    const barDur=bpb*spb;
    notes.forEach(note=>{
        if(note.isRest) return;
        const staff=STAVES.find(s=>s.id==='organT');
        if(!staff) return;
        const pname=staff.pitches[note.pitchIndex];
        if(!pname) return;
        const midi=nameToMidi(pname);
        if(midi<0) return;
        const when=ctx.currentTime+delay+
            note.bar*barDur+(note.beatX/BW)*barDur;
        const dur=durToSec(note.duration,spb,note.dotted);
        wafPlayer.queueWaveTable(
            ctx,ctx.destination,organFont,
            when,midi,dur,0.85);
    });
}

function calcTotalDur(notes) {
    const bpb=parseInt(timeSig.split('/')[0]);
    const spb=60/bpm;
    const barDur=bpb*spb;
    return notes.reduce((max,n)=>{
        const t=n.bar*barDur+(n.beatX/BW)*barDur+
            durToSec(n.duration,spb,n.dotted);
        return t>max?t:max;
    },0);
}

function nameToMidi(name) {
    const ns=['C','C#','D','D#','E','F',
              'F#','G','G#','A','A#','B'];
    const note=name.slice(0,-1);
    const oct=parseInt(name.slice(-1));
    const ni=ns.indexOf(note);
    return ni<0?-1:ni+(oct+1)*12;
}

function durToSec(dur,spb,dotted) {
    return spb*(DUR_BEATS[dur]||1)*(dotted?1.5:1);
}

function updatePlayBtns() {
    const hasV=!!recUrl;
    const hasO=!!(score.organT&&score.organT.length);
    const playing=!!voiceAudio||!!playCtx;
    document.getElementById('btnPlayVoice').disabled=!hasV||playing;
    document.getElementById('btnPlayOrgan').disabled=!hasO||playing;
    document.getElementById('btnPlayBoth').disabled=
        (!hasV||!hasO)||playing;
    document.getElementById('btnStopPlay').disabled=!playing;
}

// ── Recording ──
async function startRec() {
    try {
        micStream=await navigator.mediaDevices
            .getUserMedia({audio:{
                echoCancellation:true,
                noiseSuppression:true,
                autoGainControl:true
            }});
        micCtx=new AudioContext({sampleRate:44100});
        analyser=micCtx.createAnalyser();
        analyser.fftSize=8192;
        micCtx.createMediaStreamSource(micStream)
            .connect(analyser);
        recChunks=[];
        mediaRec=new MediaRecorder(micStream);
        mediaRec.ondataavailable=e=>{
            if(e.data.size>0) recChunks.push(e.data);
        };
        mediaRec.onstop=()=>{
            const blob=new Blob(recChunks,
                {type:'audio/webm'});
            recUrl=URL.createObjectURL(blob);
            placeVoiceNotes();
        };
        mediaRec.start();
        recNotes=[];lastPitch=null;holdCnt=0;
        isRec=true;
        document.getElementById('btnRecord').disabled=true;
        document.getElementById('btnStop').disabled=false;
        setStatus('🔴 Recording — sing clearly!');
        pitchLoop();
    } catch(e) {
        setStatus('Mic error: '+e.message);
    }
}

function stopRec() {
    isRec=false;
    if(mediaRec&&mediaRec.state!=='inactive')
        mediaRec.stop();
    if(micStream) micStream.getTracks()
        .forEach(t=>t.stop());
    if(micCtx) micCtx.close();
    document.getElementById('btnRecord').disabled=false;
    document.getElementById('btnStop').disabled=true;
    setStatus('Processing '+recNotes.length+' notes...');
}

function pitchLoop() {
    if(!isRec) return;
    const buf=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let rms=0;
    for(let i=0;i<buf.length;i++) rms+=buf[i]*buf[i];
    rms=Math.sqrt(rms/buf.length);
    if(rms>0.0005) {
        const f=autocorr(buf,44100);
        if(f>80&&f<1200) {
            const note=freqToNote(f);
            if(note===lastPitch) {
                holdCnt++;
            } else {
                if(lastPitch&&holdCnt>=2) {
                    recNotes.push(lastPitch);
                    setStatus('🔴 '+recNotes.length+' notes');
                }
                lastPitch=note;holdCnt=1;
            }
        }
    }
    requestAnimationFrame(pitchLoop);
}

function autocorr(buf,sr) {
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
    const n=['C','C#','D','D#','E','F',
             'F#','G','G#','A','A#','B'];
    const midi=Math.round(12*Math.log2(freq/440)+69);
    return n[midi%12]+(Math.floor(midi/12)-1);
}

function findPitchIdx(name,pitches) {
    let i=pitches.indexOf(name);
    if(i>=0) return i;
    const base=name.slice(0,-1);
    const oct=parseInt(name.slice(-1));
    for(let d=1;d<=3;d++) {
        i=pitches.indexOf(base+(oct+d));
        if(i>=0) return i;
        i=pitches.indexOf(base+(oct-d));
        if(i>=0) return i;
    }
    return 7;
}

function placeVoiceNotes() {
    score.voice=[];
    score.organT=[];
    const bpb=parseInt(timeSig.split('/')[0]);
    const beatW=BW/bpb;
    let bar=0,beat=0;
    recNotes.forEach(name=>{
        const pi=findPitchIdx(name,TP);
        const bx=beat*beatW+beatW/2;
        const note={
            id:Date.now()+Math.random(),
            bar,pitchIndex:pi,beatX:bx,
            duration:'quarter',dotted:false,
            accidental:null,isRest:false
        };
        score.voice.push(note);
        score.organT.push({
            ...note,id:Date.now()+Math.random()
        });
        beat++;
        if(beat>=bpb){
            beat=0;bar++;
            if(bar>=totalBars) totalBars++;
        }
    });
    updatePlayBtns();
    saveScore();
    drawScore();
    setStatus('✅ '+recNotes.length+
        ' notes placed — long press any note to edit');
}

// ── Persistence ──
function saveScore() {
    try {
        localStorage.setItem('pvx_score',
            JSON.stringify(score));
        localStorage.setItem('pvx_meta',JSON.stringify(
            {keyIdx,timeSig,bpm,totalBars}));
    } catch(e){}
}

function loadScore() {
    try {
        const s=localStorage.getItem('pvx_score');
        if(s) score=JSON.parse(s);
        const m=localStorage.getItem('pvx_meta');
        if(m) {
            const meta=JSON.parse(m);
            keyIdx=meta.keyIdx||0;
            timeSig=meta.timeSig||'4/4';
            bpm=meta.bpm||120;
            totalBars=meta.totalBars||8;
            document.getElementById('keyDisplay')
                .textContent=KEY_NAMES[keyIdx]+' maj';
            document.getElementById('timeSig').value=timeSig;
            document.getElementById('bpmDisplay')
                .textContent=bpm+' BPM';
        }
    } catch(e){}
}

// ── Toolbar ──
function addBtn(id,fn) {
    const b=document.getElementById(id);
    if(!b) return;
    ['click','touchend'].forEach(ev=>{
        b.addEventListener(ev,e=>{
            e.preventDefault();
            e.stopPropagation();
            fn();
        },{passive:false});
    });
}

addBtn('btnRecord',startRec);
addBtn('btnStop',stopRec);
addBtn('btnPlayVoice',playVoiceOnly);
addBtn('btnPlayOrgan',playOrganOnly);
addBtn('btnPlayBoth',playBoth);
addBtn('btnStopPlay',stopAll);
addBtn('btnPrint',()=>window.print());
addBtn('btnAddBar',()=>{
    totalBars+=4;saveScore();drawScore();
    setStatus('Added 4 bars');
});
addBtn('btnKeyUp',()=>{
    keyIdx=(keyIdx+1)%12;
    document.getElementById('keyDisplay')
        .textContent=KEY_NAMES[keyIdx]+' maj';
    drawScore();
});
addBtn('btnKeyDown',()=>{
    keyIdx=((keyIdx-1)+12)%12;
    document.getElementById('keyDisplay')
        .textContent=KEY_NAMES[keyIdx]+' maj';
    drawScore();
});
document.getElementById('timeSig')
    .addEventListener('change',e=>{
        timeSig=e.target.value;saveScore();drawScore();
    });

addBtn('btnTapTempo',()=>{
    const now=Date.now();
    tapTimes.push(now);
    if(tapTimes.length>8) tapTimes.shift();
    if(tapTimes.length>1) {
        const avg=tapTimes.slice(1)
            .reduce((s,t,i)=>s+(t-tapTimes[i]),0)/
            (tapTimes.length-1);
        bpm=Math.round(60000/avg);
        document.getElementById('bpmDisplay')
            .textContent=bpm+' BPM';
    }
});

document.querySelectorAll('[data-dur]').forEach(btn=>{
    ['click','touchend'].forEach(ev=>{
        btn.addEventListener(ev,e=>{
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('[data-dur],[data-rest]')
                .forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            selDur=btn.dataset.dur;
            selRest=false;
            setStatus('Duration: '+selDur+
                (useDot?'•':''));
        },{passive:false});
    });
});

document.querySelectorAll('[data-rest]').forEach(btn=>{
    ['click','touchend'].forEach(ev=>{
        btn.addEventListener(ev,e=>{
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('[data-dur],[data-rest]')
                .forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            selDur=btn.dataset.rest;
            selRest=true;
            setStatus('Rest: '+selDur);
        },{passive:false});
    });
});

['btnSharp','btnFlat','btnNatural','btnDot','btnErase']
    .forEach(id=>{
        addBtn(id,()=>{
            const btn=document.getElementById(id);
            if(id==='btnSharp'){
                useSharp=!useSharp;useFlat=false;useNat=false;
                btn.classList.toggle('active',useSharp);
                document.getElementById('btnFlat')
                    .classList.remove('active');
                document.getElementById('btnNatural')
                    .classList.remove('active');
            } else if(id==='btnFlat'){
                useFlat=!useFlat;useSharp=false;useNat=false;
                btn.classList.toggle('active',useFlat);
                document.getElementById('btnSharp')
                    .classList.remove('active');
                document.getElementById('btnNatural')
                    .classList.remove('active');
            } else if(id==='btnNatural'){
                useNat=!useNat;useSharp=false;useFlat=false;
                btn.classList.toggle('active',useNat);
                document.getElementById('btnSharp')
                    .classList.remove('active');
                document.getElementById('btnFlat')
                    .classList.remove('active');
            } else if(id==='btnDot'){
                useDot=!useDot;
                btn.classList.toggle('active',useDot);
                setStatus('Dot '+(useDot?'ON':'OFF'));
            } else if(id==='btnErase'){
                eraseMode=!eraseMode;
                selNote=null;
                closeEditPanel();
                btn.classList.toggle('active',eraseMode);
                drawScore();
                setStatus(eraseMode?
                    '🗑 Erase mode ON — tap any note to erase. Tap 🗑 again to stop.':
                    'Erase mode OFF');
            }
        });
    });

// Print
const ps=document.createElement('style');
ps.textContent=`
@media print {
    #header,#recBar,#playBar,#noteBar,
    #status,#editPanel{display:none!important;}
    #scoreWrapper{overflow:visible!important;
        height:auto!important;background:white!important;}
    body{background:white!important;}
}`;
document.head.appendChild(ps);

function setStatus(msg) {
    const e=document.getElementById('status');
    if(e) e.textContent=msg;
}

// ── Boot ──
loadScore();
drawScore();
updatePlayBtns();

if('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js');
