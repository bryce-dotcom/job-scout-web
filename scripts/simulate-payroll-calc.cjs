// Simulate Payroll.jsx calculateEmployeeHours() for London Miller
// to verify the calculation produces $747, not 0.02h.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const EMP = 19
  const period = { start: '2026-05-01T00:00:00Z', end: '2026-05-15T23:59:59Z' }

  // Same query Payroll does
  const tc = (await s.from('time_clock').select('*')
    .eq('company_id', 3)
    .gte('clock_in', period.start)
    .lte('clock_in', period.end)
    .not('clock_out', 'is', null)).data || []
  const tl = (await s.from('time_log').select('*')
    .eq('company_id', 3)
    .gte('created_at', period.start)
    .lte('created_at', period.end)).data || []

  console.log(`time_clock company-wide rows: ${tc.length}`)
  console.log(`time_log company-wide rows: ${tl.length}`)

  // Now run calculateEmployeeHours for London (id=19) inline
  const empEntries = tc.filter(e => e.employee_id === EMP)
  const empTimeLogs = tl.filter(e => e.employee_id === EMP)
  console.log(`London empEntries: ${empEntries.length}, empTimeLogs: ${empTimeLogs.length}`)

  const dayKey = (d) => new Date(d).toISOString().slice(0, 10)
  const weekKey = (d) => { const w = new Date(d); w.setDate(w.getDate() - w.getDay()); return w.toISOString().slice(0, 10) }
  const dayMap = {}
  const ensureDay = (d) => {
    const dk = dayKey(d)
    if (!dayMap[dk]) dayMap[dk] = { week: weekKey(d), clockHours: 0, logHours: 0 }
    return dayMap[dk]
  }
  empEntries.forEach(entry => {
    let hours = entry.total_hours
    if (!hours && entry.clock_in && entry.clock_out) hours = Math.round((new Date(entry.clock_out) - new Date(entry.clock_in)) / 36e5 * 100) / 100
    if (!hours || !entry.clock_in) return
    ensureDay(entry.clock_in).clockHours += hours
  })
  empTimeLogs.forEach(entry => {
    if (!entry.hours) return
    const dt = entry.date || entry.clock_in_time || entry.created_at
    if (!dt) return
    ensureDay(dt).logHours += entry.hours
  })
  console.log('\nDay buckets:')
  for (const [day, info] of Object.entries(dayMap)) {
    console.log(`  ${day} week=${info.week} clock=${info.clockHours.toFixed(2)} log=${info.logHours.toFixed(2)}`)
  }
  const weeklyHours = {}
  Object.values(dayMap).forEach(({ week, clockHours, logHours }) => {
    const hrs = clockHours > 0 ? clockHours : logHours
    weeklyHours[week] = (weeklyHours[week] || 0) + hrs
  })
  console.log('\nWeekly buckets:', weeklyHours)

  let regularHours = 0, overtimeHours = 0
  Object.values(weeklyHours).forEach(h => {
    if (h <= 40) regularHours += h
    else { regularHours += 40; overtimeHours += h - 40 }
  })
  console.log(`\nFinal: regularHours=${regularHours.toFixed(2)}, overtimeHours=${overtimeHours.toFixed(2)}`)
  console.log(`Pay = ${regularHours.toFixed(2)} * $31 + ${overtimeHours.toFixed(2)} * $46.50 = $${(regularHours * 31 + overtimeHours * 46.5).toFixed(2)}`)
})()
