<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import ReportPanel from './components/ReportPanel.vue';
import StaffCanvas from './components/StaffCanvas.vue';
import { useTrainerState } from './composables/useTrainerState.js';

const state = useTrainerState();

const audioCtx = ref(null);
const metronomeBus = ref(null);
const metronomeMasterGain = ref(null);
const timerId = ref(null);
const micStream = ref(null);
const micAnimationFrameId = ref(null);
const nextNoteTime = ref(0);
const currentQuarterIndex = ref(0);
const sequenceStartAudioTime = ref(0);
const lastRenderSeqTime = ref(0);

const realtimeFeedback = ref('等待训练开始…');
const offsetMs = ref(null);
const micStatus = ref('麦克风未激活');
const inputLevel = ref(0);
const activePlayhead = ref(null);
const sessionElapsedSec = ref(0);
const detectedHitCount = ref(0);
const ignoredHitCount = ref(0);
const matchedCycleNoteKeys = ref(new Set());
const metronomeVolumePercent = ref(100);

const thresholdPercent = computed({
  get: () => Math.round(state.amplitudeThreshold.value * 100),
  set: (value) => {
    state.amplitudeThreshold.value = value / 100;
  }
});

const judgementLabel = computed(() => state.judgementProfile.value.label);

const notesPerSequence = computed(() => state.flatSequenceNotes.value.filter((note) => !note.isRest).length);

const expectedNoteCount = computed(() => {
  const totalSequenceSec = (60 / state.bpm.value) * 4 * state.measures.value.length;
  if (!totalSequenceSec || !notesPerSequence.value) return 0;

  const elapsed = Math.max(0, sessionElapsedSec.value);
  const fullCycles = Math.floor(elapsed / totalSequenceSec);
  const remainder = elapsed % totalSequenceSec;
  const currentCycleNotes = state.flatSequenceNotes.value.filter(
    (note) => !note.isRest && note.offsetFromSeqStart <= remainder + state.judgementProfile.value.missMs / 1000
  ).length;

  return fullCycles * notesPerSequence.value + currentCycleNotes;
});

const report = computed(() => {
  const records = state.userHitRecords.value;
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let totalOffset = 0;

  records.forEach((record) => {
    totalOffset += Math.abs(record.offset);
    if (record.rating === 'perfect') perfect += 1;
    else if (record.rating === 'good') good += 1;
    else miss += 1;
  });

  const matched = records.length;
  const expected = expectedNoteCount.value;

  return {
    total: matched,
    expected,
    detected: detectedHitCount.value,
    ignored: ignoredHitCount.value,
    perfect,
    good,
    miss,
    avg: matched ? Math.round(totalOffset / matched) : null,
    accuracy: expected ? Math.round((matched / expected) * 100) : null
  };
});

function getPlayheadState(time) {
  if (!state.isRunning.value) return null;

  const totalMeasureSec = (60 / state.bpm.value) * 4;
  const totalSequenceSec = totalMeasureSec * state.measures.value.length;
  const elapsed = time - sequenceStartAudioTime.value;
  let localOffset = elapsed % totalSequenceSec;
  if (localOffset < 0) localOffset += totalSequenceSec;

  return {
    measureIndex: Math.floor(localOffset / totalMeasureSec),
    timeWithinMeasure: localOffset % totalMeasureSec,
    x:
      state.geometry.startX +
      ((localOffset % totalMeasureSec) / totalMeasureSec) * (state.geometry.endX - state.geometry.startX)
  };
}

function playQuarterMetronomeClick(beatIndex, time) {
  if (!audioCtx.value || !metronomeBus.value) return;

  const osc = audioCtx.value.createOscillator();
  const gain = audioCtx.value.createGain();
  osc.connect(gain);
  gain.connect(metronomeBus.value);

  const isMeasureStart = beatIndex % 4 === 0;
  if (isMeasureStart) {
    osc.type = 'square';
    osc.frequency.setValueAtTime(1760, time);
    gain.gain.setValueAtTime(0.65, time);
  } else {
    osc.type = 'square';
    osc.frequency.setValueAtTime(1440, time);
    gain.gain.setValueAtTime(0.52, time);
  }

  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
  osc.start(time);
  osc.stop(time + 0.065);
}

function metronomeVolumeToGain(volumePercent) {
  const clamped = Math.max(0, Math.min(300, volumePercent));
  const normalized = Math.min(clamped, 100) / 100;
  const baseGain = 0.08 + normalized * normalized * 5.2;

  if (clamped <= 100) return baseGain;

  const extraBoost = (clamped - 100) / 200;
  return baseGain * (1 + 2 * Math.pow(extraBoost, 1.2));
}

function ensureMetronomeBus() {
  if (!audioCtx.value || metronomeBus.value) return;

  const compressor = audioCtx.value.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-30, audioCtx.value.currentTime);
  compressor.knee.setValueAtTime(24, audioCtx.value.currentTime);
  compressor.ratio.setValueAtTime(4, audioCtx.value.currentTime);
  compressor.attack.setValueAtTime(0.002, audioCtx.value.currentTime);
  compressor.release.setValueAtTime(0.16, audioCtx.value.currentTime);

  const masterGain = audioCtx.value.createGain();
  masterGain.gain.setValueAtTime(metronomeVolumeToGain(metronomeVolumePercent.value), audioCtx.value.currentTime);

  compressor.connect(masterGain);
  masterGain.connect(audioCtx.value.destination);
  metronomeBus.value = compressor;
  metronomeMasterGain.value = masterGain;
}

function processLiveDrumHit(hitTime) {
  if (!state.isRunning.value || !state.flatSequenceNotes.value.length) return;

  detectedHitCount.value += 1;

  const totalMeasureSec = (60 / state.bpm.value) * 4;
  const totalSequenceSec = totalMeasureSec * state.measures.value.length;
  const elapsedSinceStart = hitTime - sequenceStartAudioTime.value;
  const currentCycleIndex = Math.floor(elapsedSinceStart / totalSequenceSec);
  const missWindowMs = state.judgementProfile.value.missMs;
  const candidates = [];

  state.flatSequenceNotes.value.forEach((note) => {
    if (note.isRest) return;

    [currentCycleIndex - 1, currentCycleIndex, currentCycleIndex + 1].forEach((cycleIndex) => {
      const absoluteTargetTime = sequenceStartAudioTime.value + cycleIndex * totalSequenceSec + note.offsetFromSeqStart;
      const diffMs = Math.round((hitTime - absoluteTargetTime) * 1000);
      if (Math.abs(diffMs) > missWindowMs) return;

      const cycleNoteKey = `${cycleIndex}:${note.uniqueId}`;
      candidates.push({
        note,
        cycleIndex,
        cycleNoteKey,
        diffMs,
        isMatched: matchedCycleNoteKeys.value.has(cycleNoteKey)
      });
    });
  });

  if (!candidates.length) {
    ignoredHitCount.value += 1;
    realtimeFeedback.value = '检测到了击打，但没有对齐到任何目标音符。';
    offsetMs.value = null;
    return;
  }

  candidates.sort((left, right) => {
    if (left.isMatched !== right.isMatched) return Number(left.isMatched) - Number(right.isMatched);
    return Math.abs(left.diffMs) - Math.abs(right.diffMs);
  });

  const chosen = candidates.find((candidate) => !candidate.isMatched);
  if (!chosen) {
    ignoredHitCount.value += 1;
    realtimeFeedback.value = '这一击靠近的目标音符已经记过了，未重复计数。';
    offsetMs.value = null;
    return;
  }

  matchedCycleNoteKeys.value.add(chosen.cycleNoteKey);

  let rating = 'miss';
  if (Math.abs(chosen.diffMs) <= state.judgementProfile.value.perfectMs) rating = 'perfect';
  else if (Math.abs(chosen.diffMs) <= state.judgementProfile.value.goodMs) rating = 'good';

  state.noteVisualStates[chosen.note.uniqueId] = {
    status: rating,
    offset: chosen.diffMs,
    timestamp: hitTime
  };

  state.userHitRecords.value.push({
    time: hitTime,
    offset: chosen.diffMs,
    rating,
    cycleIndex: chosen.cycleIndex,
    noteId: chosen.note.uniqueId
  });

  realtimeFeedback.value =
    rating === 'perfect'
      ? `Perfect ±${Math.abs(chosen.diffMs)}ms`
      : rating === 'good'
        ? chosen.diffMs < 0
          ? `稍快 ${chosen.diffMs}ms`
          : `稍慢 +${chosen.diffMs}ms`
        : chosen.diffMs < 0
          ? `偏快 ${chosen.diffMs}ms`
          : `偏慢 +${chosen.diffMs}ms`;
  offsetMs.value = chosen.diffMs;
}

async function initMicrophoneStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持麦克风访问。');
  }

  if (micStream.value) return micStream.value;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });

  micStream.value = stream;
  micStatus.value = '麦克风已激活，正在实时监听鼓点。';

  const source = audioCtx.value.createMediaStreamSource(stream);
  const analyser = audioCtx.value.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.15;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  let lastLevel = 0;
  let cooldownUntil = 0;
  let armed = true;

  if (micAnimationFrameId.value) cancelAnimationFrame(micAnimationFrameId.value);

  const analyzeFrame = () => {
    if (!micStream.value) return;

    analyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
      peak = Math.max(peak, Math.abs(normalized));
    }

    const rms = Math.sqrt(sumSquares / dataArray.length);
    const level = Math.max(rms * 2.9, peak * 1.25);
    inputLevel.value = Math.min(100, Math.round(level * 100));

    const triggerLevel = state.amplitudeThreshold.value;
    const resetLevel = triggerLevel * 0.58;
    const riseAmount = level - lastLevel;
    const now = audioCtx.value.currentTime;

    if (level <= resetLevel) {
      armed = true;
    }

    if (state.isRunning.value && armed && now >= cooldownUntil && level >= triggerLevel && riseAmount >= 0.012) {
      processLiveDrumHit(now);
      armed = false;
      cooldownUntil = now + state.micCooldownSeconds.value;
    }

    lastLevel = level;
    micAnimationFrameId.value = requestAnimationFrame(analyzeFrame);
  };

  analyzeFrame();
  return stream;
}

function audioSchedulerLoop() {
  const quarterDuration = 60 / state.bpm.value;

  while (nextNoteTime.value < audioCtx.value.currentTime + 0.1) {
    playQuarterMetronomeClick(currentQuarterIndex.value, nextNoteTime.value);
    nextNoteTime.value += quarterDuration;
    currentQuarterIndex.value += 1;
  }

  timerId.value = window.setTimeout(audioSchedulerLoop, 25);
}

function renderLoop() {
  if (!state.isRunning.value || !audioCtx.value) return;

  activePlayhead.value = getPlayheadState(audioCtx.value.currentTime);

  const totalSequence = (60 / state.bpm.value) * 4 * state.measures.value.length;
  const elapsed = Math.max(0, audioCtx.value.currentTime - sequenceStartAudioTime.value);
  const curSeqTime = elapsed % totalSequence;
  sessionElapsedSec.value = elapsed;

  if (curSeqTime < lastRenderSeqTime.value) {
    state.clearVisualStates();
  }

  lastRenderSeqTime.value = curSeqTime;
  requestAnimationFrame(renderLoop);
}

async function toggleRun() {
  if (state.isRunning.value) {
    state.isRunning.value = false;
    realtimeFeedback.value = '训练已停止。';
    if (timerId.value) clearTimeout(timerId.value);
    return;
  }

  try {
    if (!audioCtx.value) {
      audioCtx.value = new (window.AudioContext || window.webkitAudioContext)();
    }
    ensureMetronomeBus();

    await initMicrophoneStream();
    if (audioCtx.value.state === 'suspended') {
      await audioCtx.value.resume();
    }

    state.isRunning.value = true;
    state.clearVisualStates();
    state.userHitRecords.value = [];
    matchedCycleNoteKeys.value = new Set();
    detectedHitCount.value = 0;
    ignoredHitCount.value = 0;
    sessionElapsedSec.value = 0;
    realtimeFeedback.value = '节拍器已同步，请开始击打。';
    offsetMs.value = null;
    sequenceStartAudioTime.value = audioCtx.value.currentTime + 0.15;
    nextNoteTime.value = sequenceStartAudioTime.value;
    currentQuarterIndex.value = 0;
    lastRenderSeqTime.value = 0;
    audioSchedulerLoop();
    renderLoop();
  } catch (error) {
    micStatus.value = '麦克风启动失败';
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        realtimeFeedback.value = '麦克风权限被拒绝。请在浏览器站点设置里允许麦克风后重试。';
      } else if (error.name === 'NotFoundError') {
        realtimeFeedback.value = '没有检测到可用的麦克风设备。';
      } else if (error.name === 'SecurityError') {
        realtimeFeedback.value = '当前页面不是安全上下文。请改用 HTTPS，或在本机 localhost 打开页面。';
      } else {
        realtimeFeedback.value = error.message || '无法启动麦克风。';
      }
    } else {
      realtimeFeedback.value = error instanceof Error ? error.message : '无法启动麦克风。';
    }
    state.isRunning.value = false;
  }
}

watch(
  () => state.bpm.value,
  () => {
    activePlayhead.value = getPlayheadState(audioCtx.value?.currentTime ?? 0);
  }
);

watch(metronomeVolumePercent, (value) => {
  if (!audioCtx.value || !metronomeMasterGain.value) return;

  const now = audioCtx.value.currentTime;
  metronomeMasterGain.value.gain.cancelScheduledValues(now);
  metronomeMasterGain.value.gain.setValueAtTime(metronomeMasterGain.value.gain.value, now);
  metronomeMasterGain.value.gain.linearRampToValueAtTime(metronomeVolumeToGain(value), now + 0.03);
});

onBeforeUnmount(() => {
  if (timerId.value) clearTimeout(timerId.value);
  if (micAnimationFrameId.value) cancelAnimationFrame(micAnimationFrameId.value);
  if (micStream.value) micStream.value.getTracks().forEach((track) => track.stop());
  if (audioCtx.value && audioCtx.value.state !== 'closed') audioCtx.value.close();
});
</script>

<template>
  <main class="page">
    <ControlPanel
      :bpm="state.bpm.value"
      :metronome-volume-percent="metronomeVolumePercent"
      :threshold-percent="thresholdPercent"
      :judgement-mode="state.judgementMode.value"
      :measures="state.measures.value"
      :selected-measure-index="state.selectedMeasureIndex.value"
      :is-running="state.isRunning.value"
      @update:bpm="state.bpm.value = $event"
      @update:metronome-volume-percent="metronomeVolumePercent = $event"
      @update:threshold-percent="thresholdPercent = $event"
      @update:judgement-mode="state.judgementMode.value = $event"
      @select-measure="state.selectedMeasureIndex.value = $event"
      @update-rhythm="state.updateBeatRhythm"
      @add-measure="state.addMeasure"
      @delete-measure="state.deleteSelectedMeasure"
      @toggle-run="toggleRun"
    />

    <section class="status-grid">
      <div class="status-card">
        <div class="status-label">麦克风状态</div>
        <div class="status-value">{{ micStatus }}</div>
      </div>
      <div class="status-card">
        <div class="status-label">输入电平</div>
        <div class="status-value mono">{{ inputLevel }}%</div>
      </div>
      <div class="status-card">
        <div class="status-label">实时反馈</div>
        <div class="status-value">{{ realtimeFeedback }}</div>
      </div>
      <div class="status-card">
        <div class="status-label">最近偏差</div>
        <div class="status-value mono">{{ offsetMs == null ? '-- ms' : `${offsetMs > 0 ? '+' : ''}${offsetMs} ms` }}</div>
      </div>
    </section>

    <StaffCanvas
      :bpm="state.bpm.value"
      :geometry="state.geometry"
      :measures="state.measures.value"
      :note-visual-states="state.noteVisualStates"
      :active-playhead="activePlayhead"
      :is-running="state.isRunning.value"
    />

    <ReportPanel :report="report" :judgement-profile="state.judgementProfile.value" :judgement-label="judgementLabel" />
  </main>
</template>

<style scoped>
.page {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}
</style>
