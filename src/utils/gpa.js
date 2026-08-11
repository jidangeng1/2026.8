// 绩点计算核心纯函数（无依赖，可独立测试）
//
// 公式（严格遵循需求）：
//   单科绩点：成绩 >= 60 → (成绩/10) - 5；成绩 < 60 → 0
//   学分绩点 = 单科绩点 × 学分数
//   平均学分绩点 GPA = Σ学分绩点 / Σ学分数

/** 将各种形式的输入解析为数字；解析失败返回 null。
 *  支持："85.5"、"85.5分"、"85%"、"85.5分/0" 忽略尾随非数字、千分位逗号。
 */
export function parseNumber(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s) return null
  // 去掉千分位逗号、去掉末尾的 % 或 分 等非数字单位
  s = s.replace(/,/g, '').replace(/[%分]$/, '')
  // 只允许数字、小数点、正负号开头；其余视为不可解析
  if (!/^[-+]?\d*\.?\d+/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 四舍五入到 n 位小数，消除浮点误差 */
export function round(v, n = 4) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Number(v.toFixed(n))
}

/** 单科课程绩点：>=60 → (成绩/10)-5；<60 → 0；成绩无效 → null */
export function courseGpa(score) {
  const s = parseNumber(score)
  if (s === null) return null
  return round(s >= 60 ? s / 10 - 5 : 0)
}

/** 单科学分绩点 = 课程绩点 × 学分；任一项无效返回 null */
export function creditGpa(score, credit) {
  const c = parseNumber(credit)
  if (c === null || c <= 0) return null
  const g = courseGpa(score)
  if (g === null) return null
  return round(g * c)
}

// 课程记录：{ name, score, credit, semester }
// 返回：
//   summary: { courseCount, totalCredit, totalCreditGpa, gpa, weightedAvg }
//   courses: 带计算结果的明细（含 status，供前端标记）
//   skipped: 未计入的课程数
export function buildSummary(courses) {
  const enriched = []
  let totalCredit = 0
  let totalCreditGpa = 0
  let weightedScore = 0
  let courseCount = 0
  let skipped = 0

  for (const c of courses || []) {
    const name = (c.name || '').trim()
    const score = parseNumber(c.score)
    const credit = parseNumber(c.credit)

    const item = {
      name,
      rawScore: c.score,
      score,
      credit: credit === null ? null : round(credit, 2),
      semester: (c.semester || '').trim(),
      gpa: null,
      creditGpa: null,
      status: 'ok',
      statusText: '',
    }

    // 判定有效性
    if (!name) { item.status = 'skipped'; item.statusText = '无课程名' }
    else if (score === null) { item.status = 'skipped'; item.statusText = '成绩无效' }
    else if (credit === null || credit <= 0) { item.status = 'skipped'; item.statusText = '缺少学分' }
    else if (score < 60) {
      // 挂科：绩点 0，学分计入分母
      item.gpa = 0
      item.creditGpa = 0
      item.status = 'failed'
      item.statusText = '不及格'
      courseCount += 1
      totalCredit += credit
      totalCreditGpa += 0
      weightedScore += score * credit
    } else {
      const g = courseGpa(score)
      item.gpa = g
      item.creditGpa = round(g * credit, 2)
      item.status = 'ok'
      courseCount += 1
      totalCredit += credit
      totalCreditGpa += item.creditGpa
      weightedScore += score * credit
    }

    if (item.status === 'skipped') skipped += 1
    enriched.push(item)
  }

  totalCredit = round(totalCredit, 2)
  totalCreditGpa = round(totalCreditGpa, 2)

  const summary = {
    courseCount,
    totalCredit,
    totalCreditGpa,
    gpa: totalCredit > 0 ? round(totalCreditGpa / totalCredit, 4) : 0,
    weightedAvg: totalCredit > 0 ? round(weightedScore / totalCredit, 2) : 0,
    skipped,
  }

  return { summary, courses: enriched, skipped }
}

/** 按学生分组计算 GPA（records 需含 student / 可选 id 字段）。
 *  返回 [{ student, id, courseCount, totalCredit, gpa, semesters: {学期: gpa} }]，按 GPA 降序。 */
export function buildPerStudent(records) {
  const groups = new Map() // student -> [records]
  for (const rec of records || []) {
    const key = (rec.student || '').trim() || '未命名'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(rec)
  }

  const out = []
  for (const [student, list] of groups) {
    const res = buildSummary(list)
    const bySem = {}
    for (const rec of list) {
      const sem = (rec.semester || '').trim() || '未分类'
      ;(bySem[sem] = bySem[sem] || []).push(rec)
    }
    const semesters = {}
    for (const [sem, l] of Object.entries(bySem)) {
      semesters[sem] = buildSummary(l).summary.gpa
    }
    out.push({
      student,
      id: (list.find((r) => r.id) || {}).id || '',
      courseCount: res.summary.courseCount,
      totalCredit: res.summary.totalCredit,
      gpa: res.summary.gpa,
      semesters,
      courses: res.courses,
    })
  }
  out.sort((a, b) => b.gpa - a.gpa)
  return out
}
