require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const JOB_ID = 21004
  const j = (await s.from('jobs').select('id,job_title,allotted_time_hours,time_tracked').eq('id', JOB_ID).single()).data
  console.log('Job 21004:', j)

  // All time_clock for this job, group by employee
  const tc = await s.from('time_clock').select('employee_id,total_hours,clock_in').eq('job_id', JOB_ID).not('clock_out', 'is', null)
  const byEmp = {}
  for (const t of tc.data || []) {
    byEmp[t.employee_id] = (byEmp[t.employee_id] || 0) + Number(t.total_hours || 0)
  }
  const empIds = Object.keys(byEmp).map(Number)
  const emps = (await s.from('employees').select('id,name,skill_level').in('id', empIds)).data
  const skillCfg = (await s.from('settings').select('value').eq('company_id', 3).eq('key', 'skill_levels').maybeSingle()).data
  let skills = []
  try { skills = JSON.parse(skillCfg?.value || '[]') } catch {}
  const skillWeight = (n) => {
    const s = skills.find(x => (x.name || x) === n)
    return s ? (s.weight || 1) : 1
  }

  const totalHours = Object.values(byEmp).reduce((a,b) => a+b, 0)
  const allotted = j.allotted_time_hours || 0
  const saved = Math.max(0, allotted - totalHours)
  const rate = 30 // from config
  const companyCut = 0.20
  const crewPool = saved * rate * (1 - companyCut)

  console.log(`\nallotted=${allotted}h actual=${totalHours.toFixed(2)}h saved=${saved.toFixed(2)}h crewPool=$${crewPool.toFixed(2)}`)
  console.log('\nCurrent split (skill-weight only) vs proposed (skill × time):')

  const rows = empIds.map(id => {
    const e = emps.find(x => x.id === id)
    const w = skillWeight(e?.skill_level)
    const hours = byEmp[id]
    return { id, name: e?.name, skill: e?.skill_level, weight: w, hours }
  })
  const totalSkillOnly = rows.reduce((s,r) => s + r.weight, 0)
  const totalSkillTime = rows.reduce((s,r) => s + r.weight * r.hours, 0)
  console.log('  ' + 'employee'.padEnd(22) + 'skill'.padEnd(14) + 'hours'.padEnd(10) + 'time%'.padEnd(10) + 'OLD share'.padEnd(14) + 'NEW share')
  for (const r of rows) {
    const oldShare = crewPool * (r.weight / totalSkillOnly)
    const newShare = crewPool * ((r.weight * r.hours) / totalSkillTime)
    const timePct = ((r.hours / totalHours) * 100).toFixed(0) + '%'
    console.log('  ' + r.name.padEnd(22) + (r.skill || '-').padEnd(14) + r.hours.toFixed(2).padEnd(10) + timePct.padEnd(10) + ('$' + oldShare.toFixed(2)).padEnd(14) + ('$' + newShare.toFixed(2)))
  }
})()
