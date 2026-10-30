// A recurring series keeps going however its visit is finished (Bryce,
// 2026-10-29). HHH finishes visits by invoicing, closing or getting paid, so
// a rule that only knew "Completed" stopped every series at its third visit,
// and the page and Jenny read an invoiced July visit as the series' next one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { seriesOf, isFinished, isOpenVisit } from '../../supabase/functions/_shared/recurringSeries.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const job = (id, status, day, over = {}) => ({ id, job_id: `J-${id}`, status, start_date: day, recurrence: 'Monthly', customer_id: 1, job_title: 'Windows', ...over })

describe('finished means done, however the office marks it', () => {
  it('Invoiced, Paid and Closed are finished; Scheduled and Chillin are open; Cancelled is neither', () => {
    for (const s of ['Completed', 'Invoiced', 'Paid', 'Closed']) expect(isFinished(s)).toBe(true)
    for (const s of ['Scheduled', 'Chillin', 'In Progress']) expect(isOpenVisit(s)).toBe(true)
    expect(isOpenVisit('Cancelled')).toBe(false)
    expect(isFinished('Cancelled')).toBe(false)
  })
})

describe('the next visit is the earliest one not done', () => {
  it('an invoiced July visit does not hide the October one (Fieldstone Canyon Point)', () => {
    const { open } = seriesOf([
      job(21040, 'Invoiced', '2026-07-02', { recurrence: 'Quarterly' }),
      job(23387, 'Scheduled', '2026-10-22', { recurrence: 'Quarterly', recurrence_parent_id: 21040 }),
    ], '2026-10-29')
    expect(open.map((j) => j.id)).toEqual([23387])
  })
  it('an overdue visit is the next one, ahead of a later one in the same series', () => {
    const { open } = seriesOf([job(1, 'Scheduled', '2026-11-20'), job(2, 'Scheduled', '2026-10-20', { recurrence_parent_id: 1 })], '2026-10-29')
    expect(open.map((j) => j.id)).toEqual([2])
  })
})

describe('a series with nothing booked next has stopped, and says so', () => {
  it('Desert Books: every visit finished, no next one — stopped, with its last visit', () => {
    const { open, stalled } = seriesOf([
      job(23533, 'Closed', '2026-08-31'),
      job(23573, 'Closed', '2026-09-28', { recurrence_parent_id: 23533 }),
      job(23903, 'Invoiced', '2026-10-21', { recurrence_parent_id: 23533 }),
    ], '2026-10-29')
    expect(open).toEqual([])
    expect(stalled.map((j) => j.id)).toEqual([23903])
  })
  it('not stopped when it reached its end date, or every visit was called off', () => {
    const ended = seriesOf([job(1, 'Paid', '2026-09-01', { recurrence_end_date: '2026-10-01' })], '2026-10-29')
    const off = seriesOf([job(2, 'Cancelled', '2026-09-01')], '2026-10-29')
    expect([ended.stalled, off.stalled]).toEqual([[], []])
  })
  it('not stopped when the customer has the same visit booked as its own recurring job (Specialty Linens months)', () => {
    const { stalled } = seriesOf([job(21049, 'Closed', '2026-05-22'), job(21054, 'Scheduled', '2026-10-23')], '2026-10-29')
    expect(stalled).toEqual([])
  })
  it('not stopped when the customer moved on to a newer series (Jan Pro April → September)', () => {
    const { stalled } = seriesOf([
      job(21060, 'Closed', '2026-04-23', { job_title: 'April Exterior' }),
      job(23548, 'Invoiced', '2026-09-01', { job_title: 'September Exterior' }),
    ], '2026-10-29')
    expect(stalled.map((j) => j.id)).toEqual([23548])
  })
})

describe('one rule, read by the page and by Jenny', () => {
  it('both import it and neither keeps its own done list', () => {
    const page = read('src/pages/RecurringJobs.jsx')
    const lookups = read('supabase/functions/_shared/arnieLookups.ts')
    expect(page).toMatch(/import \{ seriesOf \} from '\.\.\/\.\.\/supabase\/functions\/_shared\/recurringSeries\.ts'/)
    expect(lookups).toMatch(/from '\.\/recurringSeries\.ts'/)
    expect(page).not.toMatch(/const TERMINAL =/)
    expect(lookups).not.toMatch(/SERIES_DONE/)
  })
})

describe('the trigger books the next visit on any finish (migration 20261030120000)', () => {
  const sql = read('supabase/migrations/20261030120000_recurring_spawn_on_any_finish.sql')
  const shared = read('supabase/functions/_shared/recurringSeries.ts')
  it('finished means the same thing in the database as on the page', () => {
    const list = (src, re) => src.match(re)[1].match(/'([^']+)'/g).join(',')
    expect(list(sql, /c_finished CONSTANT TEXT\[\] := ARRAY\[([^\]]+)\]/)).toBe(list(shared, /export const FINISHED = \[([^\]]+)\]/))
    expect(list(sql, /c_off\s+CONSTANT TEXT\[\] := ARRAY\[([^\]]+)\]/)).toBe(list(shared, /export const CALLED_OFF = \[([^\]]+)\]/))
  })
  it('fires on the first move into finished, and a finished visit never blocks the next', () => {
    expect(sql).toMatch(/IF NOT \(NEW\.status = ANY \(c_finished\)\)\s+OR \(OLD\.status IS NOT NULL AND OLD\.status = ANY \(c_finished\)\) THEN\s+RETURN NEW;/)
    expect(sql).toMatch(/WHERE \(recurrence_parent_id = v_root_id OR id = v_root_id\)\s+AND id <> NEW\.id\s+AND NOT \(status = ANY \(c_finished\)\)\s+AND NOT \(status = ANY \(c_off\)\)/)
  })
  it('never books into the past, and stands down for a look-alike already booked', () => {
    expect(sql).toMatch(/WHILE v_next_ts::date < current_date AND v_steps < 1000 LOOP/)
    expect(sql).toMatch(/AND customer_id = NEW\.customer_id[\s\S]{0,200}AND btrim\(COALESCE\(job_title, ''\)\) = btrim\(COALESCE\(NEW\.job_title, ''\)\)/)
  })
})

describe('the next visit keeps its price (migration 20261030140000)', () => {
  it('job_total and where it came from are copied with the lines', () => {
    const sql = read('supabase/migrations/20261030140000_recurring_visit_keeps_its_price.sql')
    expect(sql).toMatch(/recurrence_landing,\s+job_total, job_total_source,\s+source_system, created_at, updated_at\s+\)/)
    expect(sql).toMatch(/recurrence_end_date, recurrence_landing,\s+job_total, job_total_source,\s+'recurrence_spawn'/)
    expect(sql).toMatch(/WHILE v_next_ts::date < current_date/)
  })
})
