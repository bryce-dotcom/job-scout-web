import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Check, CreditCard, Users, Repeat, X, AlertCircle } from 'lucide-react'

// MembershipsPanel — plan builder + members + enrollment. Rendered inside the
// Recurring Jobs page's "Membership plans" tab (a membership is a billed
// recurring service). Enrollment calls the create-customer-subscription edge
// function, which charges the customer's saved card on the tenant's own Stripe.

const REC = '#8b5cf6'
const REC_BG = 'rgba(139,92,246,0.12)'
const REC_DK = '#6b21a8'
const PERK_PRESETS = ['Priority scheduling', '15% off repairs', 'Waived trip fee', 'Annual tune-up', 'No overtime fees']
const INTERVALS = [['month', 'per month'], ['quarter', 'per quarter'], ['year', 'per year']]
const VISIT_FREQS = ['', 'Monthly', 'Quarterly', 'Bi-Annually', 'Annually']
const STATUS_STYLE = {
  active: { bg: 'rgba(34,197,94,0.14)', color: '#15803d', label: 'ACTIVE' },
  trialing: { bg: 'rgba(59,130,246,0.14)', color: '#2563eb', label: 'TRIAL' },
  past_due: { bg: 'rgba(239,68,68,0.13)', color: '#b91c1c', label: 'PAST DUE' },
  incomplete: { bg: 'rgba(234,179,8,0.16)', color: '#a16207', label: 'PENDING' },
  canceled: { bg: 'rgba(125,138,127,0.14)', color: '#6b7280', label: 'CANCELED' },
}
const money = (cents) => '$' + ((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: (cents % 100 ? 2 : 0), maximumFractionDigits: 2 })

export default function MembershipsPanel({ theme, companyId }) {
  const [plans, setPlans] = useState([])
  const [members, setMembers] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enrollError, setEnrollError] = useState(null)
  const [enrollOk, setEnrollOk] = useState(null)
  const [enrolling, setEnrolling] = useState(false)
  const [enroll, setEnroll] = useState({ customer_id: '', membership_plan_id: '' })
  const [plan, setPlan] = useState({ name: '', price: '29', billing_interval: 'month', included_visits: '2', visit_frequency: '', service_kind: '', perks: ['Priority scheduling'] })

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: p }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('membership_plans').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('customer_memberships').select('*, customer:customers!customer_id(id, name, business_name)').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, business_name').eq('company_id', companyId).order('name').limit(2000),
    ])
    setPlans(p || []); setMembers(m || []); setCustomers(c || []); setLoading(false)
  }, [companyId])
  useEffect(() => { (async () => { await load() })() }, [load])

  const activeMembers = useMemo(() => members.filter(m => ['active', 'trialing', 'past_due'].includes(m.status)), [members])
  const mrrCents = useMemo(() => activeMembers.reduce((sum, m) => {
    const per = m.price_cents || 0
    const monthly = m.billing_interval === 'year' ? per / 12 : m.billing_interval === 'quarter' ? per / 3 : per
    return sum + monthly
  }, 0), [activeMembers])

  async function savePlan(e) {
    e.preventDefault()
    if (!plan.name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('membership_plans').insert({
      company_id: companyId, name: plan.name.trim(),
      price_cents: Math.round(parseFloat(plan.price || '0') * 100),
      billing_interval: plan.billing_interval,
      included_visits: parseInt(plan.included_visits) || 0,
      visit_frequency: plan.visit_frequency || null,
      service_kind: plan.service_kind || null,
      perks: plan.perks,
    })
    setSaving(false)
    if (!error) { setShowPlanForm(false); setPlan({ name: '', price: '29', billing_interval: 'month', included_visits: '2', visit_frequency: '', service_kind: '', perks: ['Priority scheduling'] }); load() }
  }

  async function togglePlanActive(pl) {
    await supabase.from('membership_plans').update({ active: !pl.active }).eq('id', pl.id).eq('company_id', companyId)
    load()
  }

  async function doEnroll(e) {
    e.preventDefault()
    setEnrollError(null); setEnrollOk(null)
    if (!enroll.customer_id || !enroll.membership_plan_id) { setEnrollError('Pick a customer and a plan.'); return }
    setEnrolling(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-customer-subscription`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: Number(enroll.customer_id), membership_plan_id: Number(enroll.membership_plan_id) }),
      })
      const out = await res.json()
      if (!res.ok) {
        setEnrollError(out.code === 'no_card'
          ? 'This customer has no card on file. Save a card on their customer page first, then enroll.'
          : (out.error || 'Enrollment failed.'))
      } else {
        setEnrollOk('Enrolled — subscription is ' + (out.status || 'active') + '.')
        setEnroll({ customer_id: '', membership_plan_id: '' })
        load()
      }
    } catch (err) { setEnrollError(err.message) }
    setEnrolling(false)
  }

  const label = { fontSize: 11, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: 'ui-monospace, monospace', display: 'block', marginBottom: 6 }
  const input = { width: '100%', fontSize: 14, padding: '9px 11px', border: `1.5px solid ${theme.border}`, borderRadius: 10, background: theme.bgCard, color: theme.text, minHeight: 40 }
  const btn = (primary) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: primary ? 'none' : `1.5px solid ${theme.border}`, background: primary ? REC : 'transparent', color: primary ? '#fff' : theme.text, borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44 })

  if (loading) return <div style={{ color: theme.textMuted, padding: '30px 0', textAlign: 'center' }}>Loading…</div>

  return (
    <div>
      {/* MRR summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: '1 1 160px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${REC}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 850, color: REC_DK }}>{money(mrrCents)}<span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>/mo</span></div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>recurring revenue</div>
        </div>
        <div style={{ flex: '1 1 160px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 850, color: theme.text }}>{activeMembers.length}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>active members</div>
        </div>
        <div style={{ flex: '1 1 160px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 850, color: theme.text }}>{plans.filter(p => p.active).length}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>plans offered</div>
        </div>
      </div>

      {/* Plans */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>Plans</h3>
        <button style={btn(true)} onClick={() => setShowPlanForm(v => !v)}>{showPlanForm ? <X size={16} /> : <Plus size={16} />}{showPlanForm ? 'Cancel' : 'New plan'}</button>
      </div>

      {showPlanForm && (
        <form onSubmit={savePlan} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,200px), 1fr))', gap: 12 }}>
            <div><span style={label}>Plan name</span><input style={input} value={plan.name} onChange={e => setPlan({ ...plan, name: e.target.value })} placeholder="Comfort Club" /></div>
            <div><span style={label}>Price</span><div style={{ display: 'flex', gap: 8 }}><input style={{ ...input, width: 90 }} type="number" value={plan.price} onChange={e => setPlan({ ...plan, price: e.target.value })} /><select style={input} value={plan.billing_interval} onChange={e => setPlan({ ...plan, billing_interval: e.target.value })}>{INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
            <div><span style={label}>Included visits / yr</span><input style={input} type="number" value={plan.included_visits} onChange={e => setPlan({ ...plan, included_visits: e.target.value })} /></div>
            <div><span style={label}>Auto-visit cadence</span><select style={input} value={plan.visit_frequency} onChange={e => setPlan({ ...plan, visit_frequency: e.target.value })}>{VISIT_FREQS.map(f => <option key={f} value={f}>{f || 'None'}</option>)}</select></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={label}>Perks</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {PERK_PRESETS.map(pk => {
                const on = plan.perks.includes(pk)
                return <button type="button" key={pk} onClick={() => setPlan({ ...plan, perks: on ? plan.perks.filter(x => x !== pk) : [...plan.perks, pk] })}
                  style={{ border: `1.5px solid ${on ? REC : theme.border}`, background: on ? REC_BG : theme.bgCard, color: on ? REC_DK : theme.textSecondary, borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 36 }}>{on && <Check size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />}{pk}</button>
              })}
            </div>
          </div>
          <button type="submit" disabled={saving} style={{ ...btn(true), marginTop: 14 }}>{saving ? 'Saving…' : 'Create plan'}</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%,240px), 1fr))', gap: 12, marginBottom: 22 }}>
        {plans.length === 0 && !showPlanForm && (
          <div style={{ color: theme.textMuted, fontSize: 13.5, gridColumn: '1 / -1', padding: '10px 0' }}>No plans yet — create one to start enrolling members.</div>
        )}
        {plans.map(pl => (
          <div key={pl.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden', background: theme.bgCard, opacity: pl.active ? 1 : 0.55 }}>
            <div style={{ background: `linear-gradient(120deg, ${REC}, #6d28d9)`, color: '#fff', padding: '13px 15px' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{pl.name}</div>
              <div style={{ fontSize: 22, fontWeight: 850, marginTop: 2 }}>{money(pl.price_cents)}<span style={{ fontSize: 13, opacity: 0.85, fontWeight: 600 }}> / {pl.billing_interval}</span></div>
            </div>
            <div style={{ padding: '12px 15px' }}>
              {pl.included_visits > 0 && <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>{pl.included_visits} visit{pl.included_visits === 1 ? '' : 's'}/yr{pl.visit_frequency ? ` · ${pl.visit_frequency}` : ''}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(pl.perks || []).map((pk, i) => <span key={i} style={{ fontSize: 11.5, background: REC_BG, color: REC_DK, borderRadius: 20, padding: '3px 9px', fontWeight: 600 }}>{pk}</span>)}
              </div>
              <button onClick={() => togglePlanActive(pl)} style={{ marginTop: 12, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textMuted, borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>{pl.active ? 'Deactivate' : 'Reactivate'}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Enroll */}
      {plans.filter(p => p.active).length > 0 && (
        <form onSubmit={doEnroll} style={{ background: theme.accentBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: theme.text }}>Enroll a customer</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,200px), 1fr))', gap: 12, alignItems: 'end' }}>
            <div><span style={label}>Customer</span>
              <select style={input} value={enroll.customer_id} onChange={e => setEnroll({ ...enroll, customer_id: e.target.value })}>
                <option value="">Select…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.business_name || c.name}</option>)}
              </select>
            </div>
            <div><span style={label}>Plan</span>
              <select style={input} value={enroll.membership_plan_id} onChange={e => setEnroll({ ...enroll, membership_plan_id: e.target.value })}>
                <option value="">Select…</option>
                {plans.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price_cents)}/{p.billing_interval}</option>)}
              </select>
            </div>
            <button type="submit" disabled={enrolling} style={btn(true)}><CreditCard size={16} />{enrolling ? 'Enrolling…' : 'Enroll & charge card'}</button>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <CreditCard size={13} style={{ marginTop: 1, flex: 'none' }} /> Charges the customer's saved card on your Stripe. Save a card on the customer's page first.
          </div>
          {enrollError && <div style={{ marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start', color: '#b91c1c', fontSize: 13, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '9px 12px' }}><AlertCircle size={15} style={{ marginTop: 1, flex: 'none' }} />{enrollError}</div>}
          {enrollOk && <div style={{ marginTop: 10, display: 'flex', gap: 7, alignItems: 'center', color: '#15803d', fontSize: 13, background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '9px 12px' }}><Check size={15} />{enrollOk}</div>}
        </form>
      )}

      {/* Members */}
      <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: theme.text }}>Members</h3>
      {members.length === 0 ? (
        <div style={{ color: theme.textMuted, fontSize: 13.5 }}>No members yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(m => {
            const st = STATUS_STYLE[m.status] || STATUS_STYLE.incomplete
            const cn = m.customer?.business_name || m.customer?.name || `Customer #${m.customer_id}`
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '11px 14px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: REC_BG, color: REC_DK, display: 'grid', placeItems: 'center', fontWeight: 750, fontSize: 13, flex: 'none' }}>{cn.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cn}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>{m.plan_name || 'Membership'} · {money(m.price_cents)}/{m.billing_interval}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace', padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color, flex: 'none' }}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
