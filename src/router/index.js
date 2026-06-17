import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import TrainerPage from '../features/trainer/TrainerPage.vue';
import ImportPage from '../features/import/ImportPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/trainer',
      name: 'trainer',
      component: TrainerPage
    },
    {
      path: '/import',
      name: 'import',
      component: ImportPage
    }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});
