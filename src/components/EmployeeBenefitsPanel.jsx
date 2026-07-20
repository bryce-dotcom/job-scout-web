import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Shield } from 'lucide-react'

// Admin panel to enroll an employee in benefits / recurring deductions. Fully
// self-contained (own fetch + writes) so it can drop into the Employees edit
// view without touching that form's save logic. The rows it writes are what
// My Pay reads back for the employee. REAL data only — starts empty.

const BENEFIT_TYPES = [
  { value: 'health', label: 'Health' },
  { value: 'dental', label: 'Dental' },
  { value: 'vision', label: 'Vision' },
  { value: 'retirement_401k', label: '401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'fsa', label: 'FSA' },
  { value: 'life', label: 'Life insurance' },
  { value: 'disability', label: 'Disability' },
  { value: 'other', label: 'Other' },
]
const FREQS = [
  { value: 'per_paycheck', label: 'Per paycheck' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
]
const LABELS = Object.fromEntries(BENEFIT_TYPES.map(b => [b.value, b.label]))
const FREQ_LABELS = Object.fromEntries(FREQS.map(f => [f.value, f.label]))
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BLANK = { benefit_type: 'health', plan_name: '', employee_contribution: '', employer_contribution: '', is_pre_tax: true, frequency: 'per_paycheck' }

export default function EmployeeBenefitsPanel({ employee, theme, sectionHeaderStyle }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    if (!employee?.id) return
    setLoading(true)
    const { data } = await supabase.from('employee_benefits')
      .select('*').eq('employee_id', employee.id).eq('status', 'active').order('benefit_type')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [employee?.id])

  const add = async () => {
    setErr('')
    setSaving(true)
    const { error } = await supabase.from('employee_benefits').insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      benefit_type: form.benefit_type,
      plan_name: form.plan_name?.trim() || null,
      employee_contribution: parseFloat(form.employee_contribution) || 0,
      employer_contribution: parseFloat(form.employer_contribution) || 0,
      is_pre_tax: !!form.is_pre_tax,
      frequency: form.frequency,
      effective_date: new Date().toISOString().split('T')[0],
      status: 'active',
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setForm(BLANK); setAdding(false); load()
  }

  // Soft end — keep the row (status='ended') so past paychecks stay explainable.
  const end = async (id) => {
    await supabase.from('employee_benefits')
      .update({ status: 'ended', end_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
      .eq('id', id)
    load()
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`,
    backgroundColor: theme.bgCard, color: theme.text, fontSize: 13, boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: theme.textMuted, marginBottom: 4, display: 'block' }

  return (
    <>
      <div style={sectionHeaderStyle}>Benefits &amp; Deductions</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        Health, dental, 401(k) and other recurring lines for this employee. These show on the employee's My Pay. Amounts here are informational until benefit deductions are wired into a payroll run.
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: theme.textMuted }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.textMuted, padding: '10px 12px', backgroundColor: theme.bg, borderRadius: 8 }}>
          No benefits on file. Add one below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', backgroundColor: theme.bg, borderRadius: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                  {LABELS[r.benefit_type] || r.benefit_type}{r.plan_name ? ` · ${r.plan_name}` : ''}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  {money(r.employee_contribution)} {FREQ_LABELS[r.frequency] || r.frequency} · {r.is_pre_tax ? 'Pre-tax' : 'Post-tax'}
                  {Number(r.employer_contribution) > 0 && ` · +${money(r.employer_contribution)} employer`}
                </div>
              </div>
              <button onClick={() => end(r.id)} title="Remove benefit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 6, display: 'flex' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 12, padding: 14, border: `1px solid ${theme.border}`, borderRadius: 10, backgroundColor: theme.bgCard }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.benefit_type} onChange={e => setForm(f => ({ ...f, benefit_type: e.target.value }))}>
                {BENEFIT_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Plan name (optional)</label>
              <input style={inputStyle} value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} placeholder="e.g. Blue Cross PPO" />
            </div>
            <div>
              <label style={labelStyle}>Employee pays</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.employee_contribution} onChange={e => setForm(f => ({ ...f, employee_contribution: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Employer pays (optional)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.employer_contribution} onChange={e => setForm(f => ({ ...f, employer_contribution: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select style={inputStyle} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                {FREQS.map(fq => <option key={fq.value} value={fq.value}>{fq.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tax treatment</label>
              <select style={inputStyle} value={form.is_pre_tax ? 'pre' : 'post'} onChange={e => setForm(f => ({ ...f, is_pre_tax: e.target.value === 'pre' }))}>
                <option value="pre">Pre-tax</option>
                <option value="post">Post-tax</option>
              </select>
            </div>
          </div>
          {err && <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={add} disabled={saving}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: theme.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save benefit'}
            </button>
            <button onClick={() => { setAdding(false); setErr(''); setForm(BLANK) }}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: `1px dashed ${theme.border}`, backgroundColor: 'transparent', color: theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add benefit
        </button>
      )}
    </>
  )
}
