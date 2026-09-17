// Budget vs actual for the current month, by expense category.
// Budgets live in settings key 'expense_budgets' (see lib/budgets.js).
// Actuals are manual + bank spend under the same category name.
import { useState, useEffect } from 'react'
import { Target, Pencil, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { BUDGETS_KEY, parseBudgets, serializeBudgets, budgetVsActual, monthKeyOf } from '../../lib/budgets'

export default function BudgetCard({ companyId, theme, statCardStyle, manualExpenses = [], plaidTransactions = [], expenseCategories = [], formatCurrency }) {
  const [budgets, setBudgets] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const monthKey = monthKeyOf(new Date())

  useEffect(() => {
    if (!companyId) return
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('settings').select('value').eq('company_id', companyId).eq('key', BUDGETS_KEY).maybeSingle()
      if (alive) setBudgets(parseBudgets(data?.value))
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [companyId])

  if (!budgets) return null
  const result = budgetVsActual(budgets, { manualExpenses, plaidTransactions }, monthKey)
  const hasBudgets = Object.keys(budgets.monthly).length > 0

  const startEdit = () => {
    const d = { ...budgets.monthly }
    for (const c of expenseCategories) if (c.type !== 'income' && !(c.name in d)) d[c.name] = ''
    for (const r of result.rows) if (!(r.category in d)) d[r.category] = ''
    setDraft(d); setEditing(true)
  }
  const save = async () => {
    const monthly = {}
    for (const [k, v] of Object.entries(draft)) { const n = parseFloat(v); if (Number.isFinite(n) && n > 0) monthly[k] = n }
    setSaving(true)
    const { error } = await supabase.from('settings').upsert({ company_id: companyId, key: BUDGETS_KEY, value: serializeBudgets({ monthly }) }, { onConflict: 'company_id,key' })
    setSaving(false)
    if (error) { toast.error('Could not save budgets: ' + error.message); return }
    setBudgets({ version: 1, monthly }); setEditing(false)
    toast.success('Budgets saved')
  }

  const monthLabel = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const pctColor = (r) => r.over ? '#ef4444' : (r.pct != null && r.pct >= 85 ? '#eab308' : '#22c55e')

  return (
    <div style={{ ...statCardStyle, marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={16} style={{ color: theme.accent }} /> Budget vs actual — {monthLabel}
          <HelpBadge text="Set a monthly amount per expense category. Actual = everything spent under that category this month, from the bank feed and manual expenses. Categories you spend against without a budget show up too, so nothing hides." />
        </h3>
        {!editing ? (
          <button onClick={startEdit} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>
            <Pencil size={12} /> {hasBudgets ? 'Edit budgets' : 'Set budgets'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setEditing(false)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}><X size={12} /></button>
            <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: theme.accent, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}><Check size={12} /> Save</button>
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {Object.keys(draft).sort().map(name => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.text }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <input type="number" min="0" step="1" value={draft[name]} placeholder="0" onChange={(e) => setDraft(d => ({ ...d, [name]: e.target.value }))}
                style={{ width: '96px', padding: '6px 8px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
            </label>
          ))}
        </div>
      ) : !hasBudgets ? (
        <p style={{ margin: 0, fontSize: '13px', color: theme.textMuted }}>No budgets yet. Set a monthly amount per category and this card shows where you stand each month.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {result.rows.map(r => (
              <div key={r.category} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 2fr) auto', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category}</span>
                <div style={{ height: '8px', backgroundColor: theme.bg, borderRadius: '4px', overflow: 'hidden' }}>
                  {r.budget != null && <div style={{ width: `${Math.min(100, r.pct || 0)}%`, height: '100%', backgroundColor: pctColor(r) }} />}
                </div>
                <span style={{ fontSize: '12px', color: r.over ? '#ef4444' : theme.textSecondary, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {formatCurrency(r.actual)}{r.budget != null ? ` / ${formatCurrency(r.budget)}` : ' · no budget'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: theme.textMuted }}>
            {formatCurrency(result.totalActual)} spent of {formatCurrency(result.totalBudget)} budgeted
            {result.totalActual > result.totalBudget ? <span style={{ color: '#ef4444' }}> · {formatCurrency(result.totalActual - result.totalBudget)} over</span> : ''}
          </div>
        </>
      )}
    </div>
  )
}
