// Quick sanity check on the tax engine. Tests against known scenarios.
import { calcPaystubTax, calcFederalIncomeTax } from '../src/lib/payrollTax.js'

function header(t) { console.log('\n===', t, '===') }

// --- Scenario 1: Single tech, no kids, $25/hr × 80hr biweekly = $2,000 ---
header('Single tech, $2,000 biweekly, no W-4 add-ons, Utah')
const r1 = calcPaystubTax({
  employee: { w4_filing_status: 'single', w4_multiple_jobs: false },
  company:  { sui_rate_pct: 1.2, futa_rate_pct: 0.6, state_employer_id_state: 'UT' },
  gross: 2000,
  ytd: { gross: 0, ssWages: 0, medicareWages: 0 },
  payFrequency: 'bi-weekly',
})
console.table(r1)
// Sanity:
//  - Annual = 52000
//  - After std-ded (baked in): bracket 12% over $18,325 → roughly
//    1202.50 + 12% * (52000-18325) = 1202.50 + 4041 = 5243.50/yr
//    => $201.67/period FIT
//  - SS  6.2% * 2000 = $124.00
//  - MED 1.45% * 2000 = $29.00
//  - SIT 4.55% * 2000 = $91.00
//  - Net = 2000 - 201.67 - 124 - 29 - 91 = $1,554.33

// --- Scenario 2: MFJ, 2 kids ($4000 dep credit), $3000 semimonthly ---
header('MFJ, $3,000 semimonthly, 2 dependents ($4000 credit), Utah')
const r2 = calcPaystubTax({
  employee: {
    w4_filing_status: 'married_jointly',
    w4_dependents_amount: 4000,
  },
  company:  { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
  gross: 3000,
  ytd: { gross: 0, ssWages: 0, medicareWages: 0 },
  payFrequency: 'semimonthly',
})
console.table(r2)

// --- Scenario 3: Wage base test — high earner past Social Security cap ---
header('Past SS wage base — $200k YTD, $5k this period')
const r3 = calcPaystubTax({
  employee: { w4_filing_status: 'single' },
  company:  { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
  gross: 5000,
  ytd: { gross: 200000, ssWages: 200000, medicareWages: 200000 },
  payFrequency: 'bi-weekly',
})
console.table(r3)
// SS = 0 (already past 168,600)
// Add'l Medicare kicks in: 0.9% * 5000 = $45 (since YTD already > 200k)

// --- Scenario 4: Just-in-time additional Medicare (crosses 200k mid-period) ---
header('Crosses 200k mid-period — $198,000 YTD + $5,000 this period')
const r4 = calcPaystubTax({
  employee: { w4_filing_status: 'single' },
  company:  { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
  gross: 5000,
  ytd: { gross: 198000, ssWages: 168600, medicareWages: 198000 },
  payFrequency: 'bi-weekly',
})
console.table(r4)
// Add'l Med should apply only to $3,000 (the portion above $200k).
//   0.9% * 3000 = $27.00

// --- Scenario 5: FUTA cap ---
header('FUTA cap — first $7k vs after')
const r5a = calcPaystubTax({
  employee: { w4_filing_status: 'single' },
  company:  { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
  gross: 5000, ytd: { gross: 0, ssWages: 0, medicareWages: 0 },
})
console.log('First check, $5k gross:    FUTA =', r5a.futa, '(expect $30 = 0.6% * $5,000)')
const r5b = calcPaystubTax({
  employee: { w4_filing_status: 'single' },
  company:  { sui_rate_pct: 1.2, state_employer_id_state: 'UT' },
  gross: 5000, ytd: { gross: 7000, ssWages: 7000, medicareWages: 7000 },
})
console.log('After $7k YTD, $5k gross:  FUTA =', r5b.futa, '(expect $0)')

console.log('\nAll scenarios printed. Eyeball the numbers above.')
