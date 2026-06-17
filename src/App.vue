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
const sessionPhase = ref('idle');
const currentStep = ref('setup');
const detectedHitCount = ref(0);
const ignoredHitCount = ref(0);
const matchedCycleNoteKeys = ref(new Set());
const metronomeVolumePercent = ref(100);
const recentMetronomeClickTimes = ref([]);
const metronomeClickHistory = ref([]);
const rawCapturedHits = ref([]);
const recordingStartTime = ref(0);
const recordingEndTime = ref(0);
const sessionStopTimeoutId = ref(null);
const analyzedExpectedCount = ref(0);
const analyzedLatencyMs = ref(null);
const analyzedMeasures = ref([]);
const analyzedNoteVisualStates = ref({});

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

const displayedExpectedNoteCount = computed(() => (state.isRunning.value ? expectedNoteCount.value : analyzedExpectedCount.value));

const displayedMeasures = computed(() => (state.isRunning.value || !analyzedMeasures.value.length ? state.measures.value : analyzedMeasures.value));

const displayedNoteVisualStates = computed(() => (state.isRunning.value ? state.noteVisualStates : analyzedNoteVisualStates.value));

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

  const aligned = records.length;
  const scored = perfect + good;
  const expected = displayedExpectedNoteCount.value;

  return {
    aligned,
    scored,
    expected,
    detected: detectedHitCount.value,
    ignored: ignoredHitCount.value,
    perfect,
    good,
    miss,
    avg: aligned ? Math.round(totalOffset / aligned) : null,
    accuracy: expected ? Math.round((scored / expected) * 100) : null
  };
});

const measureSummaries = computed(() => {
  if (!analyzedMeasures.value.length) return [];

  const summaries = analyzedMeasures.value.map((measure, index) => ({
    measureNumber: index + 1,
    expected: 0,
    aligned: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    avgOffset: null
  }));
  const offsetTotals = analyzedMeasures.value.map(() => 0);
  const expectedNotes = getExpectedNotesInWindow(recordingStartTime.value, recordingEndTime.value);

  expectedNotes.forEach((note) => {
    if (summaries[note.measureIndex]) summaries[note.measureIndex].expected += 1;
  });

  state.userHitRecords.value.forEach((record) => {
    const summary = summaries[record.measureIndex];
    if (!summary) return;

    summary.aligned += 1;
    offsetTotals[record.measureIndex] += Math.abs(record.offset);
    if (record.rating === 'perfect') summary.perfect += 1;
    else if (record.rating === 'good') summary.good += 1;
    else summary.miss += 1;
  });

  summaries.forEach((summary, index) => {
    if (summary.aligned) {
      summary.avgOffset = Math.round(offsetTotals[index] / summary.aligned);
    }
  });

  return summaries;
});

const coachingSummary = computed(() => {
  if (!state.userHitRecords.value.length || !measureSummaries.value.length) {
    return ['完成录音后，这里会给出按小节整理的练习建议。'];
  }

  const messages = [];
  const avgSignedOffset =
    Math.round(state.userHitRecords.value.reduce((sum, record) => sum + record.offset, 0) / state.userHitRecords.value.length);

  if (avgSignedOffset <= -20) {
    messages.push('整体偏快。先把击打重心往拍点后面放一点，尤其注意起拍不要抢。');
  } else if (avgSignedOffset >= 20) {
    messages.push('整体偏慢。可以把注意力放在节拍器前沿，提前准备落槌。');
  } else {
    messages.push('整体时值中心基本稳定，可以优先提升连续小节之间的一致性。');
  }

  const weakestMeasure = measureSummaries.value.reduce((worst, current) => {
    const currentRate = current.expected ? (current.perfect + current.good) / current.expected : 0;
    const worstRate = worst.expected ? (worst.perfect + worst.good) / worst.expected : 0;
    return currentRate < worstRate ? current : worst;
  }, measureSummaries.value[0]);

  if (weakestMeasure && weakestMeasure.expected) {
    messages.push(
      `第 ${weakestMeasure.measureNumber} 小节最不稳定。建议单独循环这一小节，先把每拍打匀，再回到完整录音。`
    );
  }

  const highMissMeasures = measureSummaries.value.filter((summary) => summary.expected && summary.miss / summary.expected >= 0.3);
  if (highMissMeasures.length) {
    messages.push(`有 ${highMissMeasures.length} 个小节的大偏差较多，建议先降 BPM 5 到 10 再练。`);
  } else {
    messages.push('大偏差不多，下一步可以保持 BPM 不变，优先把 Perfect 比例提上去。');
  }

  return messages;
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
  recentMetronomeClickTimes.value.push(time);
  metronomeClickHistory.value.push(time);
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

function getMeasureDurationSec() {
  return (60 / state.bpm.value) * 4;
}

function getSequenceDurationSec() {
  return getMeasureDurationSec() * state.measures.value.length;
}

function buildAnalyzedMeasures() {
  const baseMeasures = state.measures.value;
  if (!baseMeasures.length) return [];

  const startMeasureOffset = baseMeasures.length ? state.warmupMeasures.value % baseMeasures.length : 0;

  return Array.from({ length: state.recordingMeasures.value }, (_, index) => {
    const sourceMeasure = baseMeasures[(startMeasureOffset + index) % baseMeasures.length];
    return {
      id: `analysis-${index + 1}`,
      rhythms: [...sourceMeasure.rhythms]
    };
  });
}

function getExpectedNotesInWindow(windowStartTime, windowEndTime) {
  const sequenceDuration = getSequenceDurationSec();
  if (!sequenceDuration || !state.flatSequenceNotes.value.length) return [];
  const measureDuration = getMeasureDurationSec();

  const firstCycleIndex = Math.floor((windowStartTime - sequenceStartAudioTime.value) / sequenceDuration) - 1;
  const lastCycleIndex = Math.ceil((windowEndTime - sequenceStartAudioTime.value) / sequenceDuration) + 1;
  const notes = [];

  for (let cycleIndex = firstCycleIndex; cycleIndex <= lastCycleIndex; cycleIndex += 1) {
    state.flatSequenceNotes.value.forEach((note) => {
      if (note.isRest) return;

      const absoluteTime = sequenceStartAudioTime.value + cycleIndex * sequenceDuration + note.offsetFromSeqStart;
      if (absoluteTime < windowStartTime || absoluteTime >= windowEndTime) return;
      const recordedMeasureIndex = Math.floor((absoluteTime - windowStartTime) / measureDuration);
      const displayNoteId = `${recordedMeasureIndex}-${note.beatIndex}-${note.subIndex}`;

      notes.push({
        key: `${cycleIndex}:${note.uniqueId}`,
        cycleIndex,
        noteId: note.uniqueId,
        displayNoteId,
        absoluteTime,
        measureIndex: recordedMeasureIndex,
        beatIndex: note.beatIndex,
        subIndex: note.subIndex
      });
    });
  }

  notes.sort((left, right) => left.absoluteTime - right.absoluteTime);
  return notes;
}

function evaluateHitAlignment(rawHits, expectedNotes, latencyMs) {
  const missWindowMs = state.judgementProfile.value.missMs;
  const adjustedHits = rawHits.map((time) => time - latencyMs / 1000);
  const matchedKeys = new Set();
  const records = [];
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let totalAbs = 0;

  adjustedHits.forEach((adjustedTime, index) => {
    let best = null;

    expectedNotes.forEach((note) => {
      if (matchedKeys.has(note.key)) return;

      const diffMs = Math.round((adjustedTime - note.absoluteTime) * 1000);
      if (Math.abs(diffMs) > missWindowMs) return;

      if (!best || Math.abs(diffMs) < Math.abs(best.diffMs)) {
        best = { note, diffMs };
      }
    });

    if (!best) return;

    matchedKeys.add(best.note.key);
    totalAbs += Math.abs(best.diffMs);

    let rating = 'miss';
    if (Math.abs(best.diffMs) <= state.judgementProfile.value.perfectMs) {
      rating = 'perfect';
      perfect += 1;
    } else if (Math.abs(best.diffMs) <= state.judgementProfile.value.goodMs) {
      rating = 'good';
      good += 1;
    } else {
      miss += 1;
    }

    records.push({
      time: rawHits[index],
      offset: best.diffMs,
      rating,
      cycleIndex: best.note.cycleIndex,
      noteId: best.note.displayNoteId,
      measureIndex: best.note.measureIndex,
      beatIndex: best.note.beatIndex,
      subIndex: best.note.subIndex
    });
  });

  const score = perfect * 4 + good * 2 + miss;

  return {
    score,
    matched: records.length,
    totalAbs,
    records,
    ignored: rawHits.length - records.length
  };
}

function analyzeRecordedSession() {
  const expectedNotes = getExpectedNotesInWindow(recordingStartTime.value, recordingEndTime.value);
  analyzedExpectedCount.value = expectedNotes.length;
  analyzedMeasures.value = buildAnalyzedMeasures();
  analyzedNoteVisualStates.value = {};
  state.userHitRecords.value = [];
  ignoredHitCount.value = 0;
  analyzedLatencyMs.value = null;
  state.clearVisualStates();

  if (!rawCapturedHits.value.length || !expectedNotes.length) {
    realtimeFeedback.value = '录音已结束，但没有足够的数据可供分析。';
    return;
  }

  const { filteredHits, removedCount, bleedLatencyMs } = filterBleedHits(rawCapturedHits.value);

  if (!filteredHits.length) {
    detectedHitCount.value = rawCapturedHits.value.length;
    ignoredHitCount.value = 0;
    realtimeFeedback.value =
      bleedLatencyMs == null
        ? '分析完成，录音中没有检测到可用于评分的真实击打。'
        : `分析完成，检测到约 +${bleedLatencyMs}ms 的节拍器回灌，本次采集到的声音已全部过滤。`;
    return;
  }

  let bestResult = null;

  for (let latencyMs = -220; latencyMs <= 220; latencyMs += 2) {
    const result = evaluateHitAlignment(filteredHits, expectedNotes, latencyMs);
    if (
      !bestResult ||
      result.score > bestResult.score ||
      (result.score === bestResult.score && result.matched > bestResult.matched) ||
      (result.score === bestResult.score && result.matched === bestResult.matched && result.totalAbs < bestResult.totalAbs)
    ) {
      bestResult = { ...result, latencyMs };
    }
  }

  if (!bestResult) {
    realtimeFeedback.value = '录音已结束，但没有找到稳定的对齐结果。';
    return;
  }

  analyzedLatencyMs.value = bestResult.latencyMs;
  detectedHitCount.value = filteredHits.length;
  ignoredHitCount.value = bestResult.ignored;
  state.userHitRecords.value = bestResult.records;

  bestResult.records.forEach((record) => {
    analyzedNoteVisualStates.value[record.noteId] = {
      status: record.rating,
      offset: record.offset,
      timestamp: record.time
    };
  });

  realtimeFeedback.value = `分析完成，估计录音延迟 ${bestResult.latencyMs > 0 ? '+' : ''}${bestResult.latencyMs}ms，过滤串音 ${removedCount} 次。`;
  offsetMs.value = bestResult.records.length ? bestResult.records[bestResult.records.length - 1].offset : null;
}

function resetSession() {
  currentStep.value = 'setup';
  sessionPhase.value = 'idle';
  state.isRunning.value = false;
  activePlayhead.value = null;
  state.clearVisualStates();
  state.userHitRecords.value = [];
  matchedCycleNoteKeys.value = new Set();
  recentMetronomeClickTimes.value = [];
  metronomeClickHistory.value = [];
  rawCapturedHits.value = [];
  detectedHitCount.value = 0;
  ignoredHitCount.value = 0;
  analyzedExpectedCount.value = 0;
  analyzedLatencyMs.value = null;
  analyzedMeasures.value = [];
  analyzedNoteVisualStates.value = {};
  sessionElapsedSec.value = 0;
  realtimeFeedback.value = '等待训练开始…';
  offsetMs.value = null;
}

function processLiveDrumHit(hitTime) {
  if (!state.isRunning.value) return;

  const withinRecordingWindow = hitTime >= sequenceStartAudioTime.value && hitTime <= recordingEndTime.value;

  if (!withinRecordingWindow) return;

  rawCapturedHits.value.push(hitTime);
  detectedHitCount.value = rawCapturedHits.value.length;
  realtimeFeedback.value = `录音中，已采集 ${rawCapturedHits.value.length} 次击打，结束后将统一分析。`;
  offsetMs.value = null;
}

function pruneMatchedCycleNoteKeys(activeCycleIndex) {
  const nextKeys = new Set();

  matchedCycleNoteKeys.value.forEach((key) => {
    const separatorIndex = key.indexOf(':');
    const cycleIndex = Number.parseInt(key.slice(0, separatorIndex), 10);
    if (Number.isNaN(cycleIndex)) return;

    if (cycleIndex >= activeCycleIndex - 1) {
      nextKeys.add(key);
    }
  });

  matchedCycleNoteKeys.value = nextKeys;
}

function pruneRecentMetronomeClickTimes(now) {
  recentMetronomeClickTimes.value = recentMetronomeClickTimes.value.filter((time) => now - time <= 0.32);
}

function getMetronomeBleedStrength(hitTime) {
  for (const clickTime of recentMetronomeClickTimes.value) {
    const diffMs = (hitTime - clickTime) * 1000;

    if (diffMs >= -8 && diffMs <= 18) return 4.2;
    if (diffMs > 18 && diffMs <= 42) return 2.6;
    if (diffMs > 42 && diffMs <= 78) return 1.55;
    if (diffMs > 78 && diffMs <= 135) return 1.9;
    if (diffMs > 135 && diffMs <= 210) return 4.6;
    if (diffMs > 210 && diffMs <= 260) return 2.2;
  }

  return 1;
}

function getNearestMetronomeDeltaMs(hitTime) {
  if (!metronomeClickHistory.value.length) return null;

  let closestDiffMs = null;
  metronomeClickHistory.value.forEach((clickTime) => {
    const diffMs = Math.round((hitTime - clickTime) * 1000);
    if (closestDiffMs == null || Math.abs(diffMs) < Math.abs(closestDiffMs)) {
      closestDiffMs = diffMs;
    }
  });

  return closestDiffMs;
}

function filterBleedHits(rawHits) {
  if (!rawHits.length || !metronomeClickHistory.value.length) {
    return { filteredHits: rawHits, removedCount: 0, bleedLatencyMs: null };
  }

  const deltas = rawHits
    .map((time) => getNearestMetronomeDeltaMs(time))
    .filter((deltaMs) => deltaMs != null && deltaMs >= 40 && deltaMs <= 240);

  if (!deltas.length) {
    return { filteredHits: rawHits, removedCount: 0, bleedLatencyMs: null };
  }

  const buckets = new Map();
  deltas.forEach((deltaMs) => {
    const bucket = Math.round(deltaMs / 4) * 4;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });

  let dominantBucket = null;
  let dominantCount = 0;
  buckets.forEach((count, bucket) => {
    if (count > dominantCount) {
      dominantBucket = bucket;
      dominantCount = count;
    }
  });

  if (dominantBucket == null || dominantCount < Math.max(4, Math.ceil(rawHits.length * 0.35))) {
    return { filteredHits: rawHits, removedCount: 0, bleedLatencyMs: null };
  }

  const filteredHits = [];
  let removedCount = 0;

  rawHits.forEach((time) => {
    const deltaMs = getNearestMetronomeDeltaMs(time);
    if (deltaMs != null && Math.abs(deltaMs - dominantBucket) <= 18) {
      removedCount += 1;
      return;
    }
    filteredHits.push(time);
  });

  return {
    filteredHits,
    removedCount,
    bleedLatencyMs: dominantBucket
  };
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
  const inputGain = audioCtx.value.createGain();
  inputGain.gain.setValueAtTime(2.8, audioCtx.value.currentTime);

  const highpass = audioCtx.value.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(90, audioCtx.value.currentTime);
  highpass.Q.setValueAtTime(0.5, audioCtx.value.currentTime);

  const lowpass = audioCtx.value.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(6000, audioCtx.value.currentTime);
  lowpass.Q.setValueAtTime(0.5, audioCtx.value.currentTime);

  const analyser = audioCtx.value.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.05;
  source.connect(inputGain);
  inputGain.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  const sampleRate = audioCtx.value.sampleRate;
  const bufferDuration = dataArray.length / sampleRate;
  let lastEnergy = 0;
  let noiseFloor = 0.0006;
  let cooldownUntil = 0;
  let armed = true;
  let displayedLevel = 0;

  if (micAnimationFrameId.value) cancelAnimationFrame(micAnimationFrameId.value);

  const analyzeFrame = () => {
    if (!micStream.value) return;

    analyser.getByteTimeDomainData(dataArray);

    let energy = 0;
    let peak = 0;
    let flux = 0;
    let maxRise = 0;
    let onsetSample = 0;
    let previousAbs = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      const normalized = (dataArray[i] - 128) / 128;
      const absolute = Math.abs(normalized);
      const rise = absolute - previousAbs;

      energy += normalized * normalized;
      peak = Math.max(peak, absolute);
      if (rise > 0) {
        flux += rise;
      }
      if (rise > maxRise) {
        maxRise = rise;
        onsetSample = i;
      }

      previousAbs = absolute;
    }

    energy /= dataArray.length;
    const rms = Math.sqrt(energy);
    const level = Math.min(1, rms * 4.8);
    displayedLevel = level >= displayedLevel ? level : Math.max(level, displayedLevel * 0.88);
    inputLevel.value = Math.min(100, Math.round(displayedLevel * 100));

    const triggerLevel = state.amplitudeThreshold.value;
    const now = audioCtx.value.currentTime;
    const transientStrength = flux / dataArray.length;
    const energyRise = Math.max(0, energy - lastEnergy);
    const energyThreshold = noiseFloor * (1.02 + triggerLevel * 1.05) + 0.00004 + triggerLevel * 0.00032;
    const peakThreshold = 0.015 + triggerLevel * 0.06;
    const transientThreshold = 0.00014 + triggerLevel * 0.0017;
    const resetThreshold = noiseFloor * (0.98 + triggerLevel * 0.18) + 0.00002;
    const minEnergyRise = Math.max(noiseFloor * 0.04, transientThreshold * 0.03);
    const minMaxRise = transientThreshold * 0.92;

    pruneRecentMetronomeClickTimes(now);
    const bleedStrength = getMetronomeBleedStrength(now);
    if (energy <= resetThreshold) {
      armed = true;
    }

    if (bleedStrength === 1) {
      noiseFloor = noiseFloor * 0.985 + energy * 0.015;
    } else {
      noiseFloor = noiseFloor * 0.996 + energy * 0.004;
    }

    if (
      state.isRunning.value &&
      armed &&
      now >= cooldownUntil &&
      energy >= energyThreshold * bleedStrength &&
      peak >= peakThreshold * Math.min(2.6, bleedStrength * 1.18) &&
      transientStrength >= transientThreshold * Math.min(2.4, bleedStrength * 1.08) &&
      energyRise >= minEnergyRise * Math.min(1.9, bleedStrength * 0.92) &&
      maxRise >= minMaxRise * Math.min(1.8, bleedStrength * 0.88)
    ) {
      const onsetTime = now - bufferDuration + onsetSample / sampleRate;
      processLiveDrumHit(onsetTime);
      armed = false;
      cooldownUntil = now + state.micCooldownSeconds.value;
    }

    lastEnergy = energy;
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

  const totalSequence = getSequenceDurationSec();
  const elapsed = Math.max(0, audioCtx.value.currentTime - sequenceStartAudioTime.value);
  const currentCycleIndex = Math.floor(elapsed / totalSequence);
  const curSeqTime = elapsed % totalSequence;
  const warmupEndElapsed = recordingStartTime.value - sequenceStartAudioTime.value;
  const recordingEndElapsed = recordingEndTime.value - sequenceStartAudioTime.value;
  sessionElapsedSec.value = elapsed;
  pruneMatchedCycleNoteKeys(currentCycleIndex);

  if (elapsed < warmupEndElapsed) {
    sessionPhase.value = 'warmup';
    realtimeFeedback.value = `热身中，还剩 ${Math.max(0, Math.ceil((warmupEndElapsed - elapsed) / getMeasureDurationSec()))} 小节开始录音。`;
  } else if (elapsed < recordingEndElapsed) {
    sessionPhase.value = 'recording';
    realtimeFeedback.value = `录音中，已采集 ${rawCapturedHits.value.length} 次击打，结束后将统一分析。`;
  } else {
    sessionPhase.value = 'analyzing';
  }

  if (curSeqTime < lastRenderSeqTime.value) {
    state.clearVisualStates();
  }

  lastRenderSeqTime.value = curSeqTime;
  requestAnimationFrame(renderLoop);
}

async function toggleRun() {
  if (state.isRunning.value) {
    state.isRunning.value = false;
    sessionPhase.value = 'idle';
    currentStep.value = 'setup';
    realtimeFeedback.value = '训练已停止。';
    if (timerId.value) clearTimeout(timerId.value);
    if (sessionStopTimeoutId.value) clearTimeout(sessionStopTimeoutId.value);
    timerId.value = null;
    sessionStopTimeoutId.value = null;
    activePlayhead.value = null;
    recentMetronomeClickTimes.value = [];
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
    currentStep.value = 'training';
    sessionPhase.value = state.warmupMeasures.value > 0 ? 'warmup' : 'recording';
    state.clearVisualStates();
    state.userHitRecords.value = [];
    matchedCycleNoteKeys.value = new Set();
    recentMetronomeClickTimes.value = [];
    metronomeClickHistory.value = [];
    rawCapturedHits.value = [];
    detectedHitCount.value = 0;
    ignoredHitCount.value = 0;
    analyzedExpectedCount.value = 0;
    analyzedLatencyMs.value = null;
    analyzedMeasures.value = [];
    analyzedNoteVisualStates.value = {};
    sessionElapsedSec.value = 0;
    realtimeFeedback.value = '节拍器已同步，热身结束后开始录音。';
    offsetMs.value = null;
    sequenceStartAudioTime.value = audioCtx.value.currentTime + 0.15;
    recordingStartTime.value = sequenceStartAudioTime.value + state.warmupMeasures.value * getMeasureDurationSec();
    recordingEndTime.value = recordingStartTime.value + state.recordingMeasures.value * getMeasureDurationSec();
    nextNoteTime.value = sequenceStartAudioTime.value;
    currentQuarterIndex.value = 0;
    lastRenderSeqTime.value = 0;
    audioSchedulerLoop();
    renderLoop();
    sessionStopTimeoutId.value = window.setTimeout(() => {
      state.isRunning.value = false;
      sessionPhase.value = 'analyzing';
      if (timerId.value) clearTimeout(timerId.value);
      timerId.value = null;
      activePlayhead.value = null;
      analyzeRecordedSession();
      recentMetronomeClickTimes.value = [];
      sessionStopTimeoutId.value = null;
      sessionPhase.value = 'done';
      currentStep.value = 'results';
    }, Math.max(0, (recordingEndTime.value - audioCtx.value.currentTime + 0.12) * 1000));
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
    sessionPhase.value = 'idle';
    currentStep.value = 'setup';
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
  if (sessionStopTimeoutId.value) clearTimeout(sessionStopTimeoutId.value);
  if (micAnimationFrameId.value) cancelAnimationFrame(micAnimationFrameId.value);
  if (micStream.value) micStream.value.getTracks().forEach((track) => track.stop());
  if (audioCtx.value && audioCtx.value.state !== 'closed') audioCtx.value.close();
});
</script>

<template>
  <main class="page">
    <section v-if="currentStep === 'setup'" class="step-shell">
      <ControlPanel
        :bpm="state.bpm.value"
        :metronome-volume-percent="metronomeVolumePercent"
        :threshold-percent="thresholdPercent"
        :judgement-mode="state.judgementMode.value"
        :measures="state.measures.value"
        :warmup-measures="state.warmupMeasures.value"
        :recording-measures="state.recordingMeasures.value"
        :selected-measure-index="state.selectedMeasureIndex.value"
        :is-running="state.isRunning.value"
        :session-phase="sessionPhase"
        :session-toolbar-text="''"
        @update:bpm="state.bpm.value = $event"
        @update:metronome-volume-percent="metronomeVolumePercent = $event"
        @update:threshold-percent="thresholdPercent = $event"
        @update:judgement-mode="state.judgementMode.value = $event"
        @update:warmup-measures="state.warmupMeasures.value = $event"
        @update:recording-measures="state.recordingMeasures.value = $event"
        @select-measure="state.selectedMeasureIndex.value = $event"
        @update-rhythm="state.updateBeatRhythm"
        @add-measure="state.addMeasure"
        @delete-measure="state.deleteSelectedMeasure"
        @toggle-run="toggleRun"
      />
    </section>

    <section v-else-if="currentStep === 'training'" class="training-shell">
      <header class="training-header card">
        <div>
          <div class="training-kicker">训练中</div>
          <h2>{{ sessionPhase === 'warmup' ? '热身准备' : sessionPhase === 'recording' ? '正在录音' : '正在分析' }}</h2>
          <p>建议手机横屏使用，尽量让当前五线谱完整显示。</p>
        </div>
        <button class="primary-btn" type="button" @click="toggleRun">停止训练</button>
      </header>

      <section class="status-grid compact-status">
        <div class="status-card">
          <div class="status-label">麦克风</div>
          <div class="status-value">{{ micStatus }}</div>
        </div>
        <div class="status-card">
          <div class="status-label">输入电平</div>
          <div class="status-value mono">{{ inputLevel }}%</div>
        </div>
        <div class="status-card">
          <div class="status-label">当前状态</div>
          <div class="status-value">{{ realtimeFeedback }}</div>
        </div>
      </section>

      <section class="practice-viewport training-viewport">
        <StaffCanvas
          :bpm="state.bpm.value"
          :geometry="state.geometry"
          :measures="state.measures.value"
          :note-visual-states="state.noteVisualStates"
          :active-playhead="activePlayhead"
          :is-running="true"
        />
      </section>
    </section>

    <section v-else class="results-shell">
      <header class="results-header card">
        <div>
          <div class="training-kicker">训练结果</div>
          <h2>录音分析完成</h2>
          <p>{{ realtimeFeedback }}</p>
        </div>
        <button class="primary-btn" type="button" @click="resetSession">重新开始</button>
      </header>

      <section class="practice-viewport results-viewport">
        <StaffCanvas
          :bpm="state.bpm.value"
          :geometry="state.geometry"
          :measures="displayedMeasures"
          :note-visual-states="displayedNoteVisualStates"
          :active-playhead="null"
          :is-running="false"
        />
      </section>

      <ReportPanel
        :report="report"
        :judgement-profile="state.judgementProfile.value"
        :judgement-label="judgementLabel"
        :recording-measures="state.recordingMeasures.value"
        :analyzed-latency-ms="analyzedLatencyMs"
        :measure-summaries="measureSummaries"
        :coaching-summary="coachingSummary"
      />
    </section>
  </main>
</template>

<style scoped>
.page {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.step-shell,
.training-shell,
.results-shell {
  display: grid;
  gap: 16px;
}

.training-shell,
.results-shell {
  width: min(1360px, calc(100vw - 16px));
  margin: 0 auto;
}

.training-header,
.results-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px;
}

.training-header h2,
.results-header h2 {
  margin: 4px 0 0;
}

.training-header p,
.results-header p {
  margin: 8px 0 0;
  color: #a1a1aa;
  line-height: 1.5;
}

.training-kicker {
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.practice-viewport {
  scroll-margin-top: 16px;
}

.training-viewport,
.results-viewport {
  background: rgba(24, 24, 27, 0.82);
  border: 1px solid rgba(63, 63, 70, 0.7);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.compact-status {
  margin: 0;
}

@media (max-width: 900px) {
  .page,
  .training-shell,
  .results-shell {
    width: calc(100vw - 12px);
  }

  .training-header,
  .results-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
