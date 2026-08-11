<script setup>
import { ref } from 'vue'

const emit = defineEmits(['calculate'])

const defaultSemester = ref('大一上')
const rows = ref([newRow()])
const errorMsg = ref('')
const pasteText = ref('')
const showPaste = ref(false)

function newRow() {
  return { name: '', score: '', credit: '', semester: defaultSemester.value }
}

function addRow() {
  rows.value.push(newRow())
}

function removeRow(i) {
  if (rows.value.length > 1) rows.value.splice(i, 1)
}

function onPasteInput(e) {
  pasteText.value = e.target.value
}

function importPaste() {
  const lines = pasteText.value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return

  const parsed = []
  for (const line of lines) {
    // 兼容 Tab、逗号、顿号、分号分隔
    const parts = line.split(/[\t,，、;；]+/).map((s) => s.trim())
    if (!parts.length) continue
    const [name, score, credit, semester] = parts
    if (!score) continue // 至少要有成绩
    parsed.push({ name: name || '', score, credit: credit || '', semester: semester || defaultSemester.value })
  }

  if (parsed.length) {
    // 追加到末尾，覆盖开头几行空行
    rows.value.push(...parsed)
    pasteText.value = ''
    showPaste.value = false
    errorMsg.value = `已导入 ${parsed.length} 行`
  } else {
    errorMsg.value = '未识别到有效数据，请确认每行至少包含：课程名、成绩'
  }
}

function onCalculate() {
  const valid = rows.value.filter((r) => r.name.trim() || r.score.trim())
  const withScore = valid.filter((r) => r.score.trim())
  const missingCredit = withScore.filter((r) => !r.credit.trim())
  if (!withScore.length) {
    errorMsg.value = '请至少填写一行有成绩的数据'
    return
  }
  if (missingCredit.length) {
    errorMsg.value = `有 ${missingCredit.length} 行缺少学分`
    return
  }
  errorMsg.value = ''
  emit('calculate', {
    courses: valid.map((r) => ({
      name: r.name.trim(),
      score: r.score.trim(),
      credit: r.credit.trim(),
      semester: (r.semester || defaultSemester.value).trim(),
      student: '手动录入',
      id: '',
    })),
    selectedStudents: ['手动录入'],
    source: '手动录入',
  })
}
</script>

<template>
  <div class="manual-panel">
    <section class="card">
      <div class="head">
        <h3>手动录入课程</h3>
        <div class="head-actions">
          <label class="field-inline">
            <span>默认学期</span>
            <input type="text" v-model="defaultSemester" placeholder="如：大一上" />
          </label>
          <button class="btn-ghost" @click="showPaste = !showPaste">📋 从剪贴板粘贴</button>
        </div>
      </div>

      <div v-if="showPaste" class="paste-box">
        <textarea
          v-model="pasteText"
          placeholder="粘贴 Excel/表格内容，每行一门课，用 Tab 或逗号分隔&#10;格式：课程名、成绩、学分、学期（学期可省略）"
          rows="5"
        ></textarea>
        <button class="btn-primary small" @click="importPaste">导入粘贴内容</button>
      </div>

      <div class="table-scroll">
        <table class="entry-table">
          <thead>
            <tr>
              <th style="width: 36px">#</th>
              <th>课程名</th>
              <th style="width: 90px">成绩</th>
              <th style="width: 90px">学分</th>
              <th style="width: 120px">学期</th>
              <th style="width: 44px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td class="row-no">{{ i + 1 }}</td>
              <td><input v-model="r.name" placeholder="高等数学" /></td>
              <td><input v-model="r.score" placeholder="85.5" /></td>
              <td><input v-model="r.credit" placeholder="3" /></td>
              <td><input v-model="r.semester" placeholder="大一上" /></td>
              <td><button class="del-btn" @click="removeRow(i)">✕</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="actions">
        <button class="btn-ghost" @click="addRow">＋ 添加一行</button>
        <button class="btn-primary" @click="onCalculate">开始计算 GPA</button>
      </div>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </section>
  </div>
</template>

<style scoped>
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 14px;
  padding: 16px; max-width: 820px; margin: 0 auto;
}
.card h3 { font-size: 15px; margin: 0; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.head-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.field-inline { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.field-inline input {
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 13px; width: 90px;
}

.paste-box { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.paste-box textarea {
  border: 1px solid var(--border); border-radius: 10px; padding: 10px; font-size: 13px; font-family: inherit; resize: vertical;
}

.table-scroll { overflow-x: auto; margin-bottom: 12px; }
.entry-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.entry-table th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.entry-table td { padding: 4px; border-bottom: 1px solid var(--border-soft); }
.entry-table input {
  border: 1px solid transparent; border-radius: 6px; padding: 7px 8px; font-size: 13px; width: 100%; background: transparent;
}
.entry-table input:hover, .entry-table input:focus { border-color: var(--border); background: #fff; outline: none; }
.row-no { text-align: center; color: var(--muted); font-size: 12px; }

.del-btn { border: none; background: none; color: #999; cursor: pointer; font-size: 14px; padding: 4px 6px; }
.del-btn:hover { color: #dc2626; }

.actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 8px; }
.btn-primary {
  background: var(--primary); color: #fff; border: none; border-radius: 10px;
  padding: 11px 22px; font-size: 15px; font-weight: 600; cursor: pointer;
}
.btn-primary.small { padding: 8px 14px; font-size: 13px; align-self: flex-end; }
.btn-ghost { background: none; border: 1px solid var(--border); border-radius: 10px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
.btn-ghost:hover { border-color: var(--primary); color: var(--primary); }
.error { color: #dc2626; font-size: 13px; margin: 10px 0 0; }
</style>
