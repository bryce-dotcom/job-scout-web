# Payroll: the plan to make it boring

Bryce, 2026-10-20: "the last 5 payrolls are always fucked up… I want a plan with every single detail that the payroll page does and every single line of code checked against what we are doing and the bigger picture."

## Why it keeps breaking (three causes, not fifty)

1. **One 6,336-line page computes pay live, at render time, from 23 tables.** `src/pages/Payroll.jsx` holds 45 pieces of state, 8 effects, 14 memos and 55 functions. The number on screen is recomputed every time anything loads, in whatever order it loads. A commission that arrives after the memo ran is a commission that vanished (Sep 20). A page that writes the bonus ledger while it reads it demotes paid bonuses (fixed four separate times, the last one today).
2. **Three sources of truth for the same dollar.** Live calculation (`bonusCalc`, `calculateInvoiceCommissions`), frozen ledgers (`job_bonuses`, `rep_commissions`, `lead_commissions`) and the stubs (`paystubs`). They drift, and the page reconciles them in its head on every render. Every "where did Cole's $11k go" was two of these disagreeing.
3. **Nothing replays a real payroll before it ships.** Six sessions changed this page in ten days. Tests cover pure libraries; nothing runs the whole period for HHH and says "same answer as last time." So each payroll is the first test of whatever shipped that week.

## The rule from here

**No feature work on Payroll or My Pay until step 3 below is green.** Bug fixes only, each with a replay test that fails before and passes after.

## The plan

### 1. Inventory — every thing the page does (done below, keep it current)
The table at the bottom is the page, grouped by responsibility, with where it reads, what it writes, what broke in the last five payrolls, and whether a test exists. Every future change names the row it touches.

### 2. One engine, pure, replayable — `src/lib/payrollEngine.js` (week 1)
Move `calculateFullPay`, `calculateEmployeeHours`, the commission/bonus/PTO/benefit/adjustment assembly and the tax call out of the page into one pure function:

```
buildPayroll({ period, employees, timeEntries, timeLogs, jobs, invoices, payments, leads,
               repCommissions, leadCommissions, jobBonuses, adjustments, benefits,
               timeOff, ytdStubs, company, payrollConfig })
  → { stubs: [...], liabilities: [...], ledgerMarks: {...}, warnings: [...] }
```
No Supabase, no React, no dates from the wall clock. The page calls it once with loaded data and renders the result. My Pay calls the same function for one employee, so the two can never disagree again. One loader, `loadPayrollPeriod(companyId, period)`, fetches everything the engine needs and nothing else; it refuses to return partial data (today three different loaders race).

### 3. Golden replays — the last five HHH payrolls, frozen (week 1–2)
For each of the five (Aug 5 ×4 catch-up, Aug 20 ×2, Sep 20, Oct 5 Gusto, Oct 20): snapshot the inputs from the database into `test/fixtures/payroll/<pay_date>/` (anonymized), record the answer we KNOW is right (the cheques that were written, the Gusto journal, Alayda's corrections), and assert `buildPayroll(fixture)` reproduces it to the cent. These run on every commit. **A payroll change that moves a golden number does not ship until someone says the new number is the right one.**

### 4. Run = one transaction (week 2)
`handleRunPayroll` does eleven writes in sequence from the browser (run, stubs, PTO, bonus marks, commission marks, liabilities, typed-hours watermark, stub PDFs, email). A failure halfway leaves bonuses unmarked and gets them paid twice. Replace with one RPC, `process_payroll_run(payload)`, that writes all of it or none of it, and returns the run id. The browser renders what the RPC returns.

### 5. Preflight and postflight that cannot be skipped (week 2)
Before processing (extends `payrollRunGuards`): every employee's gross equals its parts; no open punch; no typed hours uncounted; no queued ledger row outside the period; no duplicate period; YTD caps applied; deposit schedule set; every W-2 has a W-4 or an acknowledgement. After processing: a reconciliation report — stubs vs ledger marks vs liabilities vs prior period — emailed to Bryce and Alayda, exceptions first. A payroll is not done until that report has zero exceptions.

### 6. Staging before HHH (week 3, then every payroll)
A copy of HHH's data in a staging tenant runs the period one day before HHH does, on the build that will ship. Alayda compares the staging total to her own number before the real run. If they differ, the real run waits.

### 7. One owner, one branch, one ship (now)
Payroll code lands from one branch, after the goldens, after staging. Other sessions do not touch `Payroll.jsx`, `MyPay.jsx`, `payrollEngine.js`, `payrollTax.js`, `bonusCalc.js`, `bonusLedger.js`, `repCommissions.js` without the replay suite green. `npm run guard` enforces: a change to those files fails CI if a golden fixture's output changed and the fixture's expected file did not.

## Acceptance
- Golden replays for all five payrolls pass, every commit.
- Oct 20 (Oct 1–15) and the next two payrolls run with a zero-exception postflight report and no correction by Alayda afterwards.
- Payroll.jsx under 2,000 lines, rendering only. No pay math in a component.

---

## The inventory: what the Payroll page does today (`src/pages/Payroll.jsx` on main, 6,336 lines)

| # | Responsibility | Code (line) | Reads | Writes | Broke in the last 5 payrolls | Test today |
|---|---|---|---|---|---|---|
| 1 | Pay period & pay date | `getNextPayDate` 1059, `getDaysUntilPayday` 1101, `payDateForPeriod` (lib), schedule seed effects 553–607 | `settings.payroll_config`, `companies.pay_frequency` | — | Company row (bi-weekly) could overwrite settings (semi-monthly) → 14-day period, wrong Utah table. Fixed 10-12. | lib/payDate yes; page race no |
| 2 | Hours | `calculateEmployeeHours` 1118, `resolveUnassignedHoursByCrewDay` 1488, `applyTypedHours` 1597, open-punch `attentionEntries` 360 | `time_entries`, `job_time_logs`, typed hours on jobs | `payroll_config.typed_hours_counted_through` | 810-hour open punch paid as hours (Cameron). Typed hours uncounted until the button; button did not stick. | lib/jobHours yes; page no |
| 3 | Salary / hourly / overtime | inside `calculateFullPay` 1747 | employee card (`is_hourly`, `hourly_rate`, `annual_salary`, `overtime_mode`) | — | Salary ÷ periods used the wrong period count when the schedule raced. | none |
| 4 | PTO | `addPtoAtPayroll` 2145, `removePtoFromPayroll` 2170, `periodTimeOff` effect 483, lib/ptoThisPeriod | `time_off_requests`, employee `pto_*` | `employees.pto_accrued/pto_used` at run | Confusing to add/remove; accrual could apply twice on a re-run (guarded 10-05). | lib yes; page no |
| 5 | Sales commissions | `calculateInvoiceCommissions` 1199/1234 (live), `syncRepCommissions` on load, `markRepCommissionsPaid` 1440, `setQueuedForPayroll` 1453, `commissionIssues` 1412 | `rep_commissions`, `invoices`, `payments`, `jobs`, `leads`, `utility_invoices` | `rep_commissions` (sync inserts/deletes unpaid rows on every page load; marks paid at run) | Commissions vanished from the run (memo deps missed `repCommissions`); an invoice earned its rep twice; a September row deleted for being out of the window; override added 10-15. | lib/repCommissions yes; page no |
| 6 | Lead / setter commissions | `calculateLeadCommissions` 1422, `markCommissionsPaid` 1429 | `lead_commissions`, `leads` | `lead_commissions.payment_status` | — | lib/setterCommissions yes |
| 7 | Efficiency bonuses | `syncJobBonuses` on load (effects 1640/1683), `accruedByEmployee` 1704, `bonusesByEmployee` 1715, `handleBonusVerify` 2314, `handleBonusesPaid` 2398, `verifiedJobIds` 1473, `dailyVerifiedJobDays` 1479 | `job_bonuses`, `jobs`, `verification_reports`, `payroll_adjustments` (overrides) | `job_bonuses` (sync rewrites non-paid rows on every page load; marks paid at run) | Paid bonuses sent back to "not owed" on page open (fixed 10-20); partial view demoted bonuses (10-20); bonus needs a real punch (10-20); not marked paid at run (10-05); override reason (10-14). **Most-churned area.** | lib/bonusCalc & bonusLedger yes; page no |
| 8 | Adjustments | `handleAddAdjustment` 2277, `handleDeleteAdjustment` 2301 | `payroll_adjustments` (period or recurring) | same | Legacy `bonus_override` additions double-paid (excluded 10-05). | none |
| 9 | Recurring deductions | `benefits` effect 406, lib/benefitDeductions | `employee_benefits` | — | Never read by payroll until 10-12 ($7.50/check missed all year). | lib yes |
| 10 | Taxes | `taxCompany` 1943, `calcPaystubTax` (lib), `ytdPaystabsByEmployee` 1731, `suiRateHistory` | `paystubs` (YTD), `companies` tax fields, `company_sui_rates` | — | Utah flat 4.5% over-withheld; SUI 0.1 vs 0.2; deposit schedule unset → wrong due dates; 401k reduced FICA (10-12). | lib/payrollTax yes (pinned to Gusto) |
| 11 | Totals & cards | `employeePayData` 1955, `totalPayroll` 1978, `totalCommissions` 1994, `totalBonuses` 1999, `summarizePayrollRun` (lib) | all of the above | — | Total card excluded employer tax; "$34k vs $41k" when commissions dropped. | lib/payrollRunTotals yes |
| 12 | Setup gate & run guards | `setupProblems`, `runGuards`, `canProcess`, `goFix` 2108, `guardAck` 536 | company, config, employees, prior runs, punches | — | Added 10-05; guards are warnings a click dismisses. | lib yes |
| 13 | Run | `handleRunPayroll` 2410 (eleven sequential writes) | everything | `payroll_runs`, `paystubs`, `employees` (PTO), `job_bonuses`, `rep_commissions`, `lead_commissions`, `payroll_tax_liabilities`, `settings` (watermark), storage (stub PDFs), email | Duplicate run 8; stub `period_end` +1 day (179 stubs fixed); bonuses not marked; no transaction, so any failure leaves half a run. | none |
| 14 | Paystubs & delivery | `downloadEmpPaystub` 2693, `CheckStubModal` 5992, lib/paystubPdf, lib/paystubDelivery, `send-paystubs` fn | `paystubs`, `employees`, `companies` | `paystubs.pdf_path/emailed_at` | Wrong dates and no detail (Mike Thompson); rates on stubs; logo. | none (visual) |
| 15 | History | `priorRuns` 517, `priorStubs` 518, `historyRun` 385, `allPaystubs` 389 | `payroll_runs`, `paystubs` | — | Gusto import removed real stubs (restored 10-15). | none |
| 16 | Direct deposit / ACH | `bankPick` 513, `payMethod` 537, `ddOnFile` 541, lib/achFromPlaid, lib/nacha | `payroll_config.ach`, `signed_documents` | `settings.payroll_config` | Nobody knew whether ACH went out (it never does). | lib/nacha yes |
| 17 | Time entry editing | `saveTimeAdjustment` 674, `dismissOpenEntry` 738, `handleAddTimeEntry` 2184, `findOverlap` 2226, `AddTimeModal` 5773 | `time_entries` | `time_entries` | Location trail white-screened the page (10-15). | none |
| 18 | Settings modal | `loadPayrollConfig` 618, `savePayrollConfig` 641, `skillLevelSettings` 461 | `settings` | `settings`, `companies` | — | none |
| 19 | Data loading | `fetchData` 783 (one `Promise.all` of 14 queries), `fetchAllPages` 771, plus 6 separate effects loading more | 23 tables | — | Partial loads produced wrong syncs (refused since 10-05); three loaders race for the schedule. | none |

Row 7 and row 13 are where the money has gone wrong. Rows 2, 5, 7 and 13 are what the engine (step 2) and the transaction (step 4) replace.
