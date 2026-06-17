<script setup>
import { computed } from 'vue';

const props = defineProps({
  report: {
    type: Object,
    required: true
  },
  judgementProfile: {
    type: Object,
    required: true
  },
  judgementLabel: {
    type: String,
    required: true
  },
  recordingMeasures: {
    type: Number,
    required: true
  },
  analyzedLatencyMs: {
    type: Number,
    default: null
  },
  measureSummaries: {
    type: Array,
    required: true
  },
  coachingSummary: {
    type: Array,
    required: true
  },
  mode: {
    type: String,
    default: 'full'
  }
});

const summaryEmoji = ['🥁', '✨', '🎯', '🛠️', '🌈'];
const opener = computed(() => props.coachingSummary[0] ?? '');
const detailLines = computed(() => props.coachingSummary.slice(1));

const legendItems = [
  { key: 'perfect', label: 'Perfect', description: '落点非常接近目标拍点。', color: '#22c55e' },
  { key: 'good', label: 'Good', description: '有轻微偏差，但整体仍算稳定。', color: '#fbbf24' },
  { key: 'miss', label: '偏差较大', description: '命中了目标附近，但误差已经比较明显。', color: '#f97316' },
  { key: 'pending', label: '白色', description: '这一音符当前循环里还没有命中记录。', color: '#f4f4f5', darkBorder: true },
  { key: 'active', label: '蓝色提示', description: '当前播放头正在经过的目标音符。', color: '#22d3ee' }
];
</script>

<template>
  <section class="report card">
    <div class="card-head">
      <div>
        <div class="card-title">{{ mode === 'summary' ? '总结分析' : '训练报告' }}</div>
        <p class="card-subtitle">
          当前判定档位：{{ judgementLabel }}。本次报告按完整录音窗口 {{ recordingMeasures }} 小节统计，不是只看当前五线谱这一轮。
          Perfect ±{{ judgementProfile.perfectMs }}ms，Good ±{{ judgementProfile.goodMs }}ms，超出 ±{{ judgementProfile.missMs }}ms 的击打不会对齐到目标音符。
          {{ analyzedLatencyMs == null ? '' : ` 自动估计录音延迟 ${analyzedLatencyMs > 0 ? '+' : ''}${analyzedLatencyMs}ms。` }}
        </p>
      </div>
    </div>

    <div v-if="mode !== 'details'" class="coaching summary-only">
      <div class="summary-hero">
        <div class="summary-badge">本轮小结</div>
        <div class="summary-opener">{{ opener }}</div>
      </div>
      <div class="summary-list">
        <div v-for="(item, index) in detailLines" :key="index" class="summary-item">
          <span class="summary-emoji">{{ summaryEmoji[index % summaryEmoji.length] }}</span>
          <p>{{ item }}</p>
        </div>
      </div>
    </div>

    <template v-if="mode !== 'summary'">
      <div class="report-grid">
        <div><span>目标音符</span><strong class="mono">{{ report.expected }}</strong></div>
        <div><span>窗口内对齐</span><strong class="mono">{{ report.aligned }}</strong></div>
        <div><span>达标命中</span><strong class="mono">{{ report.scored }}</strong></div>
        <div><span>采集击打</span><strong class="mono">{{ report.detected }}</strong></div>
        <div><span>未对齐</span><strong class="mono">{{ report.ignored }}</strong></div>
        <div><span>达标率</span><strong class="mono">{{ report.accuracy == null ? '-- %' : `${report.accuracy}%` }}</strong></div>
        <div><span>Perfect</span><strong class="mono">{{ report.perfect }}</strong></div>
        <div><span>Good</span><strong class="mono">{{ report.good }}</strong></div>
        <div><span>偏差较大</span><strong class="mono">{{ report.miss }}</strong></div>
        <div><span>平均偏差</span><strong class="mono">{{ report.avg == null ? '-- ms' : `${report.avg} ms` }}</strong></div>
      </div>

      <div v-if="measureSummaries.length" class="measure-summary">
        <div class="card-title">逐小节情况</div>
        <div class="measure-summary-grid">
          <div v-for="summary in measureSummaries" :key="summary.measureNumber" class="measure-summary-card">
            <strong class="mono">M{{ summary.measureNumber }}</strong>
            <span>达标 {{ summary.perfect + summary.good }}/{{ summary.expected || 0 }}</span>
            <span>Perfect {{ summary.perfect }}</span>
            <span>Good {{ summary.good }}</span>
            <span>偏差较大 {{ summary.miss }}</span>
            <span>{{ summary.avgOffset == null ? '平均偏差 -- ms' : `平均偏差 ${summary.avgOffset} ms` }}</span>
          </div>
        </div>
      </div>

      <div class="legend">
        <div v-for="item in legendItems" :key="item.key" class="legend-item">
          <span
            class="legend-dot"
            :style="{
              background: item.color,
              border: item.darkBorder ? '1px solid #52525b' : 'none'
            }"
          ></span>
          <div>
            <strong>{{ item.label }}</strong>
            <p>{{ item.description }}</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.card-subtitle {
  margin: 8px 0 0;
  color: #a1a1aa;
  line-height: 1.6;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.report-grid div {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-grid span {
  color: #a1a1aa;
  font-size: 13px;
}

.report-grid strong {
  font-size: 24px;
}

.legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(63, 63, 70, 0.7);
}

.legend-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  margin-top: 4px;
  flex: none;
}

.legend-item strong {
  display: block;
  margin-bottom: 4px;
}

.legend-item p {
  margin: 0;
  color: #a1a1aa;
  line-height: 1.5;
}

.measure-summary {
  margin-top: 22px;
}

.measure-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.measure-summary-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(39, 39, 42, 0.68);
  border: 1px solid rgba(63, 63, 70, 0.7);
}

.measure-summary-card span {
  color: #d4d4d8;
  font-size: 13px;
}

.coaching {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(63, 63, 70, 0.7);
}

.summary-only {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.summary-hero {
  padding: 18px 20px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(34, 211, 238, 0.18), transparent 35%),
    linear-gradient(135deg, rgba(17, 24, 39, 0.96), rgba(39, 39, 42, 0.92));
  border: 1px solid rgba(63, 63, 70, 0.7);
}

.summary-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(34, 211, 238, 0.14);
  color: #67e8f9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-opener {
  margin-top: 12px;
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 900;
  line-height: 1.2;
  color: #fafafa;
}

.summary-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.summary-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(39, 39, 42, 0.58);
  border: 1px solid rgba(63, 63, 70, 0.6);
}

.summary-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 18px;
}

.summary-item p {
  margin: 0;
  color: #e4e4e7;
  line-height: 1.65;
}

.coaching p {
  margin: 10px 0 0;
  color: #d4d4d8;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .report-grid,
  .legend,
  .measure-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
