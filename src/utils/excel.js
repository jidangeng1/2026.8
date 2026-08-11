// Excel 解析与导出（基于 SheetJS / xlsx）
import * as XLSX from 'xlsx'

/**
 * 解析上传的 Excel 文件，返回全部 Sheet：
 *   [{ name: string, rows: string[][] }]
 * rows 用显示格式的字符串表示，便于预览和列配置。
 */
export async function parseWorkbook(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheets = wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
    // 去掉整行为空的尾行
    const rows = rawRows.filter((row) =>
      row.some((cell) => String(cell ?? '').trim() !== ''),
    )
    return { name: sheetName, rows }
  })
  return sheets
}

/** 根据 Sheet 行列生成预览（只取前若干行） */
export function previewRows(rows, maxRows = 8, maxCols = 12) {
  return rows.slice(0, maxRows).map((row) => row.slice(0, maxCols))
}

const SUMMARY_PAT = /(^\d+人$|不及格|^平均|^统计)/
const SKIP_COL_PAT = /序号|学号|姓名|门数|学时|学期|性质|分类|学分列|所得学分|排名|平均分|总分/

/**
 * 自动识别常见成绩表结构（如"潍坊医学院 班级成绩表"：表头下带 性质/分类/学分/学时/学期 元数据行，随后是学生数据）。
 * 输入：sheet 的字符串矩阵 rows（0 基）。输出：
 *   { headerRow, creditRow, dataStart, dataEnd, nameCol, idCol, courseCols:[{idx,name,credit}] }
 */
export function autoDetect(rows) {
  // 1. 表头行：前 10 行内找含"姓名"或"学号"的行
  let headerRow = 0
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const line = String(rows[r].join(' '))
    if (/姓名|学号/.test(line)) { headerRow = r; break }
  }
  const header = rows[headerRow] || []

  // 2. 学分行：表头之下找含"学分"元数据的行
  let creditRow = -1
  for (let r = headerRow + 1; r < Math.min(headerRow + 8, rows.length); r++) {
    if (String(rows[r].join(' ')).includes('学分')) { creditRow = r; break }
  }

  // 3. 姓名列 / 学号列
  let nameCol = header.findIndex((c) => /姓名/.test(String(c)))
  let idCol = header.findIndex((c) => /学号/.test(String(c)))
  if (nameCol < 0 && idCol >= 0) nameCol = idCol + 1 // 兜底：有学号无姓名时取下一列

  // 4. 课程列：表头非空、学分行有数字学分、非学号/姓名/汇总列
  const courseCols = []
  header.forEach((h, c) => {
    const title = String(h || '').trim()
    if (!title) return
    if (c === nameCol || c === idCol) return
    if (SKIP_COL_PAT.test(title)) return
    let credit = null
    if (creditRow >= 0) {
      const cv = String(rows[creditRow]?.[c] ?? '').trim()
      const n = Number.parseFloat(cv)
      if (!Number.isNaN(n) && n > 0) credit = n
    }
    if (credit === null) return
    courseCols.push({ idx: c, name: title, credit })
  })

  // 5. 数据区起始：表头之后跳过元数据行（性质/分类/学分/学时/学期 标签），到第一个有学号/姓名的行
  const cell = (r, c) => (c >= 0 ? String(rows[r]?.[c] ?? '').trim() : '')
  const META_LABEL = /^(性质|分类|学分|学时|学期|序号|备注)$/
  let dataStart = headerRow + 1
  for (; dataStart < rows.length; dataStart++) {
    const id = cell(dataStart, idCol)
    const nm = cell(dataStart, nameCol)
    if (META_LABEL.test(id) || META_LABEL.test(nm)) continue
    if (id || nm) break
  }

  // 6. 数据区结束：遇到汇总行（学号为空且姓名为空或含汇总词）停止
  let dataEnd = rows.length
  for (let r = dataStart; r < rows.length; r++) {
    const id = cell(r, idCol)
    const nm = cell(r, nameCol)
    if (id === '' && (nm === '' || SUMMARY_PAT.test(nm))) { dataEnd = r; break }
  }

  // 7. 判定表类型：个人成绩单（如学校导出的个人明细，底部含"平均学分绩点"），否则视为班级表
  const allText = rows.slice(0, rows.length).join('|')
  let kind = 'class'
  let officialGpa = null
  if (allText.includes('平均学分绩点')) {
    kind = 'personal'
    // 读取官方 GPA：找"平均学分绩点"之后的下一个数字
    for (let r = 0; r < rows.length; r++) {
      if (String(rows[r].join('|')).includes('平均学分绩点')) {
        for (let rr = r; rr < rows.length; rr++) {
          const nums = rows[rr].map((v) => Number.parseFloat(String(v ?? ''))).filter((n) => !Number.isNaN(n))
          if (nums.length && nums.every((n) => n > 0)) { officialGpa = nums[0]; break }
        }
        break
      }
    }
  }

  return { headerRow, creditRow, dataStart, dataEnd, nameCol, idCol, courseCols, kind, officialGpa }
}

/** 导出计算结果为 Excel 文件 */
export function exportResults(courses, summary, semesterLabel = '全部') {
  const overview = [
    ['学分绩点计算结果', ''],
    ['统计范围', semesterLabel],
    ['课程数', summary.courseCount],
    ['总学分', summary.totalCredit],
    ['总学分绩点', summary.totalCreditGpa],
    ['平均学分绩点 (GPA)', summary.gpa],
    ['加权平均分', summary.weightedAvg],
    ['未计入课程数', summary.skipped],
  ]
  const detail = [
    ['课程名', '成绩', '学分', '学期', '课程绩点', '学分绩点', '状态'],
    ...courses.map((c) => [
      c.name,
      c.rawScore,
      c.credit,
      c.semester,
      c.gpa,
      c.creditGpa,
      c.statusText || (c.status === 'failed' ? '不及格' : c.status === 'ok' ? '正常' : '未计入'),
    ]),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), '总览')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), '明细')
  XLSX.writeFile(wb, '绩点计算结果.xlsx')
}

/**
 * 导出全班（或多学生）绩点汇总：
 *   perStudent: [{ student, id, courseCount, totalCredit, gpa, semesters: {学期:gpa} }]
 *   coursesByStudent: { student: 该生明细记录[] }（用于明细 Sheet）
 *   title: 文件标题前缀（如"23管一1"）
 */
export function exportClassResults(perStudent, coursesByStudent, title = '班级') {
  // 汇总表：学生 / 学号 / 课程数 / 总学分 / GPA + 每学期 GPA 列
  const semNames = []
  for (const p of perStudent) for (const s of Object.keys(p.semesters)) if (!semNames.includes(s)) semNames.push(s)
  const header = ['姓名', '学号', '课程数', '总学分', '平均学分绩点(GPA)', ...semNames.map((s) => `GPA-${s}`)]
  const rows = [header]
  for (const p of perStudent) {
    rows.push([
      p.student, p.id, p.courseCount, p.totalCredit, p.gpa,
      ...semNames.map((s) => (p.semesters[s] !== undefined ? p.semesters[s] : '')),
    ])
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '全班绩点汇总')

  // 每人一个明细 Sheet（最多留前 20 人，避免文件过大）
  for (const p of perStudent.slice(0, 20)) {
    const list = coursesByStudent[p.student] || []
    const detail = [
      ['课程名', '成绩', '学分', '学期', '课程绩点', '学分绩点', '状态'],
      ...list.map((c) => [
        c.name, c.rawScore, c.credit, c.semester, c.gpa, c.creditGpa,
        c.statusText || (c.status === 'failed' ? '不及格' : c.status === 'ok' ? '正常' : '未计入'),
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), p.student.slice(0, 20))
  }

  XLSX.writeFile(wb, `${title}绩点汇总.xlsx`)
}
