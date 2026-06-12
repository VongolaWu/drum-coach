<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { parseBeatSubdivisions } from '../lib/rhythm.js';

const props = defineProps({
  bpm: Number,
  geometry: Object,
  measures: Array,
  noteVisualStates: Object,
  activePlayhead: Object,
  isRunning: Boolean
});

const canvasRef = ref(null);
const hostRef = ref(null);

const requiredHeight = computed(() => props.measures.length * props.geometry.staffHeight + 40);

function draw() {
  const canvas = canvasRef.value;
  const host = hostRef.value;
  if (!canvas || !host) return;

  const dpr = window.devicePixelRatio || 1;
  const minimumWidth = window.innerWidth <= 640 ? 760 : 960;
  const width = Math.max(host.clientWidth || minimumWidth, minimumWidth);
  const height = requiredHeight.value;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const localGeometry = {
    ...props.geometry,
    endX: width - 50,
    beatWidth: (width - 50 - props.geometry.startX) / 4
  };

  props.measures.forEach((measure, measureIndex) => {
    const staffY = props.geometry.staffBaseYOffset + measureIndex * props.geometry.staffHeight;
    const lineSpacing = 8;

    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i += 1) {
      const lineY = staffY + i * lineSpacing;
      ctx.beginPath();
      ctx.moveTo(localGeometry.startX - 50, lineY);
      ctx.lineTo(localGeometry.endX + 30, lineY);
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
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`M${measureIndex + 1}`, localGeometry.startX - 50, staffY - 26);

    const beatDuration = 60 / props.bpm;
    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) {
      const subNotes = parseBeatSubdivisions(
        beatIndex,
        measure.rhythms[beatIndex],
        beatIndex * beatDuration,
        beatDuration,
        localGeometry.beatWidth,
        localGeometry.startX
      );
      const playedNotes = subNotes.filter((note) => !note.isRest);

      playedNotes.forEach((note) => {
        const noteId = `${measureIndex}-${beatIndex}-${note.id.split('-')[1]}`;
        const vState = props.noteVisualStates[noteId];
        const isCurPlaying =
          props.activePlayhead &&
          props.activePlayhead.measureIndex === measureIndex &&
          Math.abs(props.activePlayhead.timeWithinMeasure - note.time) < 0.1;

        if (vState?.status === 'perfect') {
          ctx.fillStyle = '#22c55e';
        } else if (vState?.status === 'good') {
          ctx.fillStyle = '#fbbf24';
        } else if (vState?.status === 'miss') {
          ctx.fillStyle = '#f97316';
        } else if (isCurPlaying && props.isRunning) {
          ctx.fillStyle = '#22d3ee';
        } else {
          ctx.fillStyle = '#f4f4f5';
        }

        const snareY = staffY - 4;
        ctx.beginPath();
        ctx.ellipse(note.x, snareY, 6, 4, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
}

onMounted(() => {
  draw();
  window.addEventListener('resize', draw);
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
