import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, CheckCircle, Circle, FileText, Download, Sparkles, AlertTriangle, ExternalLink, MinusCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { seedChecklist, autoDoneChecklist, submitReadiness, certificateItems, sortPacket } from '../../lib/bidPacket'
import { bidIntakeOf } from '../../lib/bidSchedule'
import { bidPdfBlob } from '../../lib/bidPdf'
import { generateCoverLetterPdf, generateQualificationsPdf } from '../../lib/bidPacketPdf'
import { mergePdfParts } from '../../lib/pdfPackage'
import { extractFormFields, fillPdfForm } from '../../lib/pdfFormFiller'

// The bid packet (SAL_SCOUT_PLAN.md §5.7–5.8): what the buyer asked for, what
// we have, and whether it may go. One card on the bid's page.
//
//   checklist  — read out of the package by Benny (bid_submissions.checklist),
//                ticked by a person or by the packet itself (autoDoneChecklist).
//   cover letter — Benny drafts, a person edits; never sent unread.
//   packet     — bid form + letter + qualifications + the buyer's fillable
//                forms (fields mapped by Benny, blanks left for a person) +
//                certificates, each as its own file and all as one PDF.
//   readiness  — every reason it may not go yet (lib/bidPacket.submitReadiness).
// Sending is Phase 3; this card ends at "ready to submit".

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const BUCKET = 'project-documents'

async function signedBytes(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket || BUCKET).createSignedUrl(path, 600)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'no signed url')
  const r = await fetch(data.signedUrl)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}

// companies.*_url holds either a storage path or a URL into the bucket.
async function certificateBytes(url) {
  const m = String(url).match(/\/object\/(?:public\/|sign\/)?project-documents\/([^?]+)/)
  if (m) return signedBytes(BUCKET, decodeURIComponent(m[1]))
  if (/^https?:\/\//i.test(url)) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
  return signedBytes(BUCKET, String(url).replace(/^\/+/, ''))
}

const isPdfBytes = (b) => b && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46

export default function BidPacketCard({ theme, estimate, lineItems, company, businessUnit, customerInfo, user, currentEmployee, isMobile }) {
  const companyId = useStore((s) => s.companyId)
  const [sub, setSub] = useState(null)
  const [opp, setOpp] = useState(null)
  const [profile, setProfile] = useState(null)
  const [signer, setSigner] = useState(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState('')
  const [loading, setLoading] = useState(true)
  const who = user?.email || currentEmployee?.email || currentEmployee?.name || null
  const intake = useMemo(() => bidIntakeOf(estimate), [estimate])
  const requirements = opp?.requirements && Object.keys(opp.requirements).length ? opp.requirements : (estimate?.bid_intake?.requirements || null)
  const dueAt = opp?.due_at || intake.due_at || null

  const load = async () => {
    if (!companyId || !estimate?.id) return
    setLoading(true)
    const [{ data: subs }, oppRes, { data: prof }] = await Promise.all([
      supabase.from('bid_submissions').select('*').eq('company_id', companyId).eq('quote_id', estimate.id).neq('status', 'withdrawn').limit(1),
      estimate.bid_opportunity_id ? supabase.from('bid_opportunities').select('id, title, buyer, buyer_level, solicitation_number, due_at, submit_method, submit_to, requirements, blockers, documents, url').eq('id', estimate.bid_opportunity_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('bid_profiles').select('capability_statement, past_performance, key_personnel, licenses, bonding, federal, signer_employee_id').eq('company_id', companyId).maybeSingle(),
    ])
    setOpp(oppRes?.data || null); setProfile(prof || null)
    if (prof?.signer_employee_id) {
      const { data: s } = await supabase.from('employees').select('name, role').eq('id', prof.signer_employee_id).maybeSingle()
      setSigner(s || null)
    }
    let row = subs?.[0] || null
    if (!row) {
      // No submission yet (a bid older than the requirements pass, or one
      // Benny could not read requirements for): seed the base checklist so
      // the card is usable, and keep it.
      const req = oppRes?.data?.requirements && Object.keys(oppRes.data.requirements).length ? oppRes.data.requirements : (estimate?.bid_intake?.requirements || {})
      const ins = await supabase.from('bid_submissions').insert({ company_id: companyId, opportunity_id: estimate.bid_opportunity_id || null, quote_id: estimate.id, method: req?.submit_method && req.submit_method !== 'unknown' ? req.submit_method : null, checklist: seedChecklist(req), status: 'draft', created_by: who }).select('*').single()
      if (ins.error) toast.error(`Could not start the packet: ${ins.error.message}`)
      row = ins.data || null
    }
    setSub(row); setCoverLetter(row?.cover_letter || '')
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId, estimate?.id, estimate?.bid_opportunity_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSub = async (patch) => {
    if (!sub) return
    const { data, error } = await supabase.from('bid_submissions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', sub.id).select('*').single()
    if (error) { toast.error(`Could not save: ${error.message}`); return }
    setSub(data)
  }

  const tick = async (row) => {
    const now = new Date().toISOString()
    const next = (sub.checklist || []).map((r) => r.key === row.key ? (r.done ? { ...r, done: false, done_by: null, done_at: null } : { ...r, done: true, done_by: who, done_at: now, waived_reason: null }) : r)
    await saveSub({ checklist: next })
  }
  const waive = async (row) => {
    if (row.waived_reason) { await saveSub({ checklist: sub.checklist.map((r) => r.key === row.key ? { ...r, waived_reason: null } : r) }); return }
    const reason = window.prompt(`Why does "${row.item}" not apply to this bid? (the reason is kept on the submission)`)
    if (!reason || !reason.trim()) return
    await saveSub({ checklist: sub.checklist.map((r) => r.key === row.key ? { ...r, waived_reason: reason.trim(), done: false } : r) })
  }

  const callAi = async (action, extra = {}) => {
    const { data: sess } = await supabase.auth.getSession()
    const r = await fetch(`${SUPABASE_URL}/functions/v1/bid-packet-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token || ANON_KEY}`, apikey: ANON_KEY }, body: JSON.stringify({ company_id: companyId, quote_id: estimate.id, action, ...extra }) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.ok) throw new Error(data.error || `Benny could not do that (${r.status})`)
    return data
  }

  const draftLetter = async () => {
    setDrafting(true)
    try { const d = await callAi('cover_letter'); setCoverLetter(d.cover_letter || ''); await saveSub({ cover_letter: d.cover_letter || '' }); toast.success('Benny drafted the letter — read it before it goes anywhere') }
    catch (e) { toast.error(e.message) }
    setDrafting(false)
  }

  const buildPacket = async () => {
    if (!sub) return
    setBuilding(true)
    const parts = [] // { kind, file_name, bytes, note }
    const notes = []
    try {
      setProgress('Bid form…')
      const readiness = submitReadiness({ documentType: estimate.document_type || 'bid', lines: lineItems, checklist: sub.checklist, company, dueAt, blockers: opp?.blockers || [] })
      const formBlob = bidPdfBlob({ estimate, lineItems, company, businessUnit, customer: customerInfo, draftWatermark: readiness.unverified > 0 })
      const ref = estimate.quote_id || `EST-${estimate.id}`
      parts.push({ kind: 'bid_form', file_name: `${ref}_bid_form.pdf`, bytes: new Uint8Array(await formBlob.arrayBuffer()) })
      if (coverLetter.trim()) {
        setProgress('Cover letter…')
        const doc = generateCoverLetterPdf({ company, businessUnit, opportunity: opp, intake, coverLetter, total: Number(estimate.quote_amount) || null, signer: signer ? { name: signer.name, title: signer.role } : { name: currentEmployee?.name, title: currentEmployee?.role } })
        parts.push({ kind: 'cover_letter', file_name: 'cover_letter.pdf', bytes: new Uint8Array(doc.output('arraybuffer')) })
      }
      setProgress('Qualification statement…')
      const certs = certificateItems(company, dueAt)
      const qdoc = generateQualificationsPdf({ company, businessUnit, profile: profile || {}, certs })
      parts.push({ kind: 'qualifications', file_name: 'qualifications.pdf', bytes: new Uint8Array(qdoc.output('arraybuffer')) })

      // The buyer's own forms: fillable PDFs in the package get Benny's field map; the rest are a person's job.
      const docs = (Array.isArray(opp?.documents) ? opp.documents : []).filter((d) => d.storage_path && /\.pdf$/i.test(d.name || d.storage_path)).slice(0, 4)
      if (!docs.length && intake.source_document?.path) docs.push({ name: intake.source_document.name, bucket: intake.source_document.bucket, storage_path: intake.source_document.path })
      for (const d of docs) {
        try {
          setProgress(`Reading ${d.name || 'the package'} for fillable forms…`)
          const bytes = await signedBytes(d.bucket, d.storage_path)
          const fields = await extractFormFields(bytes)
          if (!fields.length) continue
          setProgress(`Benny is filling ${fields.length} fields on ${d.name || 'the form'}…`)
          const map = await callAi('map_fields', { fields: fields.map((f) => ({ name: f.name, type: f.type, value: f.value })) })
          const filled = await fillPdfForm(bytes, map.values || {})
          const base = String(d.name || 'form.pdf').replace(/\.pdf$/i, '')
          parts.push({ kind: 'buyer_form', file_name: `${base}_filled.pdf`, bytes: filled, note: `${Object.keys(map.values || {}).length} of ${fields.length} fields filled${map.unsure?.length ? `; left for you: ${map.unsure.slice(0, 6).join(', ')}${map.unsure.length > 6 ? '…' : ''}` : ''}` })
          if (map.unsure?.length) notes.push(`${d.name || 'form'}: ${map.unsure.length} field${map.unsure.length === 1 ? '' : 's'} left blank for you`)
        } catch (e) { notes.push(`${d.name || 'form'}: ${e.message}`) }
      }
      for (const c of certs) {
        if (!c.present) continue
        try {
          setProgress(`${c.label}…`)
          const bytes = await certificateBytes(c.url)
          if (!isPdfBytes(bytes)) { notes.push(`${c.label} is not a PDF — attach it by hand`); continue }
          parts.push({ kind: `cert:${c.key}`, file_name: `${c.key}.pdf`, bytes })
        } catch (e) { notes.push(`${c.label}: ${e.message}`) }
      }

      setProgress('Merging into one PDF…')
      const ordered = sortPacket(parts)
      const merged = await mergePdfParts(ordered.map((p) => ({ bytes: p.bytes, label: p.file_name })))
      const ts = Date.now()
      const folder = `bids/${companyId}/packet/${estimate.id}`
      const manifest = []
      for (const p of ordered) {
        const path = `${folder}/${ts}_${p.file_name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, p.bytes, { contentType: 'application/pdf', upsert: true })
        if (error) throw new Error(`Upload failed: ${error.message}`)
        manifest.push({ kind: p.kind, file_name: p.file_name, bucket: BUCKET, storage_path: path, bytes: p.bytes.length, note: p.note || null })
      }
      const combinedPath = `${folder}/${ts}_${ref}_packet.pdf`
      const { error: cErr } = await supabase.storage.from(BUCKET).upload(combinedPath, merged.bytes, { contentType: 'application/pdf', upsert: true })
      if (cErr) throw new Error(`Upload failed: ${cErr.message}`)
      manifest.push({ kind: 'combined', file_name: `${ref}_packet.pdf`, bucket: BUCKET, storage_path: combinedPath, bytes: merged.bytes.length, pages: merged.pageCount, note: null })
      const builtAt = new Date().toISOString()
      const checklist = autoDoneChecklist(sub.checklist, { company, dueAt, packet: manifest, coverLetter })
      await saveSub({ packet: manifest, packet_built_at: builtAt, checklist, cover_letter: coverLetter })
      toast.success(`Packet built: ${manifest.length - 1} files, ${merged.pageCount} pages in one PDF${notes.length ? ` — ${notes.length} note${notes.length === 1 ? '' : 's'} below` : ''}`)
      if (notes.length) setProgress(notes.join(' · ')); else setProgress('')
    } catch (e) {
      toast.error(e.message); setProgress('')
    }
    setBuilding(false)
  }

  const openFile = async (p) => {
    const { data, error } = await supabase.storage.from(p.bucket || BUCKET).createSignedUrl(p.storage_path, 600)
    if (error || !data?.signedUrl) { toast.error('Could not open the file'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const readiness = useMemo(() => submitReadiness({ documentType: estimate?.document_type || 'bid', lines: lineItems, checklist: sub?.checklist || [], company, dueAt, blockers: opp?.blockers || [] }), [estimate, lineItems, sub, company, dueAt, opp])

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }
  const small = { fontSize: '12px', color: theme.textMuted }
  const btn = (primary) => ({ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', minHeight: '36px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: primary ? 'none' : `1px solid ${theme.border}`, backgroundColor: primary ? theme.accent : 'transparent', color: primary ? '#fff' : theme.accent })

  if (loading) return <div style={card}><div style={small}>Loading the packet…</div></div>
  const checklist = sub?.checklist || []
  const packet = sortPacket((sub?.packet || []).filter((p) => p.kind !== 'combined'))
  const combined = (sub?.packet || []).find((p) => p.kind === 'combined')

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <ClipboardList size={18} style={{ color: theme.accent }} />
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0, flex: 1 }}>Bid packet</h3>
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: readiness.ready ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.15)', color: readiness.ready ? '#166534' : '#854F0B' }}>{readiness.ready ? 'Ready to submit' : `${readiness.reasons.length} to go`}</span>
      </div>

      {(opp || intake.buyer) && (
        <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '10px', lineHeight: 1.5 }}>
          <strong style={{ color: theme.text }}>{opp?.solicitation_number || intake.bid_number}</strong>{(opp?.solicitation_number || intake.bid_number) ? ' — ' : ''}{opp?.buyer || intake.buyer}
          {dueAt && <div>Due {new Date(dueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{readiness.inMargin ? <span style={{ color: '#b91c1c', fontWeight: 600 }}> · inside the margin</span> : ''}</div>}
          {(sub?.method || opp?.submit_method) && <div>Submit by <strong>{sub?.method || opp?.submit_method}</strong>{opp?.submit_to?.email ? ` to ${opp.submit_to.email}` : opp?.submit_to?.portal_url ? ' on the portal' : ''}</div>}
          {opp?.url && <a href={opp.url} target="_blank" rel="noreferrer" style={{ color: theme.accent, fontSize: '12px' }}>Open the notice <ExternalLink size={11} /></a>}
        </div>
      )}

      {/* Checklist */}
      <div style={{ ...small, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>What the buyer asked for</div>
      {checklist.length === 0 ? <div style={small}>No checklist — Benny reads one from the package when he builds the bid.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
          {checklist.map((r) => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 4px', borderBottom: `1px solid ${theme.border}`, opacity: r.waived_reason ? 0.6 : 1 }}>
              <button type="button" onClick={() => tick(r)} title={r.done ? `Done by ${r.done_by || 'the packet'} — click to undo` : 'Mark done'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: r.done ? '#16a34a' : theme.textMuted, flexShrink: 0, minHeight: '24px' }}>
                {r.done ? <CheckCircle size={18} /> : r.waived_reason ? <MinusCircle size={18} /> : <Circle size={18} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: theme.text, textDecoration: r.waived_reason ? 'line-through' : 'none' }}>{r.item}{r.page ? <span style={small}> · p.{r.page}</span> : null}{!r.required && <span style={small}> · optional</span>}</div>
                {r.done && <div style={small}>done{r.done_by === 'packet' ? ' by the packet' : r.done_by ? ` by ${r.done_by}` : ''}{r.done_at ? ` ${new Date(r.done_at).toLocaleDateString()}` : ''}</div>}
                {r.waived_reason && <div style={small}>does not apply: {r.waived_reason}</div>}
              </div>
              {!r.done && <button type="button" onClick={() => waive(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: theme.textMuted, textDecoration: 'underline', padding: 0 }}>{r.waived_reason ? 'applies after all' : 'n/a'}</button>}
            </div>
          ))}
        </div>
      )}

      {/* Cover letter */}
      <div style={{ ...small, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Cover letter</div>
      <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} onBlur={() => { if (sub && coverLetter !== (sub.cover_letter || '')) saveSub({ cover_letter: coverLetter }) }} placeholder="Benny can draft this from your profile and the notice. Read it before the packet goes anywhere." rows={coverLetter ? 8 : 3} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontSize: '13px', lineHeight: 1.5, color: theme.text, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', resize: 'vertical', marginBottom: '8px' }} />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button type="button" onClick={draftLetter} disabled={drafting} style={{ ...btn(false), opacity: drafting ? 0.6 : 1 }}><Sparkles size={14} /> {drafting ? 'Drafting…' : coverLetter ? 'Redraft with Benny' : 'Draft with Benny'}</button>
      </div>

      {/* Packet */}
      <div style={{ ...small, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>The packet</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
        <button type="button" onClick={buildPacket} disabled={building} style={{ ...btn(true), opacity: building ? 0.6 : 1 }}><FileText size={14} /> {building ? 'Building…' : sub?.packet_built_at ? 'Rebuild the packet' : 'Build the packet'}</button>
        {combined && <button type="button" onClick={() => openFile(combined)} style={btn(false)}><Download size={14} /> One PDF ({combined.pages} pp)</button>}
        {sub?.packet_built_at && <span style={small}>built {new Date(sub.packet_built_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
      </div>
      {progress && <div style={{ ...small, marginBottom: '8px' }}>{progress}</div>}
      {packet.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
          {packet.map((p) => (
            <button key={p.storage_path} type="button" onClick={() => openFile(p)} style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', padding: '6px 8px', minHeight: '32px', border: `1px solid ${theme.border}`, borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', color: theme.text, fontSize: '12px' }}>
              <FileText size={13} style={{ color: theme.accent, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file_name}{p.note ? <span style={small}> — {p.note}</span> : null}</span>
              <span style={small}>{Math.round((p.bytes || 0) / 1024)} KB</span>
            </button>
          ))}
        </div>
      )}

      {/* Readiness */}
      {readiness.ready ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#166534', fontSize: '13px' }}>
          <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>Everything the buyer asked for is in the packet and every price stands behind a source. Sending from the app arrives with the next phase; until then, submit the files above the way the notice says.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(234,179,8,0.12)', color: '#854F0B', fontSize: '13px' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>Before this bid can go</div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>{readiness.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}
      {!isMobile && <div style={{ ...small, marginTop: '8px' }}>Benny fills fillable forms from your profile and leaves anything he is not sure of blank. Signatures, notarization and bid bonds are always yours.</div>}
    </div>
  )
}
