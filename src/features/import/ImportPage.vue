<script setup>
const importSteps = [
  '上传 PDF 鼓谱',
  '选择页码或区域',
  '识别成网页鼓谱',
  '人工校对并编辑',
  '保存成可训练谱面'
];
</script>

<template>
  <main class="import-page">
    <section class="card import-hero">
      <div class="eyebrow">导入鼓谱</div>
      <h1>把 PDF 鼓谱带进来，整理成可编辑、可训练的网页鼓谱。</h1>
      <p>
        上传 PDF 后，你可以选择页码或区域，生成网页上的鼓谱内容，再继续校对、编辑和保存。
      </p>
    </section>

    <section class="card import-roadmap">
      <div class="card-title">规划中的流程</div>
      <ol>
        <li v-for="step in importSteps" :key="step">{{ step }}</li>
      </ol>
      <p class="hint">第一版建议做半自动导入：系统给初稿，用户在网页里修正，而不是一开始就赌全自动识别。</p>
    </section>
  </main>
</template>

<style scoped>
.import-page {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
  display: grid;
  gap: 16px;
}

.import-hero,
.import-roadmap {
  padding: 24px;
}

.eyebrow {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.import-hero h1 {
  margin: 10px 0 0;
}

.import-hero p,
.hint,
li {
  color: #d4d4d8;
  line-height: 1.7;
}

ol {
  margin: 14px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 10px;
}

.hint {
  margin: 18px 0 0;
}

@media (max-width: 900px) {
  .import-page {
    width: calc(100vw - 20px);
  }
}
</style>
