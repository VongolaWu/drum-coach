import { computed, reactive, ref } from 'vue';
import { buildFlatSequenceNotes, getShortestSubdivisionDuration } from '../lib/rhythm.js';
import { judgementProfiles } from '../data/rhythmOptions.js';

export function useTrainerState() {
  const bpm = ref(100);
  const amplitudeThreshold = ref(0.35);
  const judgementMode = ref('normal');
  const isRunning = ref(false);
  const selectedMeasureIndex = ref(0);
  const noteVisualStates = reactive({});
  const userHitRecords = ref([]);
  const measures = ref([
    { id: 1, rhythms: ['8', '8', '8', '8'] },
    { id: 2, rhythms: ['16', '16', '16', '16'] }
  ]);

  const geometry = reactive({
    startX: 110,
    endX: 900,
    beatWidth: 195,
    staffHeight: 92,
    staffBaseYOffset: 62
  });

  const flatSequenceNotes = computed(() => buildFlatSequenceNotes(measures.value, bpm.value, geometry));
  const judgementProfile = computed(() => judgementProfiles[judgementMode.value] ?? judgementProfiles.normal);
  const micCooldownSeconds = computed(() => {
    const shortestSubdivision = getShortestSubdivisionDuration(measures.value, bpm.value);
    return Math.max(0.02, Math.min(0.07, shortestSubdivision * 0.38));
  });

  function clearVisualStates() {
    Object.keys(noteVisualStates).forEach((key) => delete noteVisualStates[key]);
  }

  function addMeasure() {
    if (measures.value.length >= 8) return;
    const nextId = Math.max(...measures.value.map((measure) => measure.id)) + 1;
    measures.value.push({ id: nextId, rhythms: ['8', '8', '8', '8'] });
    selectedMeasureIndex.value = measures.value.length - 1;
  }

  function deleteSelectedMeasure() {
    if (measures.value.length <= 1) return;
    measures.value.splice(selectedMeasureIndex.value, 1);
    selectedMeasureIndex.value = Math.max(0, selectedMeasureIndex.value - 1);
  }

  function updateBeatRhythm(beatIndex, value) {
    measures.value[selectedMeasureIndex.value].rhythms[beatIndex] = value;
  }

  return {
    amplitudeThreshold,
    bpm,
    flatSequenceNotes,
    geometry,
    isRunning,
    judgementMode,
    judgementProfile,
    measures,
    micCooldownSeconds,
    noteVisualStates,
    selectedMeasureIndex,
    userHitRecords,
    addMeasure,
    clearVisualStates,
    deleteSelectedMeasure,
    updateBeatRhythm
  };
}
