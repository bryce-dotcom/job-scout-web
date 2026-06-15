import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Read-only AI compute usage meter (Phase 0 / shadow data).
//
// Reads compute_ledger for the current company + current month and shows what
// AI usage WOULD cost under the credit model. Nothing is billed — this is a
// preview while shadow metering collects data.
//
// Fully defensive by design: if there's no company, the table isn't there yet,
// or the query errors, it renders NOTHING. It can never break the Settings page.

const CREDIT_COST_USD = 0.02 // 1 credit ≈ $0.02 compute (keep in sync with computeConfig.ts)
const MARKUP = 3.5           // retail = cost × markup

function monthStartISO() {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

function prettyFeature(slug) {
  if (!slug) return 'Other'
  return String(slug).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ComputeUsagePanel({ theme, companyId }) {
  const [rows, setRows] = useState(null) // null = loading, [] = none, [...] = data
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('compute_ledger')
          .select('feature_slug, agent_slug, credits, cost_usd, ts')
          .eq('company_id', companyId)
          .gte('ts', monthStartISO())
          .order('ts', { ascending: false })
          .limit(10000)
        if (cancelled) return
        if (error) { setFailed(true); return }
        setRows(data || [])
      } catch (_) {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [companyId])

  // Never break Settings: bail to nothing on any failure / missing context.
  if (failed || !companyId) return null
  if (rows === null) {
    return <div style={{ marginTop: 28, fontSize: 13, color: theme.textMuted }}>Loading AI usage…</div>
  }

  const totalCredits = rows.reduce((s, r) => s + (Number(r.credits) || 0), 0)
  const totalCost = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)

  const byFeatureMap = {}
  for (const r of rows) {
    const k = r.feature_slug || 'other'
    if (!byFeatureMap[k]) byFeatureMap[k] = { feature: k, agent: r.agent_slug, credits: 0, cost: 0, count: 0 }
    byFeatureMap[k].credits += Number(r.credits) || 0
    byFeatureMap[k].cost += Number(r.cost_usd) || 0
    byFeatureMap[k].count += 1
  }
  const byFeature = Object.values(byFeatureMap).sort((a, b) => b.credits - a.credits)
  const maxCredits = byFeature.reduce((m, f) => Math.max(m, f.credits), 0) || 1

  const fmtUsd = (n) => `$${(Number(n) || 0).toFixed(2)}`

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: '0 0 4px' }}>AI Compute Usage</h3>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 16px' }}>
        This month's AI activity across every agent and built-in feature. Preview only — nothing is billed yet.
      </p>

      {rows.length === 0 ? (
        <div style={{
          fontSize: 13, color: theme.textMuted, padding: 14,
          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10,
        }}>
          No AI usage recorded yet this month.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <SummaryStat theme={theme} label="Credits used" value={totalCredits.toLocaleString()} />
            <SummaryStat theme={theme} label="AI actions" value={rows.length.toLocaleString()} />
            <SummaryStat theme={theme} label="Compute cost" value={fmtUsd(totalCost)} sub={`≈ ${fmtUsd(totalCost * MARKUP)} retail value`} />
          </div>

          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14 }}>
            {byFeature.map((f) => (
              <div key={f.feature} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
                  <span>
                    {prettyFeature(f.feature)}
                    {f.agent ? <span style={{ color: theme.textMuted }}> · {f.agent}</span> : null}
                  </span>
                  <strong>
                    {f.credits.toLocaleString()} cr{' '}
                    <span style={{ color: theme.textMuted, fontWeight: 400 }}>· {f.count}×</span>
                  </strong>
                </div>
                <div style={{ width: '100%', height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((f.credits / maxCredits) * 100)}%`, height: '100%', backgroundColor: theme.accent, transition: 'width .3s' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>
            1 credit ≈ ${CREDIT_COST_USD.toFixed(2)} of compute · resets monthly · shadow metering, no charges.
          </div>
        </>
      )}
    </div>
  )
}

function SummaryStat({ label, value, sub, theme }) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 140, padding: 12,
      backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}
