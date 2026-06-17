<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="home-page">
    <section class="hero card">
      <div class="eyebrow">Drum Coach 山海</div>
      <h1>练节奏，改鼓谱，都可以在这里完成。</h1>
      <p>
        无论你是想跟着节拍练稳基本功，还是把手里的 PDF 鼓谱整理成可编辑的网页鼓谱，都可以直接开始。
      </p>
    </section>

    <section class="feature-grid">
      <RouterLink class="feature-card" to="/trainer">
        <div class="feature-kicker">训练器</div>
        <h2>节拍训练</h2>
        <p>自定义小节、热身和录音长度，完成后得到逐小节结果和练习建议。</p>
      </RouterLink>

      <RouterLink class="feature-card" to="/import">
        <div class="feature-kicker">导入鼓谱</div>
        <h2>PDF 到可编辑谱</h2>
        <p>上传鼓谱 PDF，整理成可编辑的网页鼓谱，之后继续修改、保存和训练。</p>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
  display: grid;
  gap: 16px;
}

.hero {
  padding: 28px;
}

.eyebrow,
.feature-kicker {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1,
.feature-card h2 {
  margin: 10px 0 0;
}

.hero p,
.feature-card p {
  margin: 12px 0 0;
  color: #d4d4d8;
  line-height: 1.7;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.feature-card {
  display: block;
  padding: 24px;
  border-radius: 24px;
  text-decoration: none;
  color: inherit;
  background: rgba(24, 24, 27, 0.82);
  border: 1px solid rgba(63, 63, 70, 0.7);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

@media (max-width: 900px) {
  .home-page {
    width: calc(100vw - 20px);
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>
