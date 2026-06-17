<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { parseBeatSubdivisions } from '../lib/rhythm.js';

const props = defineProps({
  bpm: Number,
  geometry: Object,
  measures: Array,
  noteVisualStates: Object,
  activePlayhead: Object,
  isRunning: Boolean,
  measureNumberOffset: {
    type: Number,
    default: 0
  }
});

const canvasRef = ref(null);
const hostRef = ref(null);

const requiredHeight = computed(() => props.measures.length * props.geometry.staffHeight + 40);

function getNotePalette(vState, isCurPlaying) {
  if (vState?.status === 'perfect') {
    return { fill: '#22c55e', stroke: '#15803d' };
  }
  if (vState?.status === 'good') {
    return { fill: '#fbbf24', stroke: '#b45309' };
  }
  if (vState?.status === 'miss') {
    return { fill: '#f97316', stroke: '#c2410c' };
  }
  if (isCurPlaying && props.isRunning) {
    return { fill: '#22d3ee', stroke: '#0f766e' };
  }

  return { fill: '#f4f4f5', stroke: '#d4d4d8' };
}

function drawNoteHead(ctx, x, y, palette, filled = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 6);
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 5.2, 0, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = palette.fill;
    ctx.fill();
  } else {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = palette.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStem(ctx, x, y, palette, direction = 'up', length = 28) {
  const stemX = direction === 'up' ? x + 5.5 : x - 5.5;
  const stemTop = direction === 'up' ? y - length : y + length;
  ctx.beginPath();
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 1.8;
  ctx.moveTo(stemX, y - 0.5);
  ctx.lineTo(stemX, stemTop);
  ctx.stroke();
  return { stemX, stemTop };
}

function drawFlag(ctx, stemX, stemTop, palette, count = 1) {
  for (let i = 0; i < count; i += 1) {
    const y = stemTop + i * 7;
    ctx.beginPath();
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2;
    ctx.moveTo(stemX, y);
    ctx.quadraticCurveTo(stemX + 10, y + 3, stemX + 8, y + 12);
    ctx.stroke();
  }
}

function drawBeam(ctx, leftStemX, rightStemX, y, palette, level = 0) {
  const beamTop = y + level * 7;
  const beamBottom = beamTop + 5;
  ctx.fillStyle = palette.stroke;
  ctx.beginPath();
  ctx.moveTo(leftStemX, beamTop);
  ctx.lineTo(rightStemX, beamTop);
  ctx.lineTo(rightStemX, beamBottom);
  ctx.lineTo(leftStemX, beamBottom);
  ctx.closePath();
  ctx.fill();
}

function drawRest(ctx, x, y, type) {
  ctx.save();
  ctx.strokeStyle = '#fca5a5';
  ctx.fillStyle = '#fca5a5';
  ctx.lineWidth = 2;

  if (type === '4') {
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 10);
    ctx.lineTo(x + 2, y - 2);
    ctx.lineTo(x - 4, y + 5);
    ctx.lineTo(x + 3, y + 14);
    ctx.stroke();
  } else {
    ctx.fillRect(x - 7, y - 2, 14, 4);
  }

  ctx.restore();
}

function drawTripletMark(ctx, leftX, rightX, y) {
  const centerX = (leftX + rightX) / 2;
  const bracketY = y - 36;

  ctx.strokeStyle = 'rgba(212, 212, 216, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(leftX - 2, bracketY + 6);
  ctx.lineTo(leftX - 2, bracketY);
  ctx.lineTo(centerX - 10, bracketY);
  ctx.moveTo(centerX + 10, bracketY);
  ctx.lineTo(rightX + 2, bracketY);
  ctx.lineTo(rightX + 2, bracketY + 6);
  ctx.stroke();

  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('3', centerX, bracketY + 4);
  ctx.textAlign = 'start';
}

function drawBeatGuide(ctx, x, staffY) {
  ctx.strokeStyle = 'rgba(82, 82, 91, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, staffY - 20);
  ctx.lineTo(x, staffY + 20);
  ctx.stroke();
}

function drawGroupedNotes(ctx, notes, noteY, type, playhead) {
  if (!notes.length) return;

  const noteStates = notes.map((note) => {
    const noteId = `${note.measureIndex}-${note.beatIndex}-${note.id.split('-')[1]}`;
    const vState = props.noteVisualStates[noteId];
    const isCurPlaying =
      playhead &&
      playhead.measureIndex === note.measureIndex &&
      Math.abs(playhead.timeWithinMeasure - note.time) < 0.1;

    return {
      ...note,
      palette: getNotePalette(vState, isCurPlaying)
    };
  });

  if (type === '4') {
    const note = noteStates[0];
    drawNoteHead(ctx, note.x, noteY, note.palette, false);
    drawStem(ctx, note.x, noteY, note.palette, 'up', 28);
    return;
  }

  if (type === 'rest') {
    drawRest(ctx, noteStates[0].x, noteY - 3, '4');
    return;
  }

  const stems = noteStates.map((note) => {
    drawNoteHead(ctx, note.x, noteY, note.palette, true);
    return drawStem(ctx, note.x, noteY, note.palette, 'up', 30);
  });

  if (type === '8') {
    drawBeam(ctx, stems[0].stemX, stems[1].stemX, Math.min(stems[0].stemTop, stems[1].stemTop), noteStates[0].palette, 0);
    return;
  }

  if (type === '16') {
    const beamY = Math.min(...stems.map((stem) => stem.stemTop));
    drawBeam(ctx, stems[0].stemX, stems[stems.length - 1].stemX, beamY, noteStates[0].palette, 0);
    drawBeam(ctx, stems[0].stemX, stems[stems.length - 1].stemX, beamY, noteStates[0].palette, 1);
    return;
  }

  if (type === '3') {
    const beamY = Math.min(...stems.map((stem) => stem.stemTop));
    drawBeam(ctx, stems[0].stemX, stems[stems.length - 1].stemX, beamY, noteStates[0].palette, 0);
    drawTripletMark(ctx, noteStates[0].x, noteStates[noteStates.length - 1].x, noteY);
    return;
  }

  if (type === '8_16_16') {
    drawBeam(ctx, stems[0].stemX, stems[1].stemX, Math.min(stems[0].stemTop, stems[1].stemTop), noteStates[0].palette, 0);
    drawBeam(ctx, stems[1].stemX, stems[2].stemX, Math.min(stems[1].stemTop, stems[2].stemTop), noteStates[1].palette, 0);
    drawBeam(ctx, stems[1].stemX, stems[2].stemX, Math.min(stems[1].stemTop, stems[2].stemTop), noteStates[1].palette, 1);
    return;
  }

  noteStates.forEach((note, index) => {
    if (type === '8' || type === '16') return;
    drawFlag(ctx, stems[index].stemX, stems[index].stemTop, note.palette, type === '16' ? 2 : 1);
  });
}

function draw() {
  const canvas = canvasRef.value;
  const host = hostRef.value;
  if (!canvas || !host) return;

  const dpr = window.devicePixelRatio || 1;
  const isCompact = window.innerWidth <= 900;
  const hostStyle = window.getComputedStyle(host);
  const horizontalPadding =
    Number.parseFloat(hostStyle.paddingLeft || '0') + Number.parseFloat(hostStyle.paddingRight || '0');
  const width = Math.max((host.clientWidth || 0) - horizontalPadding, 320);
  const height = requiredHeight.value;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = '100%';
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const localGeometry = {
    ...props.geometry,
    startX: isCompact ? 76 : props.geometry.startX,
    endX: width - (isCompact ? 24 : 50)
  };
  localGeometry.beatWidth = (localGeometry.endX - localGeometry.startX) / 4;

  props.measures.forEach((measure, measureIndex) => {
    const staffY = props.geometry.staffBaseYOffset + measureIndex * props.geometry.staffHeight;
    const lineSpacing = 8;

    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i += 1) {
      const lineY = staffY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(localGeometry.startX - (isCompact ? 28 : 50), lineY);
      ctx.lineTo(localGeometry.endX + (isCompact ? 14 : 30), lineY);
      ctx.stroke();
    }

    ctx.strokeStyle = '#2d2d30';
    ctx.beginPath();
    ctx.moveTo(localGeometry.startX - 15, staffY - 16);
    ctx.lineTo(localGeometry.startX - 15, staffY + 16);
    ctx.moveTo(localGeometry.endX + 15, staffY - 16);
    ctx.lineTo(localGeometry.endX + 15, staffY + 16);
    ctx.stroke();

    ctx.fillStyle = '#3f3f46';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(`M${props.measureNumberOffset + measureIndex + 1}`, localGeometry.startX - (isCompact ? 28 : 50), staffY - 26);

    const beatDuration = 60 / props.bpm;
    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) {
      drawBeatGuide(ctx, localGeometry.startX + beatIndex * localGeometry.beatWidth, staffY);

      const subNotes = parseBeatSubdivisions(
        beatIndex,
        measure.rhythms[beatIndex],
        beatIndex * beatDuration,
        beatDuration,
        localGeometry.beatWidth,
        localGeometry.startX
      );
      const notesForBeat = subNotes.map((note) => ({
        ...note,
        measureIndex,
        beatIndex
      }));

      drawGroupedNotes(ctx, notesForBeat, staffY - 4, measure.rhythms[beatIndex], props.activePlayhead);
    }
  });
}

onMounted(() => {
  draw();
  window.addEventListener('resize', draw);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', draw);
});

watch(
  () => props.measures.length,
  () => draw()
);

watch(
  () => [props.bpm, props.measures, props.noteVisualStates, props.activePlayhead, props.isRunning],
  () => draw(),
  { deep: true }
);
</script>

<template>
  <section ref="hostRef" class="staff-shell">
    <canvas ref="canvasRef" class="staff-canvas"></canvas>
  </section>
</template>
