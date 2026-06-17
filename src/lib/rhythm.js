import { getBeatRhythm, getMeasureBeatCount } from '../domain/score/model.js';

export function parseBeatSubdivisions(beatIndex, type, measureStartTime, quarterDuration, beatWidth, startX) {
  const subNotes = [];
  const leftX = startX + beatIndex * beatWidth;

  if (type === '4') {
    subNotes.push({ time: measureStartTime, x: leftX + beatWidth / 2, type: '4', isRest: false, id: `${beatIndex}-0` });
  } else if (type === '8') {
    subNotes.push({ time: measureStartTime, x: leftX + beatWidth / 4, type: '8', isRest: false, id: `${beatIndex}-0` });
    subNotes.push({ time: measureStartTime + quarterDuration / 2, x: leftX + (beatWidth * 3) / 4, type: '8', isRest: false, id: `${beatIndex}-1` });
  } else if (type === '16') {
    for (let i = 0; i < 4; i += 1) {
      subNotes.push({
        time: measureStartTime + (quarterDuration / 4) * i,
        x: leftX + (beatWidth / 8) * (1 + i * 2),
        type: '16',
        isRest: false,
        id: `${beatIndex}-${i}`
      });
    }
  } else if (type === '3') {
    for (let i = 0; i < 3; i += 1) {
      subNotes.push({
        time: measureStartTime + (quarterDuration / 3) * i,
        x: leftX + (beatWidth / 6) * (1 + i * 2),
        type: '3',
        isRest: false,
        id: `${beatIndex}-${i}`
      });
    }
  } else if (type === '8_16_16') {
    subNotes.push({ time: measureStartTime, x: leftX + beatWidth / 4, type: '8', isRest: false, id: `${beatIndex}-0` });
    subNotes.push({ time: measureStartTime + quarterDuration / 2, x: leftX + (beatWidth * 5) / 8, type: '16', isRest: false, id: `${beatIndex}-1` });
    subNotes.push({ time: measureStartTime + (quarterDuration * 3) / 4, x: leftX + (beatWidth * 7) / 8, type: '16', isRest: false, id: `${beatIndex}-2` });
  } else if (type === 'rest') {
    subNotes.push({ time: measureStartTime, x: leftX + beatWidth / 2, type: '4', isRest: true, id: `${beatIndex}-0` });
  }

  return subNotes;
}

export function buildFlatSequenceNotes(measures, bpm, geometry) {
  const beatDuration = 60 / bpm;
  const flatNotes = [];
  let measureOffsetTime = 0;

  measures.forEach((measure, measureIndex) => {
    const beatCount = getMeasureBeatCount(measure);
    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      const beatStartTime = measureOffsetTime + beatIndex * beatDuration;
      const subNotes = parseBeatSubdivisions(
        beatIndex,
        getBeatRhythm(measure, beatIndex),
        beatStartTime,
        beatDuration,
        geometry.beatWidth,
        geometry.startX
      );

      subNotes.forEach((node) => {
        flatNotes.push({
          uniqueId: `${measureIndex}-${beatIndex}-${node.id.split('-')[1]}`,
          measureIndex,
          beatIndex,
          subIndex: Number.parseInt(node.id.split('-')[1], 10),
          offsetFromSeqStart: node.time,
          type: node.type,
          isRest: node.isRest
        });
      });
    }

    measureOffsetTime += beatCount * beatDuration;
  });

  return flatNotes;
}

export function getMeasureDurationSec(measure, bpm) {
  return getMeasureBeatCount(measure) * (60 / bpm);
}

export function getSequenceDurationSec(measures, bpm) {
  return measures.reduce((total, measure) => total + getMeasureDurationSec(measure, bpm), 0);
}

export function buildLoopedMeasureTimeline(measures, bpm, measureCount, startMeasureOffset = 0) {
  if (!measures.length || measureCount <= 0) return [];

  const timeline = [];
  let startSec = 0;
  for (let index = 0; index < measureCount; index += 1) {
    const sourceMeasureIndex = (startMeasureOffset + index) % measures.length;
    const sourceMeasure = measures[sourceMeasureIndex];
    const durationSec = getMeasureDurationSec(sourceMeasure, bpm);

    timeline.push({
      index,
      sourceMeasure,
      sourceMeasureIndex,
      startSec,
      durationSec,
      endSec: startSec + durationSec
    });
    startSec += durationSec;
  }

  return timeline;
}

export function getLoopedDurationSec(measures, bpm, measureCount, startMeasureOffset = 0) {
  const timeline = buildLoopedMeasureTimeline(measures, bpm, measureCount, startMeasureOffset);
  return timeline.length ? timeline[timeline.length - 1].endSec : 0;
}

export function findMeasureAtSequenceOffset(measures, bpm, offsetSec) {
  if (!measures.length) return null;

  let cursor = 0;
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const durationSec = getMeasureDurationSec(measures[measureIndex], bpm);
    if (offsetSec < cursor + durationSec || measureIndex === measures.length - 1) {
      return {
        measureIndex,
        measure: measures[measureIndex],
        measureStartSec: cursor,
        durationSec
      };
    }
    cursor += durationSec;
  }

  return null;
}

export function getShortestSubdivisionDuration(measures, bpm) {
  const quarterDuration = 60 / bpm;
  let shortest = quarterDuration;

  measures.forEach((measure) => {
    const beatCount = getMeasureBeatCount(measure);
    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      const rhythm = getBeatRhythm(measure, beatIndex);
      let duration = quarterDuration;
      if (rhythm === '8') duration = quarterDuration / 2;
      else if (rhythm === '16') duration = quarterDuration / 4;
      else if (rhythm === '3') duration = quarterDuration / 3;
      else if (rhythm === '8_16_16') duration = quarterDuration / 4;
      else if (rhythm === 'rest') duration = Number.POSITIVE_INFINITY;
      shortest = Math.min(shortest, duration);
    }
  });

  return shortest;
}
