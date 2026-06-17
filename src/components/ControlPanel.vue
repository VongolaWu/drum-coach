<script setup>
import { computed } from 'vue';
import { judgementProfiles, rhythmOptions } from '../data/rhythmOptions.js';

defineProps({
  bpm: Number,
  metronomeVolumePercent: Number,
  thresholdPercent: Number,
  judgementMode: String,
  measures: Array,
  warmupMeasures: Number,
  recordingMeasures: Number,
  selectedMeasureIndex: Number,
  isRunning: Boolean,
  sessionPhase: String,
  sessionToolbarText: String
});

defineEmits([
  'update:bpm',
  'update:metronomeVolumePercent',
  'update:thresholdPercent',
  'update:judgementMode',
  'update:warmupMeasures',
  'update:recordingMeasures',
  'select-measure',
  'update-rhythm',
  'add-measure',
  'delete-measure',
  'toggle-run'
]);

const judgementOptions = computed(() =>
  Object.entries(judgementProfiles).map(([value, profile]) => ({ value, label: profile.label }))
);
</script>

<template>
  <section class="panel" :class="{ 'mobile-session-panel': isRunning }">
    <header class="panel-header">
      <div>
        <h1>鼓点节拍训练器 - 山海音乐特供版</h1>
        <p>让我们荡起鼓棒，小手法推开波浪。设置节奏、热身和录音小节后开始训练。录音结束会自动生成逐小节结果和练习建议。</p>
      </div>
      <button class="primary-btn" type="button" @click="$emit('toggle-run')">
        <i :class="isRunning ? 'fa-solid fa-stop' : 'fa-solid fa-play'"></i>
        {{ isRunning ? '停止训练' : '开始训练' }}
      </button>
    </header>

    <div v-if="isRunning" class="mobile-session-toolbar">
      <div class="mobile-session-title">训练进行中</div>
      <div class="mobile-session-meta mono">{{ sessionToolbarText }}</div>
      <div class="mobile-session-meta mono">BPM {{ bpm }}</div>
    </div>

    <div class="grid" :class="{ 'mobile-hidden-while-running': isRunning }">
      <div class="card">
        <div class="card-title">小节序列</div>
        <div class="measure-list">
          <button
            v-for="(measure, index) in measures"
            :key="measure.id"
            class="measure-chip"
            :class="{ active: selectedMeasureIndex === index }"
            type="button"
            :disabled="isRunning"
            @click="$emit('select-measure', index)"
          >
            M{{ index + 1 }}
          </button>
        </div>
        <div class="card-actions">
          <button type="button" :disabled="isRunning" @click="$emit('add-measure')">新增小节</button>
          <button type="button" :disabled="isRunning" @click="$emit('delete-measure')">删除当前小节</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">参数</div>
        <label class="field">
          <span>BPM: {{ bpm }}</span>
          <input type="range" min="50" max="220" :value="bpm" :disabled="isRunning" @input="$emit('update:bpm', Number($event.target.value))" />
        </label>
        <label class="field">
          <span>节拍器音量: {{ metronomeVolumePercent }}%</span>
          <input
            type="range"
            min="0"
            max="300"
            :value="metronomeVolumePercent"
            @input="$emit('update:metronomeVolumePercent', Number($event.target.value))"
          />
        </label>
        <label class="field">
          <span>麦克风阈值: {{ thresholdPercent }}%</span>
          <input
            type="range"
            min="10"
            max="90"
            :value="thresholdPercent"
            @input="$emit('update:thresholdPercent', Number($event.target.value))"
          />
        </label>
        <label class="field">
          <span>判定严格度</span>
          <select :value="judgementMode" :disabled="isRunning" @change="$emit('update:judgementMode', $event.target.value)">
            <option v-for="option in judgementOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>热身小节: {{ warmupMeasures }}</span>
          <input
            type="range"
            min="0"
            max="8"
            :value="warmupMeasures"
            :disabled="isRunning"
            @input="$emit('update:warmupMeasures', Number($event.target.value))"
          />
        </label>
        <label class="field">
          <span>录音小节: {{ recordingMeasures }}</span>
          <input
            type="range"
            min="1"
            max="16"
            :value="recordingMeasures"
            :disabled="isRunning"
            @input="$emit('update:recordingMeasures', Number($event.target.value))"
          />
        </label>
        <p v-if="isRunning" class="panel-hint">训练进行中时，BPM、判定和节奏序列会锁定，避免当前会话的时间轴失真。</p>
      </div>
    </div>

    <div class="card" :class="{ 'mobile-hidden-while-running': isRunning }">
      <div class="card-title">当前小节编辑</div>
      <div class="beat-grid">
        <label v-for="beatIndex in 4" :key="beatIndex" class="field">
          <span>第 {{ beatIndex }} 拍</span>
          <select
            :value="measures[selectedMeasureIndex].rhythms[beatIndex - 1]"
            :disabled="isRunning"
            @change="$emit('update-rhythm', beatIndex - 1, $event.target.value)"
          >
            <option v-for="option in rhythmOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-hint {
  margin: 8px 0 0;
  color: #a1a1aa;
  font-size: 13px;
  line-height: 1.5;
}

.mobile-session-toolbar {
  display: none;
}

@media (max-width: 900px) {
  .mobile-session-panel .panel-header p {
    display: none;
  }

  .mobile-session-panel .panel-header {
    margin-bottom: 0;
  }

  .mobile-session-toolbar {
    display: grid;
    gap: 6px;
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgba(17, 24, 39, 0.72);
    border: 1px solid rgba(63, 63, 70, 0.7);
  }

  .mobile-session-title {
    font-weight: 700;
    color: #f4f4f5;
  }

  .mobile-session-meta {
    color: #a1a1aa;
    font-size: 13px;
  }

  .mobile-hidden-while-running {
    display: none;
  }
}
</style>
