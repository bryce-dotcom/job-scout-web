// The Crew Sheet — the day or week a crew lead takes into the field (Bryce,
// 2026-10-26: London was having Grok build one from JobScout exports).
//
// Every scheduled job with its crew, contact and lines; ladder or lift from the
// audit's ceiling heights; the parts inside each bundle and the PO; how long it
// should take from what crews actually clocked, beside the plan; what to
// confirm before rolling; and one pull list for the trailer. Printed by
// lib/crewSheetPdf. The sheet itself comes from the crew-sheet function
// (supabase/functions/_shared/crewSheet.ts), which Jenny reads out as well.

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { ClipboardList, Download, AlertTriangle, Clock, ArrowUpToLine, Package, Loader2 } from 'lucide-react'
import { generateCrewSheetPdf, crewSheetFilename, laborWords, reachWords } from '../lib/crewSheetPdf'

const defaultTheme = { bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)' }

/** Today, or a day, as YYYY-MM-DD; and the Mon–Fri around it. */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function weekOf(day) {
  const d = new Date(`${day}T12:00:00`)
  const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
  return { from: isoDay(mon), to: isoDay(fri) }
}

export default function CrewSheet() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const company = useStore((s) => s.company)
  const employees = useStore((s) => s.employees)
  const [params, setParams] = useSearchParams()

  const today = isoDay(new Date())
  const from = params.get('from') || today
  const to = params.get('to') || from
  const crew = params.get('crew') || ''
  const isWeek = from !== to

  const [sheet, setSheet] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let gone = false
    setLoading(true); setError('')
    supabase.functions.invoke('crew-sheet', { body: { from, to, ...(crew ? { crew } : {}) } })
      .then(({ data, error: e }) => {
        if (gone) return
        if (e || data?.error) { setError(data?.error || 'The crew sheet could not be put together just now.'); setSheet(null) }
        else setSheet(data)
      })
      .finally(() => { if (!gone) setLoading(false) })
    return () => { gone = true }
  }, [from, to, crew])

  const set = (next) => setParams(Object.fromEntries(Object.entries({ from, to, crew, ...next }).filter(([, v]) => v)))
  const crewNames = useMemo(() => [...new Set((employees || []).filter((e) => e.active !== false).map((e) => e.name).filter(Boolean))].sort(), [employees])
  const tz = sheet?.tz || 'America/Denver'
  const at = (iso, opts) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: tz, ...opts }) : ''

  const download = () => {
    if (!sheet) return
    generateCrewSheetPdf(sheet, { company: company?.company_name || '' }).save(crewSheetFilename(sheet))
  }

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 14 : 18 }
  const chip = (bg, fg) => ({ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 8, backgroundColor: bg, color: fg, fontSize: 13, lineHeight: 1.45 })

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: theme.text, margin: 0 }}>
          <ClipboardList size={24} style={{ color: theme.accent }} /> Crew Sheet
        </h1>
        <button onClick={download} disabled={!sheet || loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: sheet ? 'pointer' : 'default', opacity: sheet ? 1 : 0.5 }}>
          <Download size={16} /> Download PDF
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <input type="date" value={from} aria-label="Day" onChange={(e) => { const d = e.target.value; if (d) set(isWeek ? weekOf(d) : { from: d, to: d }) }}
          style={{ padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCard, color: theme.text, fontSize: 14 }} />
        <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[['Day', false], ['Week', true]].map(([label, week]) => (
            <button key={label} onClick={() => set(week ? weekOf(from) : { from, to: from })}
              style={{ padding: '8px 14px', border: 'none', fontSize: 14, cursor: 'pointer', background: isWeek === week ? theme.accent : theme.bgCard, color: isWeek === week ? '#fff' : theme.text }}>{label}</button>
          ))}
        </div>
        <select value={crew} onChange={(e) => set({ crew: e.target.value })} aria-label="Crew member"
          style={{ padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgCard, color: theme.text, fontSize: 14, maxWidth: '100%' }}>
          <option value="">Every crew</option>
          {crewNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {sheet?.scope === 'mine' && <span style={{ fontSize: 13, color: theme.textMuted }}>Showing the jobs you are on.</span>}
      </div>

      {loading && <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: theme.textMuted }}><Loader2 size={18} className="spin" /> Putting the sheet together…</div>}
      {error && !loading && <div style={{ ...card, color: '#9a3b2e' }}>{error}</div>}
      {sheet && !loading && !sheet.jobs.length && <div style={{ ...card, color: theme.textMuted }}>Nothing on the schedule {isWeek ? 'that week' : 'that day'}{crew ? ` for ${crew}` : ''}.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sheet && !loading && sheet.jobs.map((j) => {
          const lw = laborWords(j.labor)
          const rw = reachWords(j.reach)
          return (
            <section key={j.id} data-crew-job style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <a href={`/jobs/${j.id}`} style={{ fontSize: 17, fontWeight: 700, color: theme.text, textDecoration: 'none' }}>{j.title}</a>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>{j.job_id} · {j.status}</div>
                </div>
                <div style={{ fontSize: 13, color: theme.textSecondary, textAlign: isMobile ? 'left' : 'right' }}>
                  <div><b>{at(j.start, { weekday: 'short', month: 'short', day: 'numeric' })}</b> {at(j.start, { hour: 'numeric', minute: '2-digit' })}{j.end ? `–${at(j.end, { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
                  <div>{j.crew.length ? j.crew.join(', ') : <span style={{ color: '#9a3b2e' }}>No crew assigned</span>}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 8, margin: '12px 0', fontSize: 13, color: theme.textSecondary }}>
                <div><b style={{ color: theme.text }}>{j.customer}</b><br />{j.address}</div>
                <div>{[j.contact?.name, j.contact?.phone && <a key="p" href={`tel:${j.contact.phone}`}>{j.contact.phone}</a>, j.contact?.email].filter(Boolean).map((x, i) => <div key={i}>{x}</div>)}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {lw && <div style={chip('rgba(90,99,73,0.10)', theme.text)}><Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div><b>How long:</b> {lw.est}.{lw.plan ? <> {lw.plan}</> : null}<div style={{ fontSize: 12, color: theme.textMuted }}>{lw.basis}</div></div></div>}
                {rw && <div style={chip('rgba(70,80,140,0.08)', theme.text)}><ArrowUpToLine size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div><b>Ladder or lift:</b> {rw}</div></div>}
                {j.flags?.length > 0 && <div style={chip('rgba(194,120,3,0.10)', theme.text)}><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2, color: '#a86400' }} /><div><b>Confirm before rolling</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{j.flags.map((f, i) => <li key={i}>{f}</li>)}</ul></div></div>}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ color: theme.textMuted, textAlign: 'left' }}><th style={{ padding: '6px 8px 6px 0', width: 44 }}>Qty</th><th style={{ padding: '6px 8px' }}>What · where · parts</th><th style={{ padding: '6px 0 6px 8px', width: 96 }}>Reach</th></tr></thead>
                  <tbody>
                    {j.lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${theme.border}`, verticalAlign: 'top' }}>
                        <td style={{ padding: '8px 8px 8px 0', fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>{l.qty}</td>
                        <td style={{ padding: '8px', color: theme.text }}>
                          <div style={{ fontWeight: 600 }}>{l.product}</div>
                          {l.note && <div style={{ color: theme.textSecondary }}>{l.note}</div>}
                          {l.parts?.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>Parts: {l.parts.map((p) => p.order_code ? `${p.name} [${p.order_code}]` : p.name).join(' + ')}</div>}
                        </td>
                        <td style={{ padding: '8px 0 8px 8px', color: l.reach && l.reach !== 'ladder' ? '#a86400' : theme.textSecondary, fontWeight: l.reach && l.reach !== 'ladder' ? 700 : 400 }}>{l.reach || ''}{l.height ? <div style={{ fontWeight: 400, fontSize: 12, color: theme.textMuted }}>{l.height} ft</div> : null}</td>
                      </tr>
                    ))}
                    {!j.lines.length && <tr><td colSpan={3} style={{ padding: 8, color: theme.textMuted }}>No line items on this job.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}

        {sheet && !loading && sheet.pull_list?.length > 0 && (
          <section data-pull-list style={card}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, margin: '0 0 4px', color: theme.text }}><Package size={18} style={{ color: theme.accent }} /> Pull list</h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: theme.textMuted }}>Every part on these jobs — the fixtures and the sensors inside each bundle.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {sheet.pull_list.map((p) => (
                  <tr key={p.product_id} style={{ borderTop: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 8px 7px 0', width: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: theme.text }}>{p.qty}</td>
                    <td style={{ padding: '7px 8px', color: theme.text }}>{p.name}{p.order_code ? <span style={{ color: theme.textMuted }}> [{p.order_code}]</span> : null}</td>
                    {sheet.jobs.length > 1 && <td style={{ padding: '7px 0 7px 8px', fontSize: 12, color: theme.textMuted }}>{p.jobs.join(', ')}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}
