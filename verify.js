// 验证 GPA 核心计算逻辑（node verify.js）
import { courseGpa, creditGpa, buildSummary, buildPerStudent, parseNumber } from './src/utils/gpa.js'

let pass = 0
let fail = 0

function assert(actual, expected, label) {
  const ok = actual === expected
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${label}: 期望 ${expected}，实际 ${actual}`)
  }
}

function assertClose(actual, expected, label, eps = 1e-6) {
  const ok = Math.abs(actual - expected) < eps
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${label}: 期望 ${expected}，实际 ${actual}`)
  }
}

// ---- 单科绩点边界 ----
assert(courseGpa(60), 1, '60 → 1.0')
assert(courseGpa(85), 3.5, '85 → 3.5')
assert(courseGpa(100), 5, '100 → 5')
assert(courseGpa(59), 0, '59 → 0')
assert(courseGpa(0), 0, '0 → 0')
assert(courseGpa('87'), 3.7, '字符串"87" → 3.7')
assert(courseGpa('88分'), 3.8, '"88分" → 3.8')
assert(courseGpa('85.5'), 3.55, '"85.5" → 3.55')
assert(courseGpa('合格'), null, '"合格" → null')
assert(courseGpa(''), null, '空 → null')

// ---- 学分绩点 ----
assert(creditGpa(85, 3), 10.5, '85×3 → 10.5')
assert(creditGpa(59, 3), 0, '59×3 → 0')
assert(creditGpa(85, 0), null, '学分为0 → null')
assert(creditGpa('合格', 2), null, '无效成绩 → null')
assert(parseNumber('1,050'), 1050, '千分位"1,050" → 1050')

// ---- 汇总（含挂科） ----
const sample = [
  { name: '高等数学', score: 85, credit: 3, semester: '大一上' },
  { name: '大学英语', score: 78, credit: 2, semester: '大一上' },
  { name: '体育', score: 90, credit: 1, semester: '大一下' },
  { name: '物理', score: 55, credit: 2, semester: '大一下' }, // 挂科
  { name: '选修课', score: '', credit: 1, semester: '大一上' }, // 无成绩，跳过
  { name: '无学分课', score: 88, credit: '', semester: '大一上' }, // 无学分，跳过
]
const { summary, courses, skipped } = buildSummary(sample)

assert(summary.courseCount, 4, '课程数=4（跳过2门）')
assertClose(summary.totalCredit, 8, '总学分=8')
assertClose(summary.totalCreditGpa, 10.5 + 5.6 + 4, '总学分绩点=20.1')
assertClose(summary.gpa, 20.1 / 8, 'GPA=2.5125')
assertClose(summary.weightedAvg, 76.38, '加权平均分=76.38（保留2位）')
assert(skipped, 2, '跳过数=2')

// 明细状态
const failed = courses.find(c => c.name === '物理')
assert(failed.gpa, 0, '挂科课程绩点=0')
assert(failed.creditGpa, 0, '挂科课程学分绩点=0')

// 空数据
const empty = buildSummary([])
assert(empty.summary.gpa, 0, '空数据 GPA=0')

// ---- buildPerStudent（多人分组） ----
const multiRecs = [
  { student: '张三', id: '001', name: '高数', score: 85, credit: 3, semester: '大一上' },
  { student: '张三', id: '001', name: '英语', score: 90, credit: 2, semester: '大一下' },
  { student: '李四', id: '002', name: '高数', score: 60, credit: 3, semester: '大一上' },
  { student: '李四', id: '002', name: '物理', score: 50, credit: 2, semester: '大一下' }, // 挂科
]
const per = buildPerStudent(multiRecs)
assert(per.length, 2, 'buildPerStudent 分组=2人')
assert(per[0].student, '张三', '张三 GPA 更高排首位')
assertClose(per[0].gpa, (3.5 * 3 + 4 * 2) / 5, '张三 GPA=(10.5+8)/5=3.7')
assert(per[1].semesters['大一上'], 1, '李四 大一上 GPA=1')
assertClose(per[1].semesters['大一下'], 0, '李四 大一下含挂科 GPA=0')
assert(per[0].courses.length, 2, '张三明细=2门')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)
