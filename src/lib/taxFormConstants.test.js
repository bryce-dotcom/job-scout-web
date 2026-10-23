// render-tax-forms generates FILED documents — Form 940, Form 33H, W-2 — and
// it used to carry its own copy of the Utah SUI wage base and its own SUI
// rate-in-force precedence, beside a comment saying "Same rule as
// lib/suiRate.suiRateInForce on the app side". Those now come from
// _shared/suiRate, so they cannot split.
//
// Two constants deliberately did NOT move. render-tax-forms keeps a per-year
// SS wage base for 2024/2025/2026, and _shared/payrollTax only carries the
// current year (federalFor falls back to the latest it knows) — so reading the
// shared one would hand a 2024 W-2 the 2026 base. The forms table is the
// better one for prior years; adding years to FEDERAL_YEARS means a full
// bracket set, not a lone wage base, so it is not a thing to do in passing.
//
// What protects them instead is this: for the CURRENT tax year the two must
// agree. The yearly refresh (see payrollTax.taxTablesStale) updates one file,
// and this fails if it forgets the other.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TAX_YEAR, FEDERAL_YEARS } from '../../supabase/functions/_shared/payrollTax.ts'
import { suiWageBaseFor } from '../../supabase/functions/_shared/suiRate.ts'

const SRC = readFileSync('supabase/functions/render-tax-forms/index.ts', 'utf8')

describe('the tax forms and the payroll tables agree for the current year', () => {
  it('social security wage base', () => {
    const table = SRC.match(/const SS_WAGE_BASE[^=]*=\s*\{([^}]*)\}/)
    expect(table, 'SS_WAGE_BASE not found in render-tax-forms').toBeTruthy()
    const entries = table[1].split(',').map(x => x.trim()).filter(Boolean)
    const forYear = entries.find(x => x.startsWith(String(TAX_YEAR)))
    expect(forYear, 'render-tax-forms has no SS wage base for ' + TAX_YEAR).toBeTruthy()
    expect(Number(forYear.split(':')[1])).toBe(FEDERAL_YEARS[TAX_YEAR].ssWageBase)
  })

  it('social security and medicare rates', () => {
    const ss = /const SS_RATE\s*=\s*([\d.]+)/.exec(SRC)
    const med = /MED_RATE\s*=\s*([\d.]+)/.exec(SRC)
    expect(Number(ss[1])).toBe(FEDERAL_YEARS[TAX_YEAR].ssRate)
    expect(Number(med[1])).toBe(FEDERAL_YEARS[TAX_YEAR].medicareRate)
  })

  it('FUTA wage base', () => {
    const futa = /const FUTA_BASE\s*=\s*(\d+)/.exec(SRC)
    expect(futa, 'FUTA_BASE not found in render-tax-forms').toBeTruthy()
    expect(Number(futa[1])).toBe(FEDERAL_YEARS[TAX_YEAR].futaWageBase)
  })
})

describe('the SUI rules are no longer restated in the forms', () => {
  it('the Utah-only wage-base table is gone', () => {
    expect(SRC).not.toContain('UTAH_SUI_WAGE_BASE')
    expect(SRC).toContain('suiWageBaseFor')
  })

  it('the rate-in-force precedence comes from suiRate', () => {
    expect(SRC).toContain('suiRateInForce')
    // The hand-rolled fallback chain this replaced.
    expect(SRC).not.toContain('rateRow ? Number(rateRow.rate_pct)')
  })

  it('and suiRate still knows Utah for both years the forms can cover', () => {
    expect(suiWageBaseFor('UT', 2025)).toBe(48900)
    expect(suiWageBaseFor('UT', 2026)).toBe(50700)
  })
})
