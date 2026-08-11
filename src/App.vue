<script setup>
import { ref, computed } from 'vue'
import UploadPanel from './components/UploadPanel.vue'
import ManualPanel from './components/ManualPanel.vue'
import ResultView from './components/ResultView.vue'

const activeTab = ref('upload')
const resultCourses = ref([])
const resultStudents = ref([])
const resultSource = ref('')

const resultCount = computed(() => resultCourses.value.length)

function onCalculated(payload) {
  resultCourses.value = payload.courses
  resultStudents.value = payload.selectedStudents || []
  resultSource.value = payload.source || ''
  activeTab.value = 'result'
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="app-title">
        <h1>🎓 学分绩点计算器</h1>
        <p class="formula">绩点 = (成绩÷10) − 5（≥60）；GPA = Σ学分绩点 ÷ Σ学分</p>
      </div>
    </header>

    <nav class="tabs">
      <button class="tab" :class="{ on: activeTab === 'upload' }" @click="activeTab = 'upload'">
        📂 上传 Excel
      </button>
      <button class="tab" :class="{ on: activeTab === 'manual' }" @click="activeTab = 'manual'">
        ✏️ 手动录入
      </button>
      <button class="tab" :class="{ on: activeTab === 'result' }" @click="activeTab = 'result'">
        📊 计算结果
        <span v-if="resultCount" class="badge">{{ resultCount }}</span>
      </button>
    </nav>

    <main class="content">
      <UploadPanel v-show="activeTab === 'upload'" @calculate="onCalculated" />
      <ManualPanel v-show="activeTab === 'manual'" @calculate="onCalculated" />
      <ResultView
        v-show="activeTab === 'result'"
        :courses="resultCourses"
        :selected-students="resultStudents"
        :source="resultSource"
      />
    </main>

    <footer class="app-footer">
      纯本地计算，数据不会上传服务器 · 支持上传 Excel / 手动录入 / 导出结果
    </footer>
  </div>
</template>

<style scoped>
.app { max-width: 860px; margin: 0 auto; padding: 16px 14px 40px; }
.app-header { margin-bottom: 16px; }
.app-title h1 { font-size: 22px; margin: 0 0 4px; }
.formula { color: var(--muted); font-size: 13px; margin: 0; }

.tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px; overflow-x: auto; }
.tab {
  background: none; border: none; border-radius: 10px; padding: 8px 16px;
  font-size: 14px; cursor: pointer; color: var(--muted); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
}
.tab.on { background: var(--primary); color: #fff; }
.badge { background: #fff; color: var(--primary); border-radius: 999px; font-size: 11px; padding: 0 7px; font-weight: 700; }

.app-footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 24px; }
</style>
