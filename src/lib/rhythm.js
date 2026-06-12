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

  measures.forEach((measure, measureIndex) => {
    const measureOffsetTime = measureIndex * beatDuration * 4;
    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) {
      const subNotes = parseBeatSubdivisions(
        beatIndex,
        measure.rhythms[beatIndex],
        measureOffsetTime,
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
  });

  return flatNotes;
}

export function getShortestSubdivisionDuration(measures, bpm) {
  const quarterDuration = 60 / bpm;
  let shortest = quarterDuration;

  measures.forEach((measure) => {
    measure.rhythms.forEach((rhythm) => {
      let duration = quarterDuration;
      if (rhythm === '8') duration = quarterDuration / 2;
      else if (rhythm === '16') duration = quarterDuration / 4;
      else if (rhythm === '3') duration = quarterDuration / 3;
      else if (rhythm === '8_16_16') duration = quarterDuration / 4;
      else if (rhythm === 'rest') duration = Number.POSITIVE_INFINITY;
      shortest = Math.min(shortest, duration);
    });
  });

  return shortest;
}
