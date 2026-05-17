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
let pitchTimeline = [];
let recordingStartTime = 0;
let player = null;
let organFont = null;

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

function initAudioFont() {
    try {
        const ctx = new AudioContext();
        player = new WebAudioFontPlayer();
        organFont = _tone_0190_Chaos_sf2_file;
        player.loader.decodeAfterLoading(ctx, '_tone_0190_Chaos_sf2_file');
        setStatus('✅ Ready to record');
        document.getElementById('btnRecord').disabled = false;
    } catch(e) {
        setStatus('Error loading organ: ' + e.message);
    }
}

window.addEventListener('load', () => {
    setTimeout(initAudioFont, 500);
});

document.getElementById('btnRecord').addEventListener('click', startRecording);
document.getElementById('btnStop').addEventListener('click', stopRecording);
document.getElementById('btnGenerate').addEventListener('click', generateScore);

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
        pitchTimeline = [];
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
        recordingStartTime = performance.now();
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
    const elapsed = (performance.now() - recordingStartTime) / 1000;
    if(rms > 0.001) {
        const pitch = autocorrelate(buffer, SAMPLE_RATE);
        if(pitch > 80 && pitch < 1200) {
            const last = pitchTimeline[pitchTimeline.length-1];
            const changed = !last || last.freq === 0 ||
                Math.abs(pitch - last.freq) / last.freq > 0.02;
            if(changed) {
                pitchTimeline.push({time: elapsed, freq: pitch});
            }
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
        } else {
            const last = pitchTimeline[pitchTimeline.length-1];
            if(!last || last.freq !== 0) {
                pitchTimeline.push({time: elapsed, freq: 0});
            }
        }
    } else {
        const last = pitchTimeline[pitchTimeline.length-1];
        if(!last || last.freq !== 0) {
            pitchTimeline.push({time: elapsed, freq: 0});
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

function freqToMidi(freq) {
    if(freq<=0) return -1;
    return Math.round(12*Math.log2(freq/440)+69);
}

function groupPitchTimeline(timeline) {
    if(timeline.length === 0) return [];
    const groups = [];
    let current = null;
    timeline.forEach(point => {
        const midi = point.freq > 0 ? freqToMidi(point.freq) : -1;
        if(!current) {
            current = {
                startTime: point.time,
                freq: point.freq,
                midi: midi
            };
        } else if(midi !== current.midi) {
            current.endTime = point.time;
            groups.push(current);
            current = {
                startTime: point.time,
                freq: point.freq,
                midi: midi
            };
        }
    });
    if(current) {
        current.endTime = timeline[timeline.length-1].time + 0.1;
        groups.push(current);
    }
    return groups.filter(g =>
        g.freq > 0 && (g.endTime - g.startTime) > 0.05);
}

function generateScore() {
    if(pitchTimeline.length === 0) {
        setStatus('⚠️ No notes detected!');
        return;
    }
    currentNotes = {
        vocal: recordedNotes.slice(),
        organ: recordedNotes.slice()
    };
    renderStaffs();
    setStatus('🎼 ' + recordedNotes.length + ' notes generated!');
}

function renderStaffs() {
    const sc = document.getElementById('staffContainer');
    sc.innerHTML = '';

    const pb = document.createElement('button');
    pb.className = 'btn';
    pb.style.cssText = 'background:#F9A825;color:black;margin-bottom:8px';
    pb.textContent = '▶ Play Voice + Organ Together';
    pb.onclick = playAll;
    sc.appendChild(pb);

    if(recordedUrl) {
        const vocalDiv = document.createElement('div');
        vocalDiv.className = 'staff';
        vocalDiv.innerHTML =
            '<div class="staff-header">'+
            '<span class="staff-label" style="color:#F9A825">🎤 Your Voice</span>'+
            '<div class="staff-controls">'+
            '<button class="btn-play" onclick="playVoice()">▶</button>'+
            '</div></div>'+
            '<audio controls style="width:100%;margin-top:8px" src="'+
            recordedUrl+'"></audio>'+
            '<div class="notes" style="margin-top:8px">'+
            (currentNotes.vocal||[]).join(' ')+'</div>';
        sc.appendChild(vocalDiv);
    }

    const organDiv = document.createElement('div');
    organDiv.className = 'staff';
    organDiv.innerHTML =
        '<div class="staff-header">'+
        '<span class="staff-label" style="color:#4CAF50">🎹 Organ</span>'+
        '<div class="staff-controls">'+
        '<button class="btn-play" onclick="playOrgan()">▶</button>'+
        '<button class="btn-manual" onclick="toggleManual()">✏️</button>'+
        '</div></div>'+
        '<div class="notes" id="notes-organ">'+
        (currentNotes.organ||[]).join(' ')+'</div>'+
        '<textarea id="input-organ" class="manual-input" '+
        'placeholder="Type notes e.g. C4 D4 E4 F4" '+
        'onchange="updateOrganManual()"></textarea>';
    sc.appendChild(organDiv);
}

function playVoice() {
    if(!recordedUrl) return;
    const audio = new Audio(recordedUrl);
    audio.play();
}

function playOrgan() {
    if(!player || !organFont || pitchTimeline.length === 0) return;
    const ctx = new AudioContext();
    const groups = groupPitchTimeline(pitchTimeline);
    if(groups.length === 0) return;
    const firstTime = groups[0].startTime;

    groups.forEach(group => {
        const when = ctx.currentTime + (group.startTime - firstTime);
        const duration = group.endTime - group.startTime;
        player.queueWaveTable(
            ctx,
            ctx.destination,
            organFont,
            when,
            group.midi,
            duration,
            0.8
        );
    });
}

function playAll() {
    if(recordedUrl) {
        const audio = new Audio(recordedUrl);
        audio.play();
    }
    playOrgan();
}

function toggleManual() {
    const input = document.getElementById('input-organ');
    input.style.display =
        input.style.display === 'block' ? 'none' : 'block';
}

function updateOrganManual() {
    const val = document.getElementById('input-organ').value;
    const notes = val.trim().split(/\s+/);
    currentNotes.organ = notes;
    document.getElementById('notes-organ').textContent = val;
    pitchTimeline = buildTimelineFromNotes(notes);
}

function buildTimelineFromNotes(notes) {
    const timeline = [];
    const dur = 0.5;
    const n=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    notes.forEach((note, i) => {
        const name = note.slice(0,-1);
        const oct = parseInt(note.slice(-1));
        if(isNaN(oct)) return;
        const midi = n.indexOf(name)+(oct+1)*12;
        const freq = 440*Math.pow(2,(midi-69)/12);
        timeline.push({time: i*dur, freq: freq});
        timeline.push({time: i*dur + dur, freq: 0});
    });
    return timeline;
}

if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
