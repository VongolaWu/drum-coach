<script setup>
import { computed } from 'vue';
import { judgementProfiles, rhythmOptions } from '../data/rhythmOptions.js';

defineProps({
  bpm: Number,
  thresholdPercent: Number,
  judgementMode: String,
  measures: Array,
  selectedMeasureIndex: Number,
  isRunning: Boolean
});

defineEmits([
  'update:bpm',
  'update:thresholdPercent',
  'update:judgementMode',
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
  <section class="panel">
    <header class="panel-header">
      <div>
        <h1>鼓点节拍训练器</h1>
        <p>这是迁移到 Vue 后的整理版本。现在我们先把训练、收音、可视化和报告拆开，后面继续逐步提高检测准确度。</p>
      </div>
      <button class="primary-btn" type="button" @click="$emit('toggle-run')">
        <i :class="isRunning ? 'fa-solid fa-stop' : 'fa-solid fa-play'"></i>
        {{ isRunning ? '停止训练' : '开始训练' }}
      </button>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">小节序列</div>
        <div class="measure-list">
          <button
            v-for="(measure, index) in measures"
            :key="measure.id"
            class="measure-chip"
            :class="{ active: selectedMeasureIndex === index }"
            type="button"
            @click="$emit('select-measure', index)"
          >
            M{{ index + 1 }}
          </button>
        </div>
        <div class="card-actions">
          <button type="button" @click="$emit('add-measure')">新增小节</button>
          <button type="button" @click="$emit('delete-measure')">删除当前小节</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">参数</div>
        <label class="field">
          <span>BPM: {{ bpm }}</span>
          <input type="range" min="50" max="220" :value="bpm" @input="$emit('update:bpm', Number($event.target.value))" />
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
          <select :value="judgementMode" @change="$emit('update:judgementMode', $event.target.value)">
            <option v-for="option in judgementOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="card-title">当前小节编辑</div>
      <div class="beat-grid">
        <label v-for="beatIndex in 4" :key="beatIndex" class="field">
          <span>第 {{ beatIndex }} 拍</span>
          <select
            :value="measures[selectedMeasureIndex].rhythms[beatIndex - 1]"
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
