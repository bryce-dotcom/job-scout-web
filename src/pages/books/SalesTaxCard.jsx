// Sales tax: collected vs remitted for the selected period, with the
// company's rate configured right here (settings 'sales_tax') — the gear
// lives on the page, per the project's settings convention.
import { useState, useEffect } from 'react'
import { Percent, Settings as SettingsIcon, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { SALES_TAX_KEY, parseSalesTaxConfig, serializeSalesTaxConfig, salesTaxSummary } from '../../lib/salesTax'

export default function SalesTaxCard({ companyId, theme, statCardStyle, formatCurrency, invoices = [], payments = [], manualExpenses = [], from, to, accountingBasis = 'cash' }) {
  const [cfg, setCfg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('settings').select('value').eq('company_id', companyId).eq('key', SALES_TAX_KEY).maybeSingle()
      if (alive) setCfg(parseSalesTaxConfig(data?.value))
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  if (!cfg) return null
  const inRange = (d) => { if (!d) return false; const k = String(d).slice(0, 10); return k >= from && k <= to }
  const s = salesTaxSummary({ invoices, payments, manualExpenses }, inRange, accountingBasis)

  const save = async () => {
    const next = { enabled: !!draft.enabled, rate: parseFloat(draft.rate) || 0, jurisdiction: draft.jurisdiction || '', apply_to: draft.apply_to }
    if (next.enabled && !(next.rate > 0)) { toast.error('Enter the rate as a percent, e.g. 7.25'); return }
    const { error } = await supabase.from('settings').upsert({ company_id: companyId, key: SALES_TAX_KEY, value: serializeSalesTaxConfig(next) }, { onConflict: 'company_id,key' })
    if (error) { toast.error('Could not save: ' + error.message); return }
    setCfg(parseSalesTaxConfig(serializeSalesTaxConfig(next))); setEditing(false)
    toast.success(next.enabled ? `Sales tax on at ${next.rate}% — applied to invoices created from now on` : 'Sales tax off')
  }
  const inputStyle = { padding: '6px 8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }

  if (!cfg.enabled && !editing && s.invoicesWithTax === 0) {
    return (
      <div style={{ ...statCardStyle, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Percent size={14} style={{ color: theme.accent }} /> Sales tax is off. If you charge it, set the rate and new invoices carry it.
        </span>
        <button onClick={() => { setDraft({ ...cfg, enabled: true }); setEditing(true) }} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>
          <SettingsIcon size={12} /> Set up
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...statCardStyle, marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Percent size={16} style={{ color: theme.accent }} /> Sales tax
          <HelpBadge text="Collected = tax on invoices paid in the period (cash) or issued (accrual). Remitted = manual expenses that mention 'sales tax'. Owed = the difference, a liability until you remit. Tax is computed when an invoice's lines are written, from the rate here; the invoice amount stays pre-tax and the customer total adds the tax." />
          {cfg.enabled && <span style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted }}>{cfg.rate}%{cfg.jurisdiction ? ` · ${cfg.jurisdiction}` : ''}{cfg.apply_to === 'materials' ? ' · materials only' : ''}</span>}
        </h3>
        {!editing && (
          <button onClick={() => { setDraft({ ...cfg }); setEditing(true) }} title="Sales tax settings" style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, cursor: 'pointer', minHeight: '36px' }}><SettingsIcon size={14} /></button>
        )}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: theme.text }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" checked={!!draft.enabled} onChange={(e) => setDraft(d => ({ ...d, enabled: e.target.checked }))} /> Charge sales tax</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Rate % <input type="number" step="0.001" value={draft.rate} onChange={(e) => setDraft(d => ({ ...d, rate: e.target.value }))} style={{ ...inputStyle, width: '90px' }} /></label>
          <input placeholder="Jurisdiction (e.g. Salt Lake County, UT)" value={draft.jurisdiction} onChange={(e) => setDraft(d => ({ ...d, jurisdiction: e.target.value }))} style={{ ...inputStyle, minWidth: '220px' }} />
          <select value={draft.apply_to} onChange={(e) => setDraft(d => ({ ...d, apply_to: e.target.value }))} style={inputStyle}>
            <option value="all">Tax every line</option>
            <option value="materials">Materials only (labor exempt)</option>
          </select>
          <button onClick={save} style={{ padding: '6px 10px', backgroundColor: theme.accent, border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', minHeight: '36px' }}><Check size={14} /></button>
          <button onClick={() => setEditing(false)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', minHeight: '36px' }}><X size={14} /></button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {[
            [`Collected (${s.invoicesWithTax} invoice${s.invoicesWithTax === 1 ? '' : 's'})`, formatCurrency(s.collected), theme.text],
            ['Remitted', formatCurrency(s.remitted), theme.text],
            ['Owed', formatCurrency(s.owed), s.owed > 0 ? '#ef4444' : theme.text],
          ].map(([l, v, c]) => (
            <div key={l} style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{l}</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
