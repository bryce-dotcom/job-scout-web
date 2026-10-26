import { describe, it, expect } from 'vitest'
import { loadPayrollPeriod, periodWindow, ytdFromStubs, PayrollLoadError } from './payrollLoader'

// A supabase stand-in that records every query and answers from a table
// map. Chainable like the real builder; awaiting it (or .range / .maybeSingle)
// resolves { data, error }.
function fakeSupabase(tables = {}, failing = new Set()) {
  const calls = []
  const from = (table) => {
    const q = { table, filters: [], select: null, range: null }
    calls.push(q)
    const api = {}
    const chain = (name) => (...args) => { q.filters.push([name, ...args]); return api }
    for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'not', 'or', 'in', 'is', 'order']) api[m] = chain(m)
    api.select = (s) => { q.select = s; return api }
    const answer = () => failing.has(table) ? { data: null, error: { message: `${table} is down` } } : { data: tables[table] || [], error: null }
    api.range = (a, b) => { q.range = [a, b]; return Promise.resolve(answer()) }
    api.maybeSingle = () => Promise.resolve({ ...answer(), data: (tables[table] || [])[0] || null })
    api.then = (res, rej) => Promise.resolve(answer()).then(res, rej)
    return api
  }
  return { from, calls }
}

const period = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 15) }
const base = {
  settings: [{ value: JSON.stringify({ pay_frequency: 'semi-monthly', overtime_threshold: 40 }) }],
  companies: [{ id: 3, state: 'UT', sui_rate_pct: 0.2, setter_qualification_rule: 'quote_created' }],
  paystubs: [{ employee_id: 7, gross_pay: 1000, taxable_wages: 900 }, { employee_id: 7, gross_pay: 500, taxable_wages: null }],
  time_clock: [{ id: 1, employee_id: 7, clock_in: '2026-10-05T14:00:00Z', total_hours: 8 }],
}

describe('periodWindow', () => {
  it('runs from local midnight to the last millisecond of the last day, and knows the legacy end', () => {
    const w = periodWindow(period)
    expect(w.startStr).toBe('2026-10-01')
    expect(w.endStr).toBe('2026-10-15')
    expect(w.legacyEndStr).toBe('2026-10-16')
    expect(w.end.getHours()).toBe(23)
    expect(w.end.getMinutes()).toBe(59)
  })
})

describe('loadPayrollPeriod', () => {
  it('asks every table the engine needs, once, for the company', async () => {
    const sb = fakeSupabase(base)
    const r = await loadPayrollPeriod(sb, { companyId: 3, period, today: new Date(2026, 9, 23) })
    const tables = sb.calls.map(c => c.table)
    for (const t of ['time_clock', 'time_log', 'lead_commissions', 'rep_commissions', 'job_bonuses', 'time_off_requests', 'payroll_adjustments', 'employee_benefits', 'paystubs', 'settings', 'companies', 'company_sui_rates']) {
      expect(tables, `asks ${t}`).toContain(t)
    }
    expect(r.timeEntries).toHaveLength(1)
    expect(r.payrollConfig.pay_frequency).toBe('semi-monthly')
    expect(r.setterRule).toBe('quote_created')
    expect(r.company.sui_rate_pct).toBe(0.2)
  })

  it('uses the page\'s windows: punches by clock_in, logs and fees by created_at, time off overlapping, adjustments by period or recurring, stubs this year', async () => {
    const sb = fakeSupabase(base)
    await loadPayrollPeriod(sb, { companyId: 3, period, today: new Date(2026, 9, 23) })
    const q = (t) => sb.calls.find(c => c.table === t)
    const has = (t, m, col) => q(t).filters.some(f => f[0] === m && f[1] === col)
    expect(has('time_clock', 'gte', 'clock_in') && has('time_clock', 'lte', 'clock_in')).toBe(true)
    expect(q('time_clock').filters.some(f => f[0] === 'not' && f[1] === 'clock_out')).toBe(true)
    expect(has('time_log', 'gte', 'created_at')).toBe(true)
    const lead = q('lead_commissions').filters.find(f => f[0] === 'or')[1]
    expect(lead).toContain('created_at.gte.')
    expect(lead).toContain('payment_status.neq.paid')   // older fees still owed come too
    expect(has('time_off_requests', 'lte', 'start_date') && has('time_off_requests', 'gte', 'end_date')).toBe(true)
    expect(q('time_off_requests').filters.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'approved')).toBe(true)
    const adj = q('payroll_adjustments').filters.find(f => f[0] === 'or')[1]
    expect(adj).toContain('pay_period_start.eq.2026-10-01')
    expect(adj).toContain('pay_period_end.in.(2026-10-15,2026-10-16)')
    expect(adj).toContain('recurring.eq.true')
    expect(q('paystubs').filters.some(f => f[0] === 'gte' && f[1] === 'pay_date' && f[2] === '2026-01-01')).toBe(true)
  })

  it('scopes every per-person table to one employee for My Pay, and leaves the company tables alone', async () => {
    const sb = fakeSupabase(base)
    await loadPayrollPeriod(sb, { companyId: 3, period, employeeId: 7, today: new Date(2026, 9, 23) })
    const scoped = (t) => sb.calls.filter(c => c.table === t).every(c => c.filters.some(f => f[0] === 'eq' && f[1] === 'employee_id' && f[2] === 7))
    for (const t of ['time_clock', 'time_log', 'lead_commissions', 'rep_commissions', 'job_bonuses', 'time_off_requests', 'payroll_adjustments', 'employee_benefits', 'paystubs']) {
      expect(scoped(t), `${t} scoped to employee 7`).toBe(true)
    }
    for (const t of ['settings', 'companies', 'company_sui_rates']) {
      expect(scoped(t), `${t} not scoped`).toBe(false)
    }
  })

  it('refuses partial data: one failed table fails the whole load and is named', async () => {
    const sb = fakeSupabase(base, new Set(['payroll_adjustments', 'time_log']))
    let err = null
    try { await loadPayrollPeriod(sb, { companyId: 3, period }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(PayrollLoadError)
    expect(err.failed.map(f => f.table).sort()).toEqual(['payroll_adjustments', 'time_log'])
    expect(err.message).toMatch(/payroll_adjustments/)
  })

  it('a config that is not JSON is an error, not an empty config', async () => {
    const sb = fakeSupabase({ ...base, settings: [{ value: '{not json' }] })
    await expect(loadPayrollPeriod(sb, { companyId: 3, period })).rejects.toThrow(/payroll_config is not valid JSON/)
  })

  it('year to date sums taxable wages, gross where a stub has none', () => {
    const y = ytdFromStubs(base.paystubs)
    expect(y[7]).toEqual({ gross: 1500, ssWages: 1400, medicareWages: 1400 })
  })
})
