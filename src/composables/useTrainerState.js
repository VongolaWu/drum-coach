import { computed, reactive, ref } from 'vue';
import { createPracticeMeasure, createPracticeScore, setBeatRhythm, setMeasureBeatCount } from '../domain/score/model.js';
import { buildFlatSequenceNotes, getShortestSubdivisionDuration } from '../lib/rhythm.js';
import { judgementProfiles } from '../data/rhythmOptions.js';

export function useTrainerState() {
  const bpm = ref(100);
  const amplitudeThreshold = ref(0.35);
  const judgementMode = ref('normal');
  const isRunning = ref(false);
  const warmupMeasures = ref(1);
  const recordingMeasures = ref(2);
  const selectedMeasureIndex = ref(0);
  const noteVisualStates = reactive({});
  const userHitRecords = ref([]);
  const score = ref(createPracticeScore([
    ['8', '8', '8', '8'],
    ['16', '16', '16', '16']
  ]));

  const geometry = reactive({
    startX: 110,
    endX: 900,
    beatWidth: 195,
    staffHeight: 92,
    staffBaseYOffset: 62
  });

  const measures = computed(() => score.value.measures);
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
    if (score.value.measures.length >= 8) return;
    score.value.measures.push(createPracticeMeasure(['8', '8', '8', '8']));
    selectedMeasureIndex.value = score.value.measures.length - 1;
  }

  function deleteSelectedMeasure() {
    if (score.value.measures.length <= 1) return;
    score.value.measures.splice(selectedMeasureIndex.value, 1);
    selectedMeasureIndex.value = Math.max(0, selectedMeasureIndex.value - 1);
  }

  function updateBeatRhythm(beatIndex, value) {
    setBeatRhythm(score.value.measures[selectedMeasureIndex.value], beatIndex, value);
  }

  function updateMeasureBeatCount(beatCount) {
    setMeasureBeatCount(score.value.measures[selectedMeasureIndex.value], beatCount);
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
    score,
    micCooldownSeconds,
    noteVisualStates,
    recordingMeasures,
    selectedMeasureIndex,
    userHitRecords,
    warmupMeasures,
    addMeasure,
    clearVisualStates,
    deleteSelectedMeasure,
    updateBeatRhythm,
    updateMeasureBeatCount
  };
}
