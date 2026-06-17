let nextMeasureId = 1000;

function createBeat(index, rhythm = '8') {
  return { index, rhythm };
}

export function createPracticeMeasure(rhythms = ['8', '8', '8', '8']) {
  return {
    id: nextMeasureId++,
    timeSignature: { beats: rhythms.length || 4, unit: 4 },
    beats: rhythms.map((rhythm, index) => createBeat(index, rhythm))
  };
}

export function createPracticeScore(measureRhythms = [['8', '8', '8', '8']]) {
  return {
    id: `score-${Date.now()}`,
    kind: 'practice',
    title: '未命名鼓谱',
    measures: measureRhythms.map((rhythms) => createPracticeMeasure(rhythms))
  };
}

export function getMeasureBeatCount(measure) {
  return measure?.timeSignature?.beats ?? measure?.beats?.length ?? 4;
}

export function getBeatRhythm(measure, beatIndex) {
  return measure?.beats?.[beatIndex]?.rhythm ?? '4';
}

export function setBeatRhythm(measure, beatIndex, rhythm) {
  if (!measure?.beats?.[beatIndex]) return;
  measure.beats[beatIndex].rhythm = rhythm;
}

export function setMeasureBeatCount(measure, beatCount, defaultRhythm = '8') {
  if (!measure || !Number.isInteger(beatCount) || beatCount < 1) return;

  const nextBeats = [];
  for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
    nextBeats.push(createBeat(beatIndex, measure.beats?.[beatIndex]?.rhythm ?? defaultRhythm));
  }

  measure.timeSignature = {
    beats: beatCount,
    unit: measure.timeSignature?.unit ?? 4
  };
  measure.beats = nextBeats;
}

export function clonePracticeMeasure(measure) {
  return {
    id: measure.id,
    timeSignature: { ...measure.timeSignature },
    beats: measure.beats.map((beat) => ({ ...beat }))
  };
}
