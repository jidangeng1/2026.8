<script setup>
import { ref, computed, watch } from 'vue'
import { buildPerStudent, buildSummary } from '../utils/gpa.js'
import { exportResults, exportClassResults } from '../utils/excel.js'

const props = defineProps({
  courses: { type: Array, default: () => [] },
  selectedStudents: { type: Array, default: () => [] },
  source: { type: String, default: '' },
})

const perStudent = computed(() => buildPerStudent(props.courses))

// 当前查看详情的同学（默认第一个，GPA 最高）
const activeName = ref(null)
watch(
  perStudent,
  (list) => {
    if (!list.length) activeName.value = null
    else if (!list.some((p) => p.student === activeName.value)) activeName.value = list[0].student
  },
  { immediate: true },
)

const active = computed(() => perStudent.value.find((p) => p.student === activeName.value) || null)
const isMulti = computed(() => perStudent.value.length > 1)

// 学期列表（用于筛选）
const semesters = computed(() => {
  const set = new Set((active.value?.courses || []).map((c) => c.semester).filter(Boolean))
  return [...set]
})
const semesterFilter = ref('全部')
watch(semesters, (s) => {
  if (!s.includes(semesterFilter.value)) semesterFilter.value = '全部'
})

// 当前同学经过学期筛选后的课程
const activeCourses = computed(() => {
  const list = active.value?.courses || []
  if (semesterFilter.value === '全部') return list
  return list.filter((c) => c.semester === semesterFilter.value)
})

// 展示数据：过滤后仍需 GPA
const display = computed(() => {
  // 全部学期：直接复用 perStudent 的汇总
  if (semesterFilter.value === '全部') {
    return {
      summary: {
        courseCount: active.value.courseCount,
        totalCredit: active.value.totalCredit,
        gpa: active.value.gpa,
        totalCreditGpa: active.value.courses.reduce((s, c) => s + (c.creditGpa || 0), 0),
        weightedAvg: active.value.courses.length
          ? active.value.courses.reduce((s, c) => s + (c.gpa || 0) * (c.credit || 0), 0) / active.value.courses.reduce((s, c) => s + (c.credit || 0), 0)
          : 0,
        skipped: active.value.courses.filter((c) => c.status === 'skipped').length,
      },
      courses: activeCourses.value,
    }
  }
  // 按学期筛选：重新计算
  const recs = activeCourses.value.map((c) => ({ name: c.name, score: c.rawScore, credit: c.credit, semester: c.semester }))
  const r = buildSummary(recs)
  return { summary: r.summary, courses: r.courses }
})

// ---- 导出 ----
function onExport() {
  if (isMulti.value) {
    const byStudent = {}
    for (const p of perStudent.value) byStudent[p.student] = p.courses
    exportClassResults(perStudent.value, byStudent, (props.source || '班级').replace(/\.(xlsx|xls|csv)$/i, ''))
  } else if (active.value) {
    const recs = active.value.courses.map((c) => ({ name: c.name, score: c.rawScore, credit: c.credit, semester: c.semester }))
    exportResults(recs, buildSummary(recs).summary, active.value.student + (semesterFilter.value !== '全部' ? ' · ' + semesterFilter.value : ''))
  }
}

function fmt(n, d = 2) {
  return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(d)
}
function statusClass(s) {
  return { ok: 'tag-ok', failed: 'tag-fail', skipped: 'tag-skip' }[s] || ''
}

// 对比表学期列
const semCols = computed(() => {
  const set = new Set()
  for (const p of perStudent.value) for (const s of Object.keys(p.semesters)) set.add(s)
  return [...set]
})
</script>

<template>
  <div v-if="!props.courses.length" class="empty">
    暂无数据。请在上方「上传 Excel」选择学生，或「手动录入」课程。
  </div>

  <div v-else>
    <!-- 多人：顶部学生 GPA 卡片行 -->
    <div v-if="isMulti" class="student-strip">
      <button
        v-for="p in perStudent"
        :key="p.student"
        class="gpa-card"
        :class="{ on: p.student === activeName }"
        @click="activeName = p.student"
      >
        <span class="gc-name">{{ p.student }}</span>
        <span class="gc-gpa">{{ fmt(p.gpa, 3) }}</span>
        <span class="gc-sub dim">{{ p.courseCount }}门 · {{ fmt(p.totalCredit) }}学分</span>
      </button>
    </div>

    <!-- 当前同学总览 -->
    <div v-if="active" class="overview">
      <div class="ov-card gpa">
        <span class="ov-label">{{ isMulti ? active.student + ' 的平均学分绩点' : '平均学分绩点 GPA' }}</span>
        <span class="ov-value big">{{ fmt(display.summary.gpa, 4) }}</span>
      </div>
      <div class="ov-card"><span class="ov-label">课程数</span><span class="ov-value">{{ display.summary.courseCount }}</span></div>
      <div class="ov-card"><span class="ov-label">总学分</span><span class="ov-value">{{ fmt(display.summary.totalCredit) }}</span></div>
      <div class="ov-card"><span class="ov-label">总学分绩点</span><span class="ov-value">{{ fmt(display.summary.totalCreditGpa) }}</span></div>
      <div class="ov-card"><span class="ov-label">加权平均分</span><span class="ov-value">{{ fmt(display.summary.weightedAvg) }}</span></div>
    </div>

    <!-- 多人对比表 -->
    <section v-if="isMulti" class="card">
      <h3>全班绩点对比</h3>
      <div class="table-scroll">
        <table class="detail-table">
          <thead>
            <tr>
              <th>排名</th><th>姓名</th><th>学号</th><th>课程数</th><th>总学分</th><th>GPA</th>
              <th v-for="s in semCols" :key="s" class="sem-col">{{ s }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(p, i) in perStudent"
              :key="p.student"
              :class="{ hl: p.student === activeName, 'row-fail': p.courseCount === 0 }"
              @click="activeName = p.student"
            >
              <td>{{ i + 1 }}</td>
              <td><strong>{{ p.student }}</strong></td>
              <td class="dim">{{ p.id }}</td>
              <td>{{ p.courseCount }}</td>
              <td>{{ fmt(p.totalCredit) }}</td>
              <td><strong class="gpa-cell">{{ fmt(p.gpa, 3) }}</strong></td>
              <td v-for="s in semCols" :key="s" class="sem-cell dim">
                {{ p.semesters[s] !== undefined ? fmt(p.semesters[s], 3) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 当前同学明细 -->
    <section v-if="active" class="card">
      <div class="filter-bar">
        <h3>「{{ active.student }}」课程明细</h3>
        <label class="field">
          <span>学期筛选</span>
          <select v-model="semesterFilter">
            <option value="全部">全部学期</option>
            <option v-for="s in semesters" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <button class="btn-primary" @click="onExport">⬇ {{ isMulti ? '导出全班汇总' : '导出 Excel' }}</button>
      </div>
      <div class="table-scroll">
        <table class="detail-table">
          <thead>
            <tr>
              <th>课程名</th><th>成绩</th><th>学分</th><th>学期</th><th>课程绩点</th><th>学分绩点</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in display.courses" :key="i" :class="{ 'row-fail': c.status === 'failed', 'row-skip': c.status === 'skipped' }">
              <td>{{ c.name }}</td>
              <td>{{ c.rawScore }}</td>
              <td>{{ c.credit ?? '—' }}</td>
              <td class="dim">{{ c.semester || '—' }}</td>
              <td>{{ fmt(c.gpa) }}</td>
              <td>{{ fmt(c.creditGpa) }}</td>
              <td><span class="tag" :class="statusClass(c.status)">{{ c.statusText || '正常' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.empty { text-align: center; color: var(--muted); padding: 40px 0; }
.dim { color: #94a3b8; }

.student-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 14px; }
.gpa-card {
  border: 1px solid var(--border); border-radius: 12px; background: var(--card);
  padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 110px;
  cursor: pointer; text-align: left; flex-shrink: 0;
}
.gpa-card.on { border-color: var(--primary); background: var(--primary-soft); }
.gc-name { font-weight: 600; font-size: 14px; }
.gc-gpa { font-size: 20px; font-weight: 700; color: var(--primary); }
.gc-sub { font-size: 11px; }

.overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
.ov-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.ov-card.gpa { background: linear-gradient(135deg, var(--primary), #2563eb); border: none; color: #fff; }
.ov-label { font-size: 12px; color: var(--muted); }
.ov-card.gpa .ov-label { color: rgba(255, 255, 255, 0.85); }
.ov-value { font-size: 20px; font-weight: 700; }
.ov-value.big { font-size: 30px; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
.card h3 { font-size: 15px; margin: 0 0 12px; }

.filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.filter-bar h3 { margin: 0; margin-right: auto; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field span { font-size: 12px; color: var(--muted); }
.field select { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 14px; background: #fff; }
.btn-primary { background: var(--primary); color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }

.table-scroll { overflow-x: auto; }
.detail-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.detail-table th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.detail-table td { padding: 8px; border-bottom: 1px solid var(--border-soft); white-space: nowrap; cursor: default; }
.detail-table tbody tr { cursor: pointer; }
.row-fail td { color: #dc2626; }
.row-skip td { color: #9ca3af; font-style: italic; }
tr.hl td { background: #eff6ff; }
.sem-col { color: #94a3b8; }
.sem-cell { font-size: 12px; }
.gpa-cell { color: var(--primary); }

.tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.tag-ok { background: #ecfdf5; color: #059669; }
.tag-fail { background: #fef2f2; color: #dc2626; }
.tag-skip { background: #f3f4f6; color: #9ca3af; }
</style>
