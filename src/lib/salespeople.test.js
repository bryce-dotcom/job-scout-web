import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { salespersonOptions, hasHiddenSalespeople, earnsJobCommission } from './salespeople'

// The job's salesperson field decides sales credit and commission and nothing
// else, so the picker should offer the people who can earn one. It offered
// everybody, and HHH's project manager — the person entering most of the work
// — ended up credited with 5,961 of 7,150 jobs.

const REP = { id: 1, name: 'Doug Webb', is_commission: true, commission_services_rate: 8.5, commission_goods_rate: 8.5 }
const PM_ON_BIG_JOBS = { id: 2, name: 'Christopher Lyman', is_commission: true, commission_services_rate: 5, commission_goods_rate: 5, commission_min_job_total: 10000 }
const CREDITED_BUT_UNPAID = { id: 3, name: 'London Miller', is_commission: false, commission_services_rate: 0, commission_goods_rate: 0 }
const SETTER_ONLY = { id: 4, name: 'Damien Setter', is_commission: true, commission_services_rate: 0, commission_goods_rate: 0, commission_setter_rate: 25 }
const PROCESSOR_ONLY = { id: 5, name: 'Alayda Westcott', is_commission: true, commission_services_rate: 0, commission_goods_rate: 0, commission_processor_rate: 2 }
const CREW = { id: 6, name: 'Cameron McDonough', is_commission: false }
const ALL = [REP, PM_ON_BIG_JOBS, CREDITED_BUT_UNPAID, SETTER_ONLY, PROCESSOR_ONLY, CREW]

describe('who earns commission on a job', () => {
  it('counts a goods or services rate, not a setter fee or a processor rate', () => {
    expect(earnsJobCommission(REP)).toBe(true)
    expect(earnsJobCommission(PM_ON_BIG_JOBS)).toBe(true)     // a floor is still a rate
    expect(earnsJobCommission(SETTER_ONLY)).toBe(false)       // paid per appointment
    expect(earnsJobCommission(PROCESSOR_ONLY)).toBe(false)    // paid per utility invoice
    expect(earnsJobCommission(CREDITED_BUT_UNPAID)).toBe(false)
    expect(earnsJobCommission(CREW)).toBe(false)
    expect(earnsJobCommission(null)).toBe(false)
  })

  it('a rate with the commission switch off is not a commission', () => {
    expect(earnsJobCommission({ is_commission: false, commission_services_rate: 10 })).toBe(false)
  })
})

describe('the picker', () => {
  it('offers the people who can earn, in name order', () => {
    expect(salespersonOptions(ALL).map(o => o.label)).toEqual(['Christopher Lyman', 'Doug Webb'])
  })

  it('always keeps whoever the job already names', () => {
    const opts = salespersonOptions(ALL, 3)
    expect(opts.map(o => o.value)).toContain(3)
    expect(opts.find(o => o.value === 3).label).toBe('London Miller (no longer on commission)')
  })

  it('does not label the current person when they do earn', () => {
    expect(salespersonOptions(ALL, 1).find(o => o.value === 1).label).toBe('Doug Webb')
  })

  it('opens up to everyone on request, without the label', () => {
    const all = salespersonOptions(ALL, 3, true)
    expect(all).toHaveLength(ALL.length)
    expect(all.find(o => o.value === 3).label).toBe('London Miller')
  })

  it('offers the escape hatch only when somebody is actually hidden', () => {
    expect(hasHiddenSalespeople(ALL)).toBe(true)
    expect(hasHiddenSalespeople([REP, PM_ON_BIG_JOBS])).toBe(false)
    expect(hasHiddenSalespeople([])).toBe(false)
  })

  it('survives junk', () => {
    expect(salespersonOptions(null)).toEqual([])
    expect(salespersonOptions([{ name: 'no id' }])).toEqual([])
    expect(salespersonOptions(ALL, '')).toHaveLength(2)
  })
})

// Both job pickers have to go through it, or the habit just moves pages.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')

describe('both job forms use it', () => {
  for (const file of ['src/pages/Jobs.jsx', 'src/pages/JobDetail.jsx']) {
    it(`${file} picks a salesperson from the filtered list`, () => {
      const src = read(file)
      expect(src).toMatch(/options=\{salespersonOptions\(employees, formData\.salesperson_id, showAllSalespeople\)\}/)
      expect(src).toMatch(/hasHiddenSalespeople\(employees, formData\.salesperson_id\)/)
      // and nobody left a raw every-employee list on the salesperson field
      const at = src.indexOf('salespersonOptions')
      expect(src.slice(at - 300, at)).not.toMatch(/salesperson_id[\s\S]*employees\.map/)
    })
  }
})
