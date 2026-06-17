<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/">Drum Coach 山海</RouterLink>
      <nav class="app-nav">
        <RouterLink :class="['nav-link', { active: route.name === 'trainer' }]" to="/trainer">训练器</RouterLink>
        <RouterLink :class="['nav-link', { active: route.name === 'import' }]" to="/import">导入鼓谱</RouterLink>
      </nav>
    </header>

    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-header {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 20px 0 0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.brand {
  color: #f4f4f5;
  text-decoration: none;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.app-nav {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.nav-link {
  color: #d4d4d8;
  text-decoration: none;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(39, 39, 42, 0.72);
  border: 1px solid rgba(63, 63, 70, 0.7);
}

.nav-link.active {
  color: #67e8f9;
  background: rgba(34, 211, 238, 0.14);
}

@media (max-width: 900px) {
  .app-header {
    width: calc(100vw - 20px);
    padding-top: 14px;
    flex-direction: column;
    align-items: stretch;
  }

  .app-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nav-link,
  .brand {
    text-align: center;
  }
}
</style>
