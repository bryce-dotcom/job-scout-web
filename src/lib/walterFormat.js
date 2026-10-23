// How Walter's numbers are written down.
//
// Separate from WalterUI because that file exports components and nothing
// else: mixing plain functions in breaks fast refresh for the whole module,
// so the lint rule that says so is right.

export const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))

export const money2 = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n))

/** Shares arrive from the engine as fractions; this only formats them. */
export const pct = (f) => (f == null || Number.isNaN(Number(f)) ? '—' : `${Math.round(Number(f) * 100)}%`)
