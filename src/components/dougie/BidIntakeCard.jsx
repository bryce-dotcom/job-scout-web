import { useState } from 'react'
import { FileSearch, Upload, CheckCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { toast } from '../../lib/toast'

// Dougie reads the buyer's bid package and builds the bid.
//
// One card, two homes: Dougie's own page (mode 'create' — pick who it is
// for, drop the package, get a bid) and an empty draft on the estimate page
// (mode 'fill' — the bid already exists, Dougie fills its lines). The upload
// goes straight to storage from the browser; the edge function reads it from
// there, so a 20-page PDF never rides inside a JSON body.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'

export default function BidIntakeCard({ theme, mode = 'create', quote = null, onDone, compact = false }) {
  const companyId = useStore((s) => s.companyId)
  const leads = useStore((s) => s.leads) || []
  const customers = useStore((s) => s.customers) || []
  const fetchQuotes = useStore((s) => s.fetchQuotes)

  const [file, setFile] = useState(null)
  const [who, setWho] = useState('')          // "lead:123" | "customer:45"
  const [stage, setStage] = useState(null)    // uploading | reading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const run = async () => {
    if (!file) { toast.error('Choose the bid package first — a PDF or a photo of the bid form.'); return }
    if (mode === 'create' && !who) { toast.error('Who is this bid for? Pick the lead or customer.'); return }
    setError(null); setResult(null)
    try {
      setStage('uploading')
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `bids/${companyId}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('project-documents').upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      setStage('reading')
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      const [kind, id] = who.split(':')
      const res = await fetch(`${SUPABASE_URL}/functions/v1/dougie-bid-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ANON_KEY}`, apikey: ANON_KEY },
        body: JSON.stringify({
          company_id: companyId, mode, quote_id: quote?.id || null,
          storage_path: path, storage_bucket: 'project-documents', file_name: file.name, media_type: file.type || 'application/pdf',
          lead_id: mode === 'create' && kind === 'lead' ? Number(id) : (quote?.lead_id || null),
          customer_id: mode === 'create' && kind === 'customer' ? Number(id) : (quote?.customer_id || null),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `Dougie could not build the bid (${res.status})`)
      setResult(data); setStage('done')
      await fetchQuotes?.()
      toast.success(`Dougie built the bid: ${data.lines} items, ${data.unverified} to verify`)
      onDone?.(data.quote_id, data)
    } catch (e) {
      setError(e.message); setStage('error')
    }
  }

  const busy = stage === 'uploading' || stage === 'reading'
  const box = { border: `1px dashed ${file ? theme.accent : theme.border}`, borderRadius: '10px', padding: compact ? '12px' : '18px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', backgroundColor: file ? theme.accentBg : 'transparent' }
  const select = { width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, minHeight: '44px' }

  return (
    <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: compact ? '14px' : '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileSearch size={18} style={{ color: '#a855f7' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>{mode === 'fill' ? 'Let Dougie build this bid from the buyer\'s package' : 'Dougie reads the bid package'}</div>
          <div style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.4 }}>
            Drop in the invitation to bid. Dougie reads the schedule of items, matches each to your catalog — exact, an equivalent with his reasoning, or flagged to source — prices it, and builds the bid in the buyer's format. Anything he had to source lands redlined until you verify it with a link.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
        {mode === 'create' && (
          <select value={who} onChange={(e) => setWho(e.target.value)} disabled={busy} style={select}>
            <option value="">Who is this bid for?</option>
            {leads.length > 0 && <optgroup label="Leads">{leads.map((l) => <option key={`l${l.id}`} value={`lead:${l.id}`}>{l.business_name || l.customer_name}{l.business_name && l.customer_name && l.business_name !== l.customer_name ? ` — ${l.customer_name}` : ''}</option>)}</optgroup>}
            {customers.length > 0 && <optgroup label="Customers">{customers.map((c) => <option key={`c${c.id}`} value={`customer:${c.id}`}>{c.business_name || c.name}{c.business_name && c.name && c.business_name !== c.name ? ` — ${c.name}` : ''}</option>)}</optgroup>}
          </select>
        )}

        <label style={box}>
          <input type="file" accept={ACCEPT} disabled={busy} style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Upload size={18} style={{ color: theme.accent, marginBottom: '4px' }} />
          <div style={{ fontSize: '13px', color: theme.text, fontWeight: 500 }}>{file ? file.name : 'Choose the bid package (PDF, or a photo of the bid form)'}</div>
          {file && <div style={{ fontSize: '11px', color: theme.textMuted }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>}
        </label>

        <button onClick={run} disabled={busy || !file} style={{ padding: '11px 16px', minHeight: '44px', borderRadius: '8px', border: 'none', backgroundColor: '#a855f7', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: busy || !file ? 'not-allowed' : 'pointer', opacity: busy || !file ? 0.6 : 1 }}>
          {stage === 'uploading' ? 'Uploading…' : stage === 'reading' ? 'Dougie is reading and pricing… (about a minute)' : 'Build the bid'}
        </button>

        {stage === 'done' && result && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#166534', fontSize: '13px' }}>
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>{result.read?.bid_number ? `${result.read.bid_number} — ` : ''}{result.read?.title || 'Bid built'}</strong>
              <div>{result.lines} items · {result.counts?.exact || 0} exact · {result.counts?.equivalent || 0} equivalent · {result.counts?.must_source || 0} to source{result.read?.due_at ? ` · due ${new Date(result.read.due_at).toLocaleDateString()}` : ''}</div>
            </div>
          </div>
        )}
        {stage === 'error' && error && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.08)', color: '#b91c1c', fontSize: '13px' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>{error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
