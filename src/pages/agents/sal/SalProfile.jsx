import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, UserCircle, Lightbulb } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { toast } from '../../../lib/toast'
import { DEFAULT_THRESHOLDS } from '../../../lib/bidFit'

const defaultTheme = { bg: '#f7f5ef', bgCard: '#fff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,.12)' }
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const SET_ASIDES = [
  { key: 'sb', label: 'Small business' }, { key: 'wosb', label: 'Women-owned (WOSB)' }, { key: 'edwosb', label: 'EDWOSB' },
  { key: 'vosb', label: 'Veteran-owned' }, { key: 'sdvosb', label: 'Service-disabled veteran-owned' }, { key: '8a', label: '8(a)' },
  { key: 'hubzone', label: 'HUBZone' }, { key: 'dbe', label: 'DBE' }, { key: 'mbe', label: 'MBE' },
]
const csv = (a) => (Array.isArray(a) ? a.join(', ') : '')
const uncsv = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
const emptyLine = () => ({ label: '', naics: [], commodity_codes: [], keywords: [], exclusions: [] })

// What a fit means for this company. Sal's prefilter reads it word for word
// (states, exclusions, set-asides, size band, margin); the fit scorer reads
// the rest as a description. Nothing here is a price.
export default function SalProfile() {
  const companyId = useStore((s) => s.companyId)
  const employees = useStore((s) => s.employees) || []
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [p, setP] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('bid_profiles').select('*').eq('company_id', companyId).order('id', { ascending: false }).limit(1)
      const row = data?.[0]
      if (!alive) return
      setP(row ? {
        ...row,
        service_lines: Array.isArray(row.service_lines) && row.service_lines.length ? row.service_lines : [emptyLine()],
        service_area: row.service_area || {}, thresholds: { ...DEFAULT_THRESHOLDS, ...(row.thresholds || {}) },
        federal: row.federal || {}, bonding: row.bonding || {}, licenses: Array.isArray(row.licenses) ? row.licenses : [],
      } : {
        id: null, service_lines: [emptyLine()], service_area: { states: [], radius_km: null }, value_min: null, value_max: null, set_asides: [],
        licenses: [], bonding: {}, federal: {}, capability_statement: '', thresholds: { ...DEFAULT_THRESHOLDS }, signer_employee_id: null,
      })
    })()
    return () => { alive = false }
  }, [companyId])

  const set = (patch) => setP((x) => ({ ...x, ...patch }))
  const setLine = (i, patch) => setP((x) => ({ ...x, service_lines: x.service_lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))

  const save = async () => {
    if (!p) return
    setSaving(true)
    const { data: sess } = await supabase.auth.getSession()
    const row = {
      company_id: companyId,
      service_lines: p.service_lines.filter((l) => l.label || l.naics?.length || l.keywords?.length),
      service_area: { states: p.service_area?.states || [], radius_km: p.service_area?.radius_km ? Number(p.service_area.radius_km) : null, home: p.service_area?.home || null },
      value_min: p.value_min === '' || p.value_min == null ? null : Number(p.value_min),
      value_max: p.value_max === '' || p.value_max == null ? null : Number(p.value_max),
      set_asides: p.set_asides || [], licenses: p.licenses || [], bonding: p.bonding || {}, federal: p.federal || {},
      capability_statement: p.capability_statement || null, thresholds: p.thresholds || DEFAULT_THRESHOLDS,
      signer_employee_id: p.signer_employee_id || null, updated_by: sess?.session?.user?.email || null, updated_at: new Date().toISOString(),
    }
    // One row per company: the unique index on company_id is the upsert target.
    const { data, error } = await supabase.from('bid_profiles').upsert(row, { onConflict: 'company_id' }).select('id').single()
    setSaving(false)
    if (error) { toast.error(`Could not save: ${error.message}`); return }
    set({ id: data.id })
    toast.success('Profile saved — Sal scores against it from the next alert on')
  }

  if (!p) return <div style={{ padding: '24px', color: theme.textMuted, fontSize: '13px' }}>Loading…</div>

  const pad = isMobile ? '16px' : '24px'
  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: isMobile ? '14px' : '18px', display: 'flex', flexDirection: 'column', gap: '10px' }
  const input = { width: '100%', minHeight: '44px', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, boxSizing: 'border-box' }
  const label = { fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px', display: 'block' }
  const h = (t) => <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>{t}</div>
  const two = { display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: '10px' }
  const chip = (on) => ({ minHeight: '36px', padding: '0 10px', borderRadius: '999px', border: `1px solid ${on ? theme.accent : theme.border}`, backgroundColor: on ? theme.accent : theme.bgCard, color: on ? '#fff' : theme.textSecondary, fontSize: '12px', fontWeight: 600, cursor: 'pointer' })
  const states = p.service_area?.states || []
  const toggleState = (s) => set({ service_area: { ...p.service_area, states: states.includes(s) ? states.filter((x) => x !== s) : [...states, s] } })
  const toggleSA = (k) => set({ set_asides: (p.set_asides || []).includes(k) ? p.set_asides.filter((x) => x !== k) : [...(p.set_asides || []), k] })

  return (
    <div style={{ padding: pad, maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={card}>
        {h('What we do')}
        <div style={{ fontSize: '12px', color: theme.textMuted }}>One line per kind of work you bid. Codes and keywords raise the score; an exclusion anywhere in a notice rejects it before Sal reads further.</div>
        {p.service_lines.map((l, i) => (
          <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '8px', alignItems: 'end' }}>
              <div><span style={label}>Service line</span><input style={input} value={l.label || ''} onChange={(e) => setLine(i, { label: e.target.value })} placeholder="Commercial lighting retrofit" /></div>
              <button onClick={() => set({ service_lines: p.service_lines.filter((_, j) => j !== i) })} aria-label="Remove" style={{ minHeight: '44px', minWidth: '44px', border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.bgCard, color: '#b91c1c', cursor: 'pointer' }}><Trash2 size={16} /></button>
            </div>
            <div style={two}>
              <div><span style={label}>NAICS codes</span><input style={input} defaultValue={csv(l.naics)} onBlur={(e) => setLine(i, { naics: uncsv(e.target.value) })} placeholder="238210, 561720" /></div>
              <div><span style={label}>Commodity / NIGP codes</span><input style={input} defaultValue={csv(l.commodity_codes)} onBlur={(e) => setLine(i, { commodity_codes: uncsv(e.target.value) })} placeholder="285, 910" /></div>
              <div><span style={label}>Keywords</span><input style={input} defaultValue={csv(l.keywords)} onBlur={(e) => setLine(i, { keywords: uncsv(e.target.value) })} placeholder="lighting, LED, retrofit, fixture" /></div>
              <div><span style={label}>Exclusions (reject on sight)</span><input style={input} defaultValue={csv(l.exclusions)} onBlur={(e) => setLine(i, { exclusions: uncsv(e.target.value) })} placeholder="traffic signal, runway" /></div>
            </div>
          </div>
        ))}
        <button onClick={() => set({ service_lines: [...p.service_lines, emptyLine()] })} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '40px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}><Plus size={15} /> Add a line</button>
      </div>

      <div style={card}>
        {h('Where we work')}
        <div style={{ fontSize: '12px', color: theme.textMuted }}>A notice in another state is rejected. Leave every state off to accept any.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{US_STATES.map((s) => <button key={s} onClick={() => toggleState(s)} style={chip(states.includes(s))}>{s}</button>)}</div>
        <div style={two}>
          <div><span style={label}>Radius from home (km), when the notice gives a place</span><input style={input} type="number" min="0" defaultValue={p.service_area?.radius_km ?? ''} onBlur={(e) => set({ service_area: { ...p.service_area, radius_km: e.target.value ? Number(e.target.value) : null } })} placeholder="250" /></div>
        </div>
      </div>

      <div style={card}>
        {h('Job size')}
        <div style={two}>
          <div><span style={label}>Smallest job worth bidding ($)</span><input style={input} type="number" min="0" defaultValue={p.value_min ?? ''} onBlur={(e) => set({ value_min: e.target.value })} placeholder="5000" /></div>
          <div><span style={label}>Largest we can take ($)</span><input style={input} type="number" min="0" defaultValue={p.value_max ?? ''} onBlur={(e) => set({ value_max: e.target.value })} placeholder="750000" /></div>
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted }}>Only applied when the notice prints a value. Sal never estimates one.</div>
      </div>

      <div style={card}>
        {h('Certifications we hold')}
        <div style={{ fontSize: '12px', color: theme.textMuted }}>A set-aside you do not hold is a hard block: Sal will not let anyone choose it without an override.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{SET_ASIDES.map((s) => <button key={s.key} onClick={() => toggleSA(s.key)} style={chip((p.set_asides || []).includes(s.key))}>{s.label}</button>)}</div>
        <div style={two}>
          <div><span style={label}>SAM.gov UEI</span><input style={input} defaultValue={p.federal?.uei || ''} onBlur={(e) => set({ federal: { ...p.federal, uei: e.target.value.trim() || null } })} placeholder="12-character UEI" /></div>
          <div><span style={label}>CAGE code</span><input style={input} defaultValue={p.federal?.cage || ''} onBlur={(e) => set({ federal: { ...p.federal, cage: e.target.value.trim() || null } })} /></div>
          <div><span style={label}>Bonding — single job limit ($)</span><input style={input} type="number" defaultValue={p.bonding?.single_limit ?? ''} onBlur={(e) => set({ bonding: { ...p.bonding, single_limit: e.target.value ? Number(e.target.value) : null } })} /></div>
          <div><span style={label}>Bonding — aggregate limit ($)</span><input style={input} type="number" defaultValue={p.bonding?.aggregate_limit ?? ''} onBlur={(e) => set({ bonding: { ...p.bonding, aggregate_limit: e.target.value ? Number(e.target.value) : null } })} /></div>
          <div><span style={label}>Surety agent (name, email)</span><input style={input} defaultValue={[p.bonding?.surety_agent?.name, p.bonding?.surety_agent?.email].filter(Boolean).join(', ')} onBlur={(e) => { const [name, email] = uncsv(e.target.value); set({ bonding: { ...p.bonding, surety_agent: name || email ? { name: name || null, email: email || null } : null } }) }} /></div>
          <div><span style={label}>Who signs bids</span>
            <select style={input} value={p.signer_employee_id || ''} onChange={(e) => set({ signer_employee_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Not set</option>
              {employees.filter((e) => e.active !== false).map((e) => <option key={e.id} value={e.id}>{e.name}{e.role ? ` — ${e.role}` : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={card}>
        {h('About us')}
        <div style={{ fontSize: '12px', color: theme.textMuted }}>Two or three sentences Sal reads when he judges fit, and Benny will reuse on the cover letter and qualification page.</div>
        <textarea style={{ ...input, minHeight: '96px', resize: 'vertical' }} defaultValue={p.capability_statement || ''} onBlur={(e) => set({ capability_statement: e.target.value })} placeholder="Licensed commercial electrical contractor since 2014: LED retrofits, controls and lighting maintenance for schools, municipalities and property managers across the Wasatch Front." />
      </div>

      <div style={card}>
        {h('How picky Sal is')}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))', gap: '10px' }}>
          <div><span style={label}>Auto-dismiss below (score)</span><input style={input} type="number" min="0" max="100" defaultValue={p.thresholds.auto_dismiss_below} onBlur={(e) => set({ thresholds: { ...p.thresholds, auto_dismiss_below: Number(e.target.value) || 0 } })} /></div>
          <div><span style={label}>Notify at (score)</span><input style={input} type="number" min="0" max="100" defaultValue={p.thresholds.notify_at} onBlur={(e) => set({ thresholds: { ...p.thresholds, notify_at: Number(e.target.value) || 0 } })} /></div>
          <div><span style={label}>Ignore deadlines inside (hours)</span><input style={input} type="number" min="0" defaultValue={p.thresholds.due_margin_hours} onBlur={(e) => set({ thresholds: { ...p.thresholds, due_margin_hours: Number(e.target.value) || 0 } })} /></div>
        </div>
        {p.learned?.summary && <div style={{ fontSize: '12px', color: theme.textSecondary, display: 'flex', gap: '6px', alignItems: 'flex-start' }}><Lightbulb size={14} style={{ color: theme.accent, flexShrink: 0, marginTop: '2px' }} /><span>What Sal has learned from your decisions: {p.learned.summary}.</span></div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '0 18px', borderRadius: '8px', border: 'none', backgroundColor: theme.accent, color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
      <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', gap: '6px' }}><UserCircle size={14} /> Certificates (COI, W-9, licenses, bonding letter) live under Settings → Company documents; Benny's packet reads them from there.</div>
    </div>
  )
}
