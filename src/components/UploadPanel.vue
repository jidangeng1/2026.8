<script setup>
import { ref, computed } from 'vue'
import { parseWorkbook, autoDetect } from '../utils/excel.js'

const emit = defineEmits(['calculate'])

// ---- 上传与解析 ----
const sheets = ref([]) // { name, rows, detect }
const fileName = ref('')
const errorMsg = ref('')
const dragging = ref(false)

async function onFile(file) {
  if (!file) return
  errorMsg.value = ''
  try {
    const list = await parseWorkbook(file)
    if (!list.length) {
      errorMsg.value = '未读取到任何工作表，请确认是有效的 Excel 文件'
      return
    }
    sheets.value = list.map((s) => ({ ...s, detect: autoDetect(s.rows) }))
    fileName.value = file.name
    // 默认：参与计算的 sheet = 班级表；个人成绩单排除
    included.value = sheets.value.map((_, i) => i).filter((i) => sheets.value[i].detect.kind !== 'personal')
    activeIdx.value = 0
    // 默认全选课程列
    courseSel.value = {}
    for (let i = 0; i < sheets.value.length; i++) {
      courseSel.value[i] = new Set(sheets.value[i].detect.courseCols.map((c) => c.idx))
    }
    // 重置学生选择
    selectedStudents.value = new Set()
    scope.value = 'current'
    calcCount.value = 0
  } catch (e) {
    errorMsg.value = '文件解析失败：' + (e && e.message ? e.message : String(e))
  }
}

function onPick(e) {
  onFile(e.target.files[0])
  e.target.value = ''
}
function onDrop(e) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) onFile(f)
}

// ---- 已勾选的 Sheet ----
const included = ref([])

// ---- 当前预览 Sheet ----
const activeIdx = ref(0)
const activeSheet = computed(() => sheets.value[activeIdx.value] || null)
const detect = computed(() => activeSheet.value?.detect || null)

// ---- 课程列选择：sheetIdx -> Set<colIdx> ----
const courseSel = ref({})
function toggleCourse(sheetIdx, colIdx) {
  const set = courseSel.value[sheetIdx] || (courseSel.value[sheetIdx] = new Set())
  if (set.has(colIdx)) set.delete(colIdx)
  else set.add(colIdx)
}
function isCourseSel(sheetIdx, colIdx) {
  return (courseSel.value[sheetIdx] || new Set()).has(colIdx)
}

// ---- 学分覆盖：sheetIdx -> colIdx -> 值 ----
const creditOver = ref({})
function creditOf(sheetIdx, colIdx) {
  const over = creditOver.value?.[sheetIdx]?.[colIdx]
  if (over !== undefined && over !== '') return over
  const col = sheets.value[sheetIdx].detect.courseCols.find((c) => c.idx === colIdx)
  return col ? col.credit : ''
}

// ---- 学生列表（跨所有班级表）----
function cleanName(n) {
  return String(n || '').replace(/[<*]+$/, '').trim()
}
const allStudents = computed(() => {
  const map = new Map() // name -> {name, id, firstSem}
  for (const si of included.value) {
    const sheet = sheets.value[si]
    const d = sheet.detect
    for (let r = d.dataStart; r < d.dataEnd; r++) {
      const raw = String(sheet.rows[r]?.[d.nameCol] ?? '').trim()
      if (!raw) continue
      const nm = cleanName(raw)
      const id = String(sheet.rows[r]?.[d.idCol] ?? '').trim()
      if (!map.has(nm)) map.set(nm, { name: nm, id, semesters: new Set() })
      map.get(nm).semesters.add(sheet.name)
    }
  }
  return [...map.values()].map((s) => ({ ...s, semCount: s.semesters.size }))
})

// 当前班级 = 最新勾选学期的名单
const currentScopeStudents = computed(() => {
  if (!included.value.length) return []
  const last = included.value[included.value.length - 1]
  const sheet = sheets.value[last]
  const d = sheet.detect
  const set = new Set()
  for (let r = d.dataStart; r < d.dataEnd; r++) {
    const raw = String(sheet.rows[r]?.[d.nameCol] ?? '').trim()
    if (raw) set.add(cleanName(raw))
  }
  return set
})

const scope = ref('current') // current | all
const studentList = computed(() => {
  const list = allStudents.value
  if (scope.value === 'current') return list.filter((s) => currentScopeStudents.value.has(s.name))
  return list
})

const searchText = ref('')
const filteredStudents = computed(() => {
  const t = searchText.value.trim()
  if (!t) return studentList.value
  return studentList.value.filter((s) => s.name.includes(t) || s.id.includes(t))
})

// ---- 选择学生 ----
const selectedStudents = ref(new Set())
function toggleStudent(name) {
  const s = selectedStudents.value
  if (s.has(name)) s.delete(name)
  else s.add(name)
  selectedStudents.value = new Set(s)
}
function selectAll() {
  selectedStudents.value = new Set(studentList.value.map((s) => s.name))
}
function selectNone() {
  selectedStudents.value = new Set()
}
const myName = ref('燕丽炜')
function selectMe() {
  selectedStudents.value = new Set([cleanName(myName.value)])
  scope.value = 'all'
}

// ---- 表格可视化（预览）----
const tableRows = computed(() => {
  const sheet = activeSheet.value
  if (!sheet) return []
  const d = detect.value
  const rows = []
  // 学分行（元数据）
  if (d.creditRow >= 0) rows.push({ type: 'credit', row: sheet.rows[d.creditRow], rowNo: d.creditRow + 1 })
  // 表头行
  rows.push({ type: 'header', row: sheet.rows[d.headerRow], rowNo: d.headerRow + 1 })
  // 数据行（最多 60 行）
  for (let r = d.dataStart; r < Math.min(d.dataEnd, d.dataStart + 60); r++) {
    rows.push({ type: 'data', row: sheet.rows[r], rowNo: r + 1 })
  }
  if (d.dataEnd > d.dataStart + 60) rows.push({ type: 'more', count: d.dataEnd - d.dataStart - 60 })
  return rows
})

const colCount = computed(() => {
  const sheet = activeSheet.value
  return sheet ? Math.max(6, sheet.detect.courseCols.length + 4, sheet.rows.reduce((m, r) => Math.max(m, r.length), 0)) : 0
})

function isCourseCol(ci) {
  return detect.value?.courseCols.some((c) => c.idx === ci) ?? false
}
function isSelectedCol(ci) {
  return isCourseSel(activeIdx.value, ci)
}
function isStaticCol(ci) {
  const d = detect.value
  if (!d) return true
  return ci === d.nameCol || ci === d.idCol || d.courseCols.every((c) => c.idx !== ci)
}

// ---- 计算 ----
const calcCount = ref(0)
function buildRecords() {
  const recs = []
  for (const si of included.value) {
    const sheet = sheets.value[si]
    const d = sheet.detect
    const sel = courseSel.value[si] || new Set()
    if (!sel.size) continue
    for (let r = d.dataStart; r < d.dataEnd; r++) {
      const rawName = String(sheet.rows[r]?.[d.nameCol] ?? '').trim()
      if (!rawName) continue
      const student = cleanName(rawName)
      if (!selectedStudents.value.has(student)) continue
      const id = String(sheet.rows[r]?.[d.idCol] ?? '').trim()
      for (const col of d.courseCols) {
        if (!sel.has(col.idx)) continue
        const score = String(sheet.rows[r]?.[col.idx] ?? '').trim()
        if (!score) continue
        const credit = creditOf(si, col.idx)
        recs.push({
          student,
          id,
          name: col.name,
          score,
          credit: String(credit ?? ''),
          semester: sheet.name,
        })
      }
    }
  }
  return recs
}

function onCalculate() {
  if (!selectedStudents.value.size) {
    errorMsg.value = '请先选择要计算的学生（可搜索或点「只算我」/「全班」）'
    return
  }
  if (!included.value.some((si) => (courseSel.value[si]?.size ?? 0) > 0)) {
    errorMsg.value = '请至少勾选一列课程'
    return
  }
  errorMsg.value = ''
  const recs = buildRecords()
  if (!recs.length) {
    errorMsg.value = '没有解析到任何成绩，请检查勾选的 Sheet 和课程列'
    return
  }
  calcCount.value = recs.length
  emit('calculate', {
    courses: recs,
    selectedStudents: [...selectedStudents.value],
    source: fileName.value,
  })
}

function goSheet(i) {
  activeIdx.value = i
}
function toggleIncluded(i) {
  const idx = included.value.indexOf(i)
  if (idx >= 0) {
    included.value.splice(idx, 1)
  } else {
    included.value.push(i)
    activeIdx.value = i
  }
}
</script>

<template>
  <div class="upload-panel">
    <!-- 上传区 -->
    <div
      v-if="!sheets.length"
      class="dropzone"
      :class="{ dragging }"
      @click="$refs.fileInput.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="dz-icon">📄</div>
      <p class="dz-title">点击或拖拽上传成绩表 Excel</p>
      <p class="dz-sub">支持 .xlsx / .xls / .csv · 自动识别表头、学分、学生姓名 · 数据只在本地计算</p>
      <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onPick" />
    </div>

    <div v-else>
      <!-- 顶部工具条 -->
      <div class="topbar">
        <div class="file-info">
          <strong>{{ fileName }}</strong>
          <button class="link-btn" @click="sheets = []; fileName = ''">重新上传</button>
        </div>
        <button class="btn-primary small" :disabled="!selectedStudents.size" @click="onCalculate">
          计算选中学生（{{ selectedStudents.size }} 人）的绩点
        </button>
      </div>

      <!-- Sheet 选择 -->
      <section class="card">
        <h3>① 选择学期 Sheet <span class="hint">（点击表头可预览）</span></h3>
        <div class="chip-wrap">
          <div
            v-for="(s, i) in sheets"
            :key="i"
            class="chip"
            :class="{ on: included.includes(i), active: activeIdx === i }"
          >
            <button class="chip-check" :title="included.includes(i) ? '取消勾选' : '参与计算'" @click="toggleIncluded(i)">
              {{ included.includes(i) ? '☑' : '☐' }}
            </button>
            <button class="chip-name" @click="goSheet(i)">
              {{ s.name }}
            </button>
            <span v-if="s.detect.kind === 'personal'" class="chip-tag">个人成绩单</span>
            <span class="chip-sub">{{ s.detect.kind === 'personal' ? '' : (s.detect.dataEnd - s.detect.dataStart) + '人' }}</span>
          </div>
        </div>
        <p
          v-if="sheets.some((s) => s.detect.kind === 'personal')"
          class="note"
        >
          ⚠ 检测到「个人成绩单」Sheet（含官方 GPA），已自动排除在班级计算外。个人成绩单将单独展示。
        </p>
      </section>

      <!-- 表格可视化 -->
      <section class="card">
        <h3>② 课程与成绩表（点击课程列表头勾选）</h3>
        <p class="note">选中课程列底色为蓝色；灰色列为学号/姓名/平均分等，不参与计算。学分自动识别，可点击修改。</p>
        <div class="table-wrap">
          <table class="visual-table">
            <template v-for="(tr, ri) in tableRows" :key="ri">
              <!-- 表头：课程名 + 学分 -->
              <tr v-if="tr.type === 'header'" class="th-row">
                <td class="corner">{{ tr.rowNo }}行</td>
                <td
                  v-for="ci in colCount"
                  :key="ci"
                  :class="{
                    'course-col': isCourseCol(ci),
                    selected: isSelectedCol(ci),
                    'static-col': !isCourseCol(ci),
                  }"
                  @click="isCourseCol(ci) && toggleCourse(activeIdx, ci)"
                >
                  <template v-if="isCourseCol(ci)">
                    <div class="th-name">{{ tr.row[ci] || ('第' + (ci + 1) + '列') }}</div>
                    <div class="th-credit">
                      <input
                        :value="creditOf(activeIdx, ci)"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="学分"
                        class="credit-input"
                        @click.stop
                        @input="creditOver[activeIdx] = { ...creditOver[activeIdx], [ci]: $event.target.value }"
                      />
                    </div>
                  </template>
                  <template v-else>
                    <div class="th-name dim">{{ tr.row[ci] || '' }}</div>
                  </template>
                </td>
              </tr>
              <!-- 学分行 -->
              <tr v-else-if="tr.type === 'credit'" class="meta-row">
                <td class="corner">学分</td>
                <td v-for="ci in colCount" :key="ci" class="meta-cell dim">
                  {{ isCourseCol(ci) ? tr.row[ci] || '—' : '' }}
                </td>
              </tr>
              <!-- 数据行 -->
              <tr v-else-if="tr.type === 'data'" class="data-row" :class="{ hl: tr.row[detect.nameCol]?.includes(myName) }">
                <td class="corner dim">{{ tr.rowNo }}</td>
                <td v-for="ci in colCount" :key="ci" class="data-cell">
                  <template v-if="isCourseCol(ci)">
                    <span :class="{ 'cell-empty': !String(tr.row[ci] ?? '').trim() }">{{ tr.row[ci] || '' }}</span>
                  </template>
                  <template v-else-if="ci === detect.nameCol">
                    <strong>{{ tr.row[ci] || '' }}</strong>
                  </template>
                  <template v-else>
                    <span class="dim">{{ tr.row[ci] || '' }}</span>
                  </template>
                </td>
              </tr>
              <tr v-else-if="tr.type === 'more'" class="more-row">
                <td class="corner"></td>
                <td :colspan="colCount">… 还有 {{ tr.count }} 行学生数据（已自动识别）</td>
              </tr>
            </template>
          </table>
        </div>
      </section>

      <!-- 学生选择 -->
      <section class="card">
        <h3>③ 选择要计算的学生</h3>
        <div class="student-toolbar">
          <div class="seg">
            <button class="seg-btn" :class="{ on: scope === 'current' }" @click="scope = 'current'; selectNone()">当前班级（{{ currentScopeStudents.size }}人）</button>
            <button class="seg-btn" :class="{ on: scope === 'all' }" @click="scope = 'all'; selectNone()">全部学生（{{ allStudents.length }}人）</button>
          </div>
          <div class="quick">
            <span class="me-field">
              我的名字
              <input v-model="myName" class="me-input" />
            </span>
            <button class="btn-ghost" @click="selectMe">🎯 只算我</button>
            <button class="btn-ghost" @click="selectAll">👥 全班</button>
          </div>
        </div>
        <div class="search-bar">
          <input v-model="searchText" class="search-input" placeholder="🔍 搜索姓名或学号…" />
        </div>
        <div class="student-grid">
          <button
            v-for="s in filteredStudents"
            :key="s.name"
            class="student-chip"
            :class="{ on: selectedStudents.has(s.name) }"
            @click="toggleStudent(s.name)"
          >
            <span class="sc-name">{{ s.name }}</span>
            <span class="sc-id dim">{{ s.id }}</span>
            <span v-if="s.semCount < included.length" class="sc-note">({{ s.semCount }}学期)</span>
          </button>
        </div>
        <div class="footer-row">
          <span class="dim">已选 {{ selectedStudents.size }} 人</span>
          <button v-if="selectedStudents.size" class="link-btn" @click="selectNone">清空</button>
        </div>
      </section>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <p v-if="calcCount" class="ok-note">✅ 已解析 {{ calcCount }} 条成绩记录，点击顶部「计算结果」查看</p>
    </div>
  </div>
</template>

<style scoped>
.hidden { display: none; }
.dim { color: #94a3b8; }

.dropzone {
  border: 2px dashed var(--border); border-radius: 16px; padding: 48px 20px;
  text-align: center; cursor: pointer; background: var(--card);
  transition: border-color 0.2s, background 0.2s;
}
.dropzone.dragging { border-color: var(--primary); background: #eff6ff; }
.dz-icon { font-size: 40px; }
.dz-title { font-weight: 600; margin: 12px 0 4px; }
.dz-sub { color: var(--muted); font-size: 13px; }

.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
.file-info { display: flex; align-items: center; gap: 10px; }
.link-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 13px; padding: 0; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
.card h3 { font-size: 15px; margin: 0 0 10px; }
.hint, .note { color: var(--muted); font-size: 12px; font-weight: 400; }
.note { margin: 8px 0 0; }

.chip-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  border: 1px solid var(--border); border-radius: 10px; padding: 6px 8px 6px 6px;
  font-size: 13px; background: var(--card); display: inline-flex; align-items: center; gap: 4px;
}
.chip.on { border-color: var(--primary); background: var(--primary-soft); }
.chip.active { outline: 2px solid var(--primary); }
.chip-check {
  border: none; background: none; color: var(--primary); font-size: 14px;
  cursor: pointer; padding: 0 2px;
}
.chip-name {
  border: none; background: none; font-size: 13px; cursor: pointer; padding: 2px 4px;
}
.chip-name:hover { color: var(--primary); }
.chip-tag { background: #fef3c7; color: #b45309; border-radius: 999px; font-size: 11px; padding: 1px 6px; }
.chip-sub { color: #94a3b8; font-size: 11px; }

.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
.visual-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.visual-table td { border: 1px solid var(--border-soft); padding: 4px 8px; white-space: nowrap; text-align: center; }
.corner { background: var(--bg); color: #64748b; font-size: 11px; position: sticky; left: 0; z-index: 2; }
.th-row td { background: #f8fafc; font-weight: 600; cursor: default; }
.th-row td.course-col { cursor: pointer; transition: background 0.15s; }
.th-row td.course-col.selected { background: var(--primary); color: #fff; }
.th-row td.static-col { background: #f1f5f9; color: #94a3b8; }
.th-name { line-height: 1.3; }
.th-name.dim { color: #94a3b8; font-weight: 500; }
.th-credit { margin-top: 3px; }
.credit-input {
  width: 52px; font-size: 11px; text-align: center; border: 1px solid #cbd5e1;
  border-radius: 5px; padding: 2px; background: #fff;
}
.th-row td.selected .credit-input { border-color: #fff; background: #dbeafe; }
.meta-row td, .meta-cell { font-size: 11px; color: #94a3b8; background: #fbfbfd; }
.data-row td { text-align: center; }
.data-row.hl td { background: #fef9c3; }
.cell-empty { color: #d1d5db; }
.more-row td { text-align: left; color: var(--muted); font-size: 12px; padding: 10px; }

.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; flex-wrap: wrap; }
.seg-btn { border: none; background: var(--card); padding: 8px 12px; cursor: pointer; font-size: 13px; }
.seg-btn.on { background: var(--primary); color: #fff; }

.student-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.quick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.me-field { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.me-input { border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 13px; width: 90px; }
.btn-ghost { background: none; border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
.btn-ghost:hover { border-color: var(--primary); color: var(--primary); }

.search-bar { margin-bottom: 10px; }
.search-input {
  width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; font-size: 14px;
}

.student-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; max-height: 320px; overflow-y: auto; }
.student-chip {
  border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: 13px;
  cursor: pointer; background: var(--card); text-align: left; display: flex; flex-direction: column; gap: 2px;
}
.student-chip.on { border-color: var(--primary); background: var(--primary-soft); }
.sc-name { font-weight: 600; }
.sc-id { font-size: 11px; }
.sc-note { font-size: 11px; color: #f59e0b; }

.footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 13px; }
.error { color: #dc2626; font-size: 13px; margin: 10px 0; }
.ok-note { color: #059669; font-size: 13px; margin: 10px 0 0; }

.btn-primary {
  background: var(--primary); color: #fff; border: none; border-radius: 10px;
  padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-primary.small { padding: 9px 14px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
