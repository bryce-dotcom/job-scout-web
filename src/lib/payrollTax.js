// Moved to supabase/functions/_shared/payrollTax.ts so the edge functions can read
// the SAME tax and wage maths the app does — the forms it files and the hours it prices must use one set of tables.
//
// Re-exported from here because ~30 files import it by this path (Payroll,
// payrollEngine, paystubPdf, payrollRunGuards, benefitDeductions, lib/reports,
// lib/overhead, the Chris pages, and the tests). Nothing about the arithmetic
// changed in the move; it does no I/O, so it cannot behave differently.
export * from '../../supabase/functions/_shared/payrollTax.ts'
