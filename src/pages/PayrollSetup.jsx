// Payroll setup — the walk from "we use Gusto" to "we run payroll here",
// on one page, in order, with nothing left to find.
//
// Bryce, 2026-10-12: "I want my users to be done with Gusto as well."
// Antonino Lawn Care is the first tenant who has to get through setup
// without Bryce in the room. The gate (lib/payrollSetupGate) already knows
// what is missing; this page puts every answer on one screen instead of
// four, lets the office send each person their own onboarding link, puts
// the bank on file, and brings in the checks the old provider already
// paid this year so year-to-date and the W-2s are whole.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { payrollSetupProblems } from '../lib/payrollSetupGate'
import { SUI_SOURCES, SUI_STATES, validateSuiRate, suiStateFor } from '../lib/suiRate'
import { pickAchAccount, achSettingsFromPlaidAccount, describeAchAccount } from '../lib/achFromPlaid'
import PlaidLink from '../components/PlaidLink'
import { CheckCircle2, Circle, AlertTriangle, Send, Upload, Landmark, Users, Building2, Play, ChevronRight } from 'lucide-react'

const ENTITY_TYPES = ['Sole Proprietorship', 'LLC', 'S-Corp', 'C-Corp', 'Partnership', 'Non-Profit']
const FREQS = [['weekly', 'Weekly'], ['bi-weekly', 'Every two weeks'], ['semimonthly', 'Twice a month (1st–15th, 16th–end)'], ['monthly', 'Monthly']]
const NO_INCOME_TAX = new Set(['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'])
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// What a provider's export has to carry for a check to be recorded.
const IMPORT_FIELDS = [
  { field: 'employee_name', type: 'text', required: true, desc: 'Employee full name (or last, first)' },
  { field: 'pay_date', type: 'date', required: true, desc: 'Check date / pay date' },
  { field: 'period_start', type: 'date', desc: 'Pay period start' },
  { field: 'period_end', type: 'date', desc: 'Pay period end' },
  { field: 'gross', type: 'money', required: true, desc: 'Gross pay / gross earnings' },
  { field: 'fit', type: 'money', desc: 'Federal income tax withheld (employee)' },
  { field: 'sit', type: 'money', desc: 'State income tax withheld (employee)' },
  { field: 'ss_ee', type: 'money', desc: 'Social Security tax withheld (employee share only)' },
  { field: 'med_ee', type: 'money', desc: 'Medicare tax withheld (employee share only)' },
  { field: 'net', type: 'money', desc: 'Net pay / take-home' },
  { field: 'suta', type: 'money', desc: 'Employer state unemployment tax (SUTA / SUI)' },
  { field: 'futa', type: 'money', desc: 'Employer federal unemployment tax (FUTA)' },
]

// A step card. Lives outside the page component on purpose: a component
// defined inside render is a new type every render, and React would remount
// every input in it on each keystroke.
function Step({ n, icon: Icon, title, done, children, sub, theme }) {
  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: sub ? 4 : 12 }}>
        {done ? <CheckCircle2 size={22} style={{ color: '#16a34a' }} /> : <Circle size={22} style={{ color: theme.textMuted }} />}
        <Icon size={18} style={{ color: theme.accent }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{n}. {title}</div>
        {done && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Done</span>}
      </div>
      {sub && <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12, marginLeft: 32 }}>{sub}</div>}
      {children}
    </div>
  )
}

export default function PayrollSetup() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState(null)
  const [config, setConfig] = useState({})
  const [employees, setEmployees] = useState([])
  const [ddByEmp, setDdByEmp] = useState({})
  const [runs, setRuns] = useState([])
  const [stubCount, setStubCount] = useState(0)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [sending, setSending] = useState(null)
  const [bank, setBank] = useState({ loading: false, error: null })
  const [imp, setImp] = useState({ stage: 'idle', provider: 'Gusto', headers: [], rows: [], mapping: {}, preview: null, busy: false, error: null, createMissing: true, taxesRemitted: true, result: null })

  const load = async () => {
    if (!companyId) return
    const [co, cfg, emps, dd, rn, st] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).maybeSingle(),
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'payroll_config').maybeSingle(),
      supabase.from('employees').select('id, name, email, phone, role, active, tax_classification, is_hourly, is_salary, hourly_rate, annual_salary, w4_filing_status, ssn_last4, home_address, home_zip, hire_date, is_admin, user_role').eq('company_id', companyId).eq('active', true).order('name'),
      supabase.from('signed_documents').select('employee_id').eq('company_id', companyId).eq('document_kind', 'direct_deposit_auth').eq('status', 'signed'),
      supabase.from('payroll_runs').select('id, pay_date, period_start, period_end, employee_count, total_gross').eq('company_id', companyId).order('pay_date'),
      supabase.from('paystubs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('pay_date', `${new Date().getFullYear()}-01-01`),
    ])
    let parsed = {}
    try { parsed = cfg.data?.value ? JSON.parse(cfg.data.value) : {} } catch { parsed = {} }
    const c = co.data || {}
    setCompany(c); setConfig(parsed); setEmployees(emps.data || []); setRuns(rn.data || []); setStubCount(st.count || 0)
    const m = {}; for (const d of dd.data || []) m[d.employee_id] = true; setDdByEmp(m)
    setForm({
      ein: c.ein || '', legal_name: c.legal_name || c.company_name || '', entity_type: c.entity_type || '',
      state: (c.state_employer_id_state || c.state || '').toUpperCase(),
      federal_deposit_schedule: c.federal_deposit_schedule || '', state_deposit_schedule: c.state_deposit_schedule || '',
      state_employer_id: c.state_employer_id || '', sui_account_number: c.sui_account_number || '',
      sui_rate_pct: c.sui_rate_pct ?? '', sui_rate_source: c.sui_rate_source || '',
      pay_frequency: parsed.pay_frequency || c.pay_frequency || '', pay_day_1: parsed.pay_day_1 || c.pay_day_1 || '20', pay_day_2: parsed.pay_day_2 || c.pay_day_2 || '5',
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])   // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => company ? payrollSetupProblems({ company, payrollConfig: config, employees }) : [], [company, config, employees])
  const companyProblems = problems.filter(p => p.fix !== 'employee')
  const peopleProblems = problems.filter(p => p.fix === 'employee')
  const w2 = employees.filter(e => e.tax_classification !== '1099')
  const ddCount = w2.filter(e => ddByEmp[e.id]).length
  const achReady = !!(config.ach && config.ach.odfiRouting)
  const thisYear = new Date().getFullYear()
  const ranThisYear = runs.filter(r => String(r.pay_date || '').startsWith(String(thisYear)))

  // ── Step 1: company and tax accounts ───────────────────────────────
  const saveCompany = async () => {
    const f = form
    const ein = String(f.ein || '').replace(/\D/g, '')
    if (ein && ein.length !== 9) { setMsg({ ok: false, text: 'The EIN is nine digits (XX-XXXXXXX on your IRS letter).' }); return }
    if (!f.state) { setMsg({ ok: false, text: 'Pick the state your people work in.' }); return }
    if (f.sui_rate_pct !== '' && f.sui_rate_pct != null) {
      const bad = validateSuiRate(f.state, f.sui_rate_pct); if (bad) { setMsg({ ok: false, text: bad }); return }
      if (!f.sui_rate_source) { setMsg({ ok: false, text: 'Say where the unemployment rate came from.' }); return }
    }
    setSaving(true); setMsg(null)
    const rate = f.sui_rate_pct === '' || f.sui_rate_pct == null ? null : parseFloat(f.sui_rate_pct)
    const payload = {
      ein: ein ? `${ein.slice(0, 2)}-${ein.slice(2)}` : null, legal_name: f.legal_name || null, entity_type: f.entity_type || null,
      state_employer_id_state: f.state, state: company?.state || f.state,
      federal_deposit_schedule: f.federal_deposit_schedule || null, state_deposit_schedule: f.state_deposit_schedule || null,
      state_employer_id: f.state_employer_id || null, sui_account_number: f.sui_account_number || null,
      sui_rate_pct: rate, sui_rate_source: rate == null ? null : (f.sui_rate_source || null),
      sui_rate_effective_date: rate == null ? null : `${thisYear}-01-01`,
      pay_frequency: f.pay_frequency || null, pay_day_1: f.pay_day_1 || null, pay_day_2: f.pay_day_2 || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('companies').update(payload).eq('id', companyId)
    if (error) { setSaving(false); setMsg({ ok: false, text: 'Did not save: ' + error.message }); return }
    if (rate != null && (String(rate) !== String(company?.sui_rate_pct) || f.sui_rate_source !== company?.sui_rate_source)) {
      await supabase.from('company_sui_rates').insert({ company_id: companyId, rate_pct: rate, effective_date: `${thisYear}-01-01`, source: f.sui_rate_source, entered_by: user?.email || null, note: company?.sui_rate_pct != null && Number(company.sui_rate_pct) !== rate ? `Replaces ${company.sui_rate_pct}%` : null })
    }
    const newCfg = { ...config, pay_frequency: f.pay_frequency || config.pay_frequency, pay_day_1: f.pay_day_1, pay_day_2: f.pay_day_2 }
    await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(newCfg), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
    setSaving(false); setMsg({ ok: true, text: 'Saved.' })
    await load()
  }

  // ── Step 2: people ─────────────────────────────────────────────────
  const sendLink = async (e) => {
    const channels = [e.email ? 'email' : null, e.phone ? 'sms' : null].filter(Boolean)
    if (!channels.length) { alert(`${e.name} has no email or phone on the card. Add one, then send the link.`); return }
    if (!confirm(`Send ${e.name} their onboarding link by ${channels.join(' and ')}? They fill in their W-4, SSN, address and bank themselves.`)) return
    setSending(e.id)
    const { data, error } = await supabase.functions.invoke('send-onboarding-link', { body: { employee_id: e.id, channels } })
    setSending(null)
    if (error || data?.error) alert('Could not send: ' + (data?.error || error.message)); else alert(`Sent to ${e.name}.`)
  }
  const deactivate = async (e) => {
    if (!confirm(`Deactivate "${e.name}"? Use this for a login row that is not a person, or someone who no longer works here. Nothing already paid is touched.`)) return
    const { error } = await supabase.from('employees').update({ active: false, updated_at: new Date().toISOString() }).eq('id', e.id).eq('company_id', companyId)
    if (error) alert(error.message); else load()
  }

  // ── Step 3: bank ───────────────────────────────────────────────────
  const applyLinkedBank = async () => {
    setBank({ loading: true, error: null })
    const { data, error } = await supabase.functions.invoke('plaid-link', { body: { action: 'ach_details', company_id: companyId } })
    if (error || data?.error) { setBank({ loading: false, error: data?.error || error.message }); return }
    const accounts = data?.accounts || []
    const pick = accounts.length === 1 ? accounts[0] : pickAchAccount(accounts)
    if (!pick) { setBank({ loading: false, error: data?.linked_items ? 'Your linked bank did not share routing and account numbers. Reconnect it from Payroll → Settings → Direct deposit.' : 'No bank is linked yet. Connect one below.' }); return }
    const ach = { ...(config.ach || {}), ...achSettingsFromPlaidAccount(pick), companyName: config.ach?.companyName || company?.legal_name || company?.company_name || '' }
    const newCfg = { ...config, ach }
    const { error: sErr } = await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(newCfg), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
    if (sErr) { setBank({ loading: false, error: sErr.message }); return }
    setConfig(newCfg); setBank({ loading: false, error: null, picked: describeAchAccount(pick) })
  }

  // ── Step 4: prior payroll import ───────────────────────────────────
  const readFile = async (file) => {
    setImp(s => ({ ...s, busy: true, error: null, stage: 'reading' }))
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
      // The header row is the first row with several non-empty cells.
      const hi = grid.findIndex(r => r.filter(c => String(c).trim()).length >= 3)
      if (hi < 0) throw new Error('No header row found in that file.')
      const headers = grid[hi].map(h => String(h).trim())
      const rows = grid.slice(hi + 1).filter(r => r.some(c => String(c).trim()))
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-map-columns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ headers, sampleRows: rows.slice(0, 5), targetFields: IMPORT_FIELDS, requiredField: 'pay_date', extraContext: 'This is a payroll register / payroll journal export from a payroll provider such as Gusto, QuickBooks Payroll or ADP: one row per employee per paycheck. Employee-share tax columns are the ones to map to ss_ee and med_ee, not employer or total columns. Totals rows are ignored.' }),
      })
      const mapRes = await resp.json()
      if (!mapRes.mapping) throw new Error(mapRes.error || 'Could not read the columns.')
      setImp(s => ({ ...s, busy: false, stage: 'mapped', headers, rows, mapping: mapRes.mapping, notes: mapRes.notes }))
    } catch (err) { setImp(s => ({ ...s, busy: false, stage: 'idle', error: err.message })) }
  }
  const mappedRows = () => {
    const m = imp.mapping
    return imp.rows.map(r => Object.fromEntries(IMPORT_FIELDS.map(f => [f.field, m[f.field] != null ? r[m[f.field]] : null])))
      .filter(r => r.employee_name && !/total/i.test(String(r.employee_name)) && r.pay_date)
  }
  const runImport = async (dry) => {
    setImp(s => ({ ...s, busy: true, error: null }))
    const { data, error } = await supabase.functions.invoke('import-payroll-history', { body: { company_id: companyId, provider: imp.provider, rows: mappedRows(), taxes_remitted: imp.taxesRemitted, create_missing: imp.createMissing, dry_run: dry } })
    if (error || data?.error) { setImp(s => ({ ...s, busy: false, error: data?.error || error.message, preview: data || s.preview })); return }
    if (dry) setImp(s => ({ ...s, busy: false, stage: 'preview', preview: data }))
    else { setImp(s => ({ ...s, busy: false, stage: 'done', result: data })); load() }
  }

  // ── Styles ─────────────────────────────────────────────────────────
  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }
  const inp = { width: '100%', padding: '9px 11px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.text, fontSize: 14, boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: 12, color: theme.textMuted, marginBottom: 4 }
  const btn = (primary) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: primary ? 'none' : `1px solid ${theme.accent}`, background: primary ? theme.accent : 'transparent', color: primary ? '#fff' : theme.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  if (loading || !form) return <div style={{ padding: 24, color: theme.textMuted }}>Loading payroll setup…</div>

  const stateInfo = suiStateFor(form.state)
  const done1 = companyProblems.length === 0
  const done2 = peopleProblems.length === 0 && w2.every(e => e.ssn_last4 && e.home_zip)
  const done3 = achReady || (config.payMethod === 'check')
  const done4 = imp.stage === 'done' || ranThisYear.length > 0
  const allDone = done1 && done2

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: theme.text }}>Payroll setup</h1>
        <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>
          Five steps, in order. When the first two are green, payroll can run here, and you can let your old provider go.
        </div>
      </div>

      {/* 1 ── Company and tax accounts */}
      <Step theme={theme} n={1} icon={Building2} title="Company and tax accounts" done={done1}
        sub={done1 ? 'Everything a deposit or a form needs is on file.' : `${companyProblems.length} thing${companyProblems.length === 1 ? '' : 's'} missing. Your old provider's tax setup page has most of these.`}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Legal business name</label><input value={form.legal_name} onChange={set('legal_name')} style={inp} /></div>
          <div><label style={lbl}>Federal EIN</label><input value={form.ein} onChange={set('ein')} placeholder="12-3456789" style={inp} /></div>
          <div><label style={lbl}>Entity type</label>
            <select value={form.entity_type} onChange={set('entity_type')} style={inp}><option value="">—</option>{ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Work state</label>
            <select value={form.state} onChange={set('state')} style={inp}><option value="">—</option>{['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => <option key={s} value={s}>{s}{SUI_STATES[s] ? '' : ' (tables not loaded yet)'}</option>)}</select></div>
          <div><label style={lbl}>Federal deposit schedule</label>
            <select value={form.federal_deposit_schedule} onChange={set('federal_deposit_schedule')} style={inp}><option value="">—</option><option value="monthly">Monthly (under $50k of tax in the lookback year)</option><option value="semiweekly">Semiweekly ($50k or more)</option></select></div>
          <div><label style={lbl}>State deposit schedule</label>
            <select value={form.state_deposit_schedule} onChange={set('state_deposit_schedule')} style={inp}><option value="">Same as federal</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option></select></div>
          {form.state && !NO_INCOME_TAX.has(form.state) && (
            <div><label style={lbl}>{form.state} withholding account number</label><input value={form.state_employer_id} onChange={set('state_employer_id')} placeholder={form.state === 'UT' ? '12345678-002-WTH' : ''} style={inp} /></div>
          )}
          <div><label style={lbl}>{stateInfo?.agencyShort || 'State'} unemployment account number</label><input value={form.sui_account_number} onChange={set('sui_account_number')} placeholder={form.state === 'UT' ? 'C-1-123456-0' : ''} style={inp} /></div>
          <div><label style={lbl}>Unemployment rate (%)</label><input value={form.sui_rate_pct} onChange={set('sui_rate_pct')} placeholder="e.g. 0.2" inputMode="decimal" style={inp} /></div>
          <div><label style={lbl}>Where the rate came from</label>
            <select value={form.sui_rate_source} onChange={set('sui_rate_source')} style={inp}><option value="">—</option>{Object.entries(SUI_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label style={lbl}>Pay frequency</label>
            <select value={form.pay_frequency} onChange={set('pay_frequency')} style={inp}><option value="">—</option>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          {form.pay_frequency === 'semimonthly' && (<>
            <div><label style={lbl}>First pay day of the month</label><input value={form.pay_day_1} onChange={set('pay_day_1')} inputMode="numeric" style={inp} /></div>
            <div><label style={lbl}>Second pay day of the month</label><input value={form.pay_day_2} onChange={set('pay_day_2')} inputMode="numeric" style={inp} /></div>
          </>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={saveCompany} disabled={saving} style={btn(true)}>{saving ? 'Saving…' : 'Save'}</button>
          {msg && <span style={{ fontSize: 13, color: msg.ok ? '#16a34a' : '#b91c1c' }}>{msg.text}</span>}
          {!done1 && <span style={{ fontSize: 12, color: theme.textMuted }}>Still missing: {companyProblems.map(p => p.label).join(', ')}</span>}
        </div>
      </Step>

      {/* 2 ── People */}
      <Step theme={theme} n={2} icon={Users} title="People" done={done2}
        sub="Every W-2 employee needs a pay rate, a W-4, an SSN and a home address. Send each person their onboarding link and they fill those in themselves, bank included.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: theme.textMuted, textAlign: 'left' }}>
              {['Name', 'Type', 'Pay', 'W-4', 'SSN', 'Address', 'Direct deposit', ''].map(h => <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border}`, fontWeight: 600 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {employees.map(e => {
                const is1099 = e.tax_classification === '1099'
                const pay = e.is_hourly ? `${money(e.hourly_rate)}/hr` : e.is_salary ? `${money(e.annual_salary)}/yr` : null
                const notPerson = !pay && !String(e.name || '').trim().includes(' ')
                const ok = (v) => <span style={{ color: v ? '#16a34a' : '#b45309', fontWeight: 600 }}>{v ? '✓' : 'missing'}</span>
                return (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}`, background: notPerson ? 'rgba(234,179,8,0.08)' : 'transparent' }}>
                    <td style={{ padding: '8px', color: theme.text, fontWeight: 600 }}>{e.name}{notPerson && <div style={{ fontSize: 11, color: '#a16207', fontWeight: 500 }}>Looks like a login, not a person</div>}</td>
                    <td style={{ padding: '8px', color: theme.textMuted }}>{is1099 ? '1099' : 'W-2'}</td>
                    <td style={{ padding: '8px' }}>{pay ? <span style={{ color: theme.text }}>{pay}</span> : ok(false)}</td>
                    <td style={{ padding: '8px' }}>{is1099 ? <span style={{ color: theme.textMuted }}>n/a</span> : ok(!!e.w4_filing_status)}</td>
                    <td style={{ padding: '8px' }}>{ok(!!e.ssn_last4)}</td>
                    <td style={{ padding: '8px' }}>{ok(!!(e.home_address && e.home_zip))}</td>
                    <td style={{ padding: '8px' }}>{is1099 ? <span style={{ color: theme.textMuted }}>n/a</span> : (ddByEmp[e.id] ? ok(true) : <span style={{ color: theme.textMuted }}>check</span>)}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      {notPerson
                        ? <button onClick={() => deactivate(e)} style={{ ...btn(false), padding: '6px 10px', fontSize: 12 }}>Deactivate</button>
                        : <button onClick={() => sendLink(e)} disabled={sending === e.id} style={{ ...btn(false), padding: '6px 10px', fontSize: 12 }}><Send size={12} /> {sending === e.id ? 'Sending…' : 'Send onboarding link'}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => navigate('/employees')} style={btn(false)}>Open Employees <ChevronRight size={14} /></button>
          <span style={{ fontSize: 12, color: theme.textMuted }}>Rates and W-4s can also be typed on the employee card. Former employees paid this year need an SSN and address too, for their W-2.</span>
        </div>
      </Step>

      {/* 3 ── Bank */}
      <Step theme={theme} n={3} icon={Landmark} title="Bank and how you pay" done={done3}
        sub={achReady ? `Direct deposit file ready from ${config.ach?.odfiName || 'your bank'} · ${ddCount} of ${w2.length} employees have a bank on file.` : 'Checks work from day one. For direct deposit, JobScout builds the ACH file your bank uploads; it needs your account on file and ACH origination turned on at the bank.'}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={applyLinkedBank} disabled={bank.loading} style={btn(true)}><Landmark size={14} /> {bank.loading ? 'Reading your bank…' : 'Use my linked bank'}</button>
          <PlaidLink companyId={companyId} theme={theme} label="Connect a bank" onSuccess={() => applyLinkedBank()} onError={(m) => setBank({ loading: false, error: String(m) })} />
          <button onClick={async () => { const newCfg = { ...config, payMethod: 'check' }; await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(newCfg), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' }); setConfig(newCfg) }} style={btn(false)}>We write checks</button>
          {bank.picked && <span style={{ fontSize: 13, color: '#16a34a' }}>On file: {bank.picked}</span>}
          {bank.error && <span style={{ fontSize: 13, color: '#b91c1c' }}>{bank.error}</span>}
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 10 }}>Employees add their own account under My Pay → Set up direct deposit. Nobody in the office types account numbers.</div>
      </Step>

      {/* 4 ── Prior payroll */}
      <Step theme={theme} n={4} icon={Upload} title={`Paychecks already paid in ${thisYear}`} done={done4}
        sub={stubCount > 0 ? `${stubCount} paycheck${stubCount === 1 ? '' : 's'} on file for ${thisYear}. If the old provider paid more before you switched, bring those in too.` : 'If anyone was paid this year through Gusto, QuickBooks, ADP or anything else, those checks belong here: year-to-date, the wage caps, the 941 and the W-2s all count the whole year.'}>
        <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>
          Export the <b>payroll journal</b> or <b>payroll register</b> for the year (Gusto: Reports → Payroll journal, CSV; QuickBooks: Payroll Details; ADP: Payroll Register) with one row per employee per check, and drop it here. The columns are read automatically.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={lbl}>Who paid them<br />
            <select value={imp.provider} onChange={e => setImp(s => ({ ...s, provider: e.target.value }))} style={{ ...inp, width: 200 }}>{['Gusto', 'QuickBooks Payroll', 'ADP', 'Paychex', 'Square Payroll', 'Other'].map(p => <option key={p}>{p}</option>)}</select></label>
          <label style={{ ...btn(true), cursor: 'pointer' }}><Upload size={14} /> {imp.busy && imp.stage === 'reading' ? 'Reading…' : 'Choose the export (CSV or Excel)'}
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && readFile(e.target.files[0])} /></label>
        </div>
        {imp.error && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', color: '#b91c1c', fontSize: 13 }}>{imp.error}</div>}
        {(imp.stage === 'mapped' || imp.stage === 'preview') && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 6 }}>Columns read from the file ({imp.rows.length} rows)</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 6 }}>
              {IMPORT_FIELDS.map(f => (
                <label key={f.field} style={{ fontSize: 12, color: theme.textMuted }}>{f.desc}{f.required ? ' *' : ''}
                  <select value={imp.mapping[f.field] ?? ''} onChange={e => setImp(s => ({ ...s, stage: 'mapped', preview: null, mapping: { ...s.mapping, [f.field]: e.target.value === '' ? undefined : Number(e.target.value) } }))} style={{ ...inp, padding: '6px 8px', fontSize: 12 }}>
                    <option value="">— not in file —</option>
                    {imp.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 13, color: theme.text }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={imp.taxesRemitted} onChange={e => setImp(s => ({ ...s, taxesRemitted: e.target.checked }))} /> {imp.provider} paid the taxes on these checks</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={imp.createMissing} onChange={e => setImp(s => ({ ...s, createMissing: e.target.checked }))} /> Add people in the file who are not in JobScout (as inactive former employees)</label>
              <button onClick={() => runImport(true)} disabled={imp.busy} style={btn(true)}>{imp.busy ? 'Checking…' : 'Check the file'}</button>
            </div>
          </div>
        )}
        {imp.stage === 'preview' && imp.preview && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{imp.preview.totals.checks} checks in {imp.preview.runs.length} payrolls · gross {money(imp.preview.totals.gross)} · net {money(imp.preview.totals.net)} · federal withheld {money(imp.preview.totals.fit)} · state {money(imp.preview.totals.sit)}</div>
            {imp.preview.skipped_duplicates > 0 && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{imp.preview.skipped_duplicates} already on file, skipped.</div>}
            {imp.preview.unmatched.length > 0 && <div style={{ fontSize: 12, color: '#a16207', marginTop: 4 }}>Not in JobScout: {imp.preview.unmatched.join(', ')}{imp.createMissing ? ' — will be added as inactive former employees.' : ' — their rows will be left out.'}</div>}
            {imp.preview.warnings.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{imp.preview.warnings.slice(0, 5).join(' · ')}{imp.preview.warnings.length > 5 ? ` · and ${imp.preview.warnings.length - 5} more` : ''}</div>}
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ color: theme.textMuted, textAlign: 'left' }}>{['Pay date', 'Period', 'Checks', 'Gross', 'Net'].map(h => <th key={h} style={{ padding: '4px 6px' }}>{h}</th>)}</tr></thead>
                <tbody>{imp.preview.runs.map(r => <tr key={r.payDate + r.periodStart} style={{ borderTop: `1px solid ${theme.border}`, color: theme.text }}><td style={{ padding: '4px 6px' }}>{r.payDate}</td><td style={{ padding: '4px 6px' }}>{r.periodStart} – {r.periodEnd}</td><td style={{ padding: '4px 6px' }}>{r.checks}</td><td style={{ padding: '4px 6px' }}>{money(r.gross)}</td><td style={{ padding: '4px 6px' }}>{money(r.net)}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => { if (confirm(`Import ${imp.preview.totals.checks} checks as ${imp.preview.runs.length} completed payrolls? They become paystubs and year-to-date for every employee named.`)) runImport(false) }} disabled={imp.busy || !imp.preview.totals.checks} style={btn(true)}>{imp.busy ? 'Importing…' : 'Import these checks'}</button>
              <span style={{ fontSize: 12, color: theme.textMuted }}>Compare the gross and net above with the provider's own totals before you press it.</span>
            </div>
          </div>
        )}
        {imp.stage === 'done' && imp.result && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.10)', color: '#15803d', fontSize: 13 }}>
            Imported {imp.result.imported.stubs} checks as {imp.result.imported.runs} payrolls. {imp.result.created?.length ? `Added ${imp.result.created.length} former employee${imp.result.created.length === 1 ? '' : 's'}: ${imp.result.created.join(', ')}. Add their SSN and address for the W-2.` : ''}
          </div>
        )}
      </Step>

      {/* 5 ── Run */}
      <Step theme={theme} n={5} icon={Play} title="Run your first payroll here" done={ranThisYear.length > 0 && allDone}
        sub={allDone ? 'The gate is clear. Run the current period on the Payroll page; stubs go out by email when it processes, and the Payroll Inbox tells you what tax to deposit and when.' : 'The Payroll page will not process until steps 1 and 2 are green. It lists the same items.'}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => navigate('/payroll')} style={btn(allDone)}>Go to Payroll <ChevronRight size={14} /></button>
          <button onClick={() => navigate('/payroll/inbox')} style={btn(false)}>Payroll Inbox</button>
          {!allDone && <span style={{ fontSize: 12, color: '#a16207', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> {problems.length} item{problems.length === 1 ? '' : 's'} left above</span>}
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 10 }}>
          Leaving Gusto or another provider: keep it through the quarter it last filed, so it files that quarter's returns, and tell it not to file W-2s for this year. JobScout files the full year.
        </div>
      </Step>
    </div>
  )
}
