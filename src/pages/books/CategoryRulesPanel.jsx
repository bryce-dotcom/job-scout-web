// Bank categorization rules — the "this merchant always goes here" list.
//
// Rules are learned silently every time someone confirms a transaction
// (categorize-transactions 'learn_rule'), and applied on every sync before
// the AI sees a row. Until now they were write-only: nobody could see what
// had been learned, fix a wrong one, or delete the rule that keeps filing
// the supply house under Meals. This is that page.
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Check, ListChecks } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import HelpBadge from '../../components/HelpBadge'
import { toast } from '../../lib/toast'
import { TAX_CATEGORY_OPTIONS } from '../../lib/taxCategories'

const EMPTY = { merchant_pattern: '', assigned_category: '', assigned_tax_category: '', match_type: 'contains', priority: 0 }

export default function CategoryRulesPanel({ companyId, theme, isMobile, expenseCategories = [], onClose, onChanged }) {
  const [rules, setRules] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('category_rules').select('*').eq('company_id', companyId).order('priority', { ascending: false }).order('merchant_pattern')
    setRules(data || [])
  }
  useEffect(() => {
    if (!companyId) return
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const inputStyle = { width: '100%', padding: '8px 10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' }

  const saveRule = async (rule) => {
    const pattern = String(rule.merchant_pattern || '').trim().toLowerCase()
    if (pattern.length < 3) { toast.error('Pattern needs at least 3 characters — short patterns match too much'); return }
    if (!rule.assigned_category) { toast.error('Pick a category'); return }
    setSaving(true)
    const payload = {
      company_id: companyId,
      merchant_pattern: pattern,
      assigned_category: rule.assigned_category,
      assigned_tax_category: rule.assigned_tax_category || null,
      match_type: rule.match_type === 'exact' ? 'exact' : 'contains',
      priority: parseInt(rule.priority, 10) || 0,
    }
    const res = rule.id
      ? await supabase.from('category_rules').update(payload).eq('id', rule.id).eq('company_id', companyId)
      : await supabase.from('category_rules').insert([payload])
    setSaving(false)
    if (res.error) { toast.error('Could not save the rule: ' + res.error.message); return }
    toast.success(rule.id ? 'Rule updated' : 'Rule added')
    if (!rule.id) setDraft(EMPTY)
    await load()
    onChanged?.()
  }

  const deleteRule = async (rule) => {
    if (!confirm(`Delete the rule for "${rule.merchant_pattern}"? Transactions already categorized keep their category.`)) return
    const { error } = await supabase.from('category_rules').delete().eq('id', rule.id).eq('company_id', companyId)
    if (error) { toast.error('Could not delete: ' + error.message); return }
    await load()
    onChanged?.()
  }

  const patch = (id, changes) => setRules(rs => rs.map(r => r.id === id ? { ...r, ...changes, _dirty: true } : r))

  // A plain render function, not a nested component: a component defined
  // inside render is a new type every render, which remounts the inputs and
  // drops focus on every keystroke.
  const renderRow = (rule, isDraft = false) => (
    <div key={isDraft ? 'draft' : rule.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1.1fr 1.3fr 0.7fr 0.5fr auto', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
      <input value={rule.merchant_pattern} placeholder="merchant contains…" style={inputStyle}
        onChange={(e) => isDraft ? setDraft(d => ({ ...d, merchant_pattern: e.target.value })) : patch(rule.id, { merchant_pattern: e.target.value })} />
      <select value={rule.assigned_category || ''} style={inputStyle}
        onChange={(e) => isDraft ? setDraft(d => ({ ...d, assigned_category: e.target.value })) : patch(rule.id, { assigned_category: e.target.value })}>
        <option value="">Category…</option>
        {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        {rule.assigned_category && !expenseCategories.some(c => c.name === rule.assigned_category) && <option value={rule.assigned_category}>{rule.assigned_category}</option>}
      </select>
      <select value={rule.assigned_tax_category || ''} style={inputStyle}
        onChange={(e) => isDraft ? setDraft(d => ({ ...d, assigned_tax_category: e.target.value })) : patch(rule.id, { assigned_tax_category: e.target.value })}>
        <option value="">Tax line (optional)</option>
        {TAX_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={rule.match_type || 'contains'} style={inputStyle}
        onChange={(e) => isDraft ? setDraft(d => ({ ...d, match_type: e.target.value })) : patch(rule.id, { match_type: e.target.value })}>
        <option value="contains">contains</option>
        <option value="exact">exact</option>
      </select>
      <input type="number" value={rule.priority ?? 0} title="Higher wins when two rules match" style={inputStyle}
        onChange={(e) => isDraft ? setDraft(d => ({ ...d, priority: e.target.value })) : patch(rule.id, { priority: e.target.value })} />
      <div style={{ display: 'flex', gap: '4px' }}>
        {(isDraft || rule._dirty) && (
          <button onClick={() => saveRule(rule)} disabled={saving} title={isDraft ? 'Add rule' : 'Save changes'}
            style={{ padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: theme.accent, color: '#fff', cursor: 'pointer', minHeight: '36px' }}>
            {isDraft ? <Plus size={14} /> : <Check size={14} />}
          </button>
        )}
        {!isDraft && (
          <button onClick={() => deleteRule(rule)} title="Delete rule"
            style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', minHeight: '36px' }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: 'calc(100vw - 32px)', maxWidth: '900px', zIndex: 51, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListChecks size={18} style={{ color: theme.accent }} /> Bank categorization rules
            <HelpBadge text="Every time you confirm a transaction, a rule is learned for that merchant. On each sync, rules run before the AI: a matching merchant gets the rule's category straight away. Edit a wrong one here, or delete it — the next sync uses the new answer. Patterns under 3 characters and generic bank words are refused because they match everything." />
          </h2>
          <button onClick={onClose} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '12px 20px', overflowY: 'auto' }}>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1.3fr 0.7fr 0.5fr auto', gap: '8px', fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 0' }}>
              <span>Merchant</span><span>Category</span><span>Tax line</span><span>Match</span><span>Priority</span><span style={{ width: '80px' }} />
            </div>
          )}
          {renderRow(draft, true)}
          {rules === null ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>Loading…</p>
          ) : rules.length === 0 ? (
            <p style={{ color: theme.textMuted, fontSize: '13px', padding: '20px', textAlign: 'center' }}>No rules yet. Confirm a few transactions and they appear here, or add one above.</p>
          ) : (
            rules.map(r => renderRow(r))
          )}
        </div>
      </div>
    </>
  )
}
