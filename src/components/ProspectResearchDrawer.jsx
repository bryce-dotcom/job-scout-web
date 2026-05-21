// ProspectResearchDrawer
// =====================================================================
// AI-powered prospect researcher. The setter types what they want in
// plain English ("warehouses in Salt Lake County over 50 employees",
// "auto repair shops in Northern Utah", "manufacturing plants near
// Lehi") and Claude does the live web research, returning a list of
// real businesses with citations.
//
// Mobile-first: full-screen drawer on phone, side panel on desktop.
// Big tap targets, sticky bottom action bar with the selection count
// and Import button.
//
// Flow:
//   1. Search box (NL query) → submit → 5-15 candidates
//   2. Tap a card → opens enrich modal that fills email + phone +
//      LinkedIn + decision-maker
//   3. Multi-select → "Add N to leads" sticky bottom bar →
//      assignee dropdown → import
// =====================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, X, ExternalLink, Sparkles, MapPin, Users, Briefcase, CheckCircle2, Loader2, UserPlus, Zap, AlertCircle } from 'lucide-react'

export default function ProspectResearchDrawer({ companyId, employees = [], onClose, onImported, theme, isMobile }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [enriching, setEnriching] = useState({}) // candidate_id → bool
  const [enrichments, setEnrichments] = useState({})  // candidate_id → enriched data
  const [importing, setImporting] = useState(false)
  const [assigneeId, setAssigneeId] = useState('')
  // Tier + monthly quota state. Loaded on mount via usage_status action.
  // Updated automatically from any search/enrich response. When the
  // server returns 402 we surface the upgrade modal instead of a banner.
  const [tier, setTier] = useState('free')
  const [quota, setQuota] = useState(null)  // { searches, enrichments }
  const [usage, setUsage] = useState(null)  // { searches, enrichments }
  const [blocked, setBlocked] = useState(null)  // { kind, used, limit, tier, message }

  const call = async (action, body) => {
    const { data: session } = await supabase.auth.getSession()
    const tok = session?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prospect-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, company_id: companyId, ...body }),
    })
    const data = await res.json()
    // 402 = quota exhausted. Surface as a structured block, not an error.
    if (res.status === 402 && data?.upgrade_required) {
      setBlocked(data)
      throw new Error(data.message || 'Monthly quota reached — upgrade to continue')
    }
    if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
    // Successful response often carries updated usage — keep state in sync
    if (data.usage) setUsage(data.usage)
    if (data.quota) setQuota(data.quota)
    if (data.tier)  setTier(data.tier)
    return data
  }

  // Load current period usage + tier on mount so the drawer can show
  // the quota bar before the user does anything.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await call('usage_status', {})
        if (cancelled) return
        setTier(data.tier)
        setQuota(data.quota)
        setUsage(data.usage)
      } catch (_) { /* best-effort */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSearch = async (e) => {
    e?.preventDefault?.()
    if (!query.trim() || searching) return
    setSearching(true); setError(''); setResults([]); setSelectedIds(new Set()); setEnrichments({})
    try {
      const data = await call('search', { query: query.trim() })
      setResults(data.prospects || [])
      if (!data.prospects?.length) setError('No matches found. Try a more specific query.')
    } catch (err) {
      setError(err.message)
    } finally { setSearching(false) }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const enrich = async (candidateId) => {
    if (enriching[candidateId] || enrichments[candidateId]) return
    setEnriching(prev => ({ ...prev, [candidateId]: true }))
    try {
      const data = await call('enrich', { candidate_id: candidateId })
      setEnrichments(prev => ({ ...prev, [candidateId]: data.enrichment }))
    } catch (err) {
      alert('Enrichment failed: ' + err.message)
    } finally {
      setEnriching(prev => ({ ...prev, [candidateId]: false }))
    }
  }

  const importSelected = async () => {
    if (selectedIds.size === 0 || importing) return
    if (!window.confirm(`Add ${selectedIds.size} prospect${selectedIds.size === 1 ? '' : 's'} to the lead pipeline?`)) return
    setImporting(true)
    try {
      const data = await call('import', {
        candidate_ids: Array.from(selectedIds),
        salesperson_id: assigneeId ? Number(assigneeId) : undefined,
      })
      alert(`Imported ${data.imported} new lead${data.imported === 1 ? '' : 's'}` +
        (data.already_imported > 0 ? ` (${data.already_imported} already in pipeline)` : ''))
      onImported?.()
      onClose?.()
    } catch (err) {
      alert('Import failed: ' + err.message)
    } finally { setImporting(false) }
  }

  // ── Styles ─────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 90,
    display: 'flex',
    justifyContent: isMobile ? 'stretch' : 'flex-end',
  }
  const panel = {
    width: isMobile ? '100%' : 540,
    height: '100dvh',
    backgroundColor: theme.bg,
    display: 'flex', flexDirection: 'column',
    boxShadow: isMobile ? 'none' : '-4px 0 12px rgba(0,0,0,0.1)',
  }
  const header = {
    flexShrink: 0,
    padding: '14px 16px',
    backgroundColor: theme.bgCard,
    borderBottom: `1px solid ${theme.border}`,
    display: 'flex', alignItems: 'center', gap: 10,
  }
  const inp = {
    width: '100%', padding: '12px 14px',
    border: `1px solid ${theme.border}`, borderRadius: 10,
    fontSize: 16, color: theme.text, WebkitTextFillColor: theme.text,
    backgroundColor: '#fff', boxSizing: 'border-box', outline: 'none',
  }
  const btn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '12px 16px', minHeight: 44,
    backgroundColor: theme.accent, color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <Sparkles size={20} color="#7c3aed" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Find Prospects</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>
              AI-researched · live web search
              {tier && (
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 8,
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  backgroundColor: tier === 'free' ? 'rgba(156,163,175,0.18)' : tier === 'pro' ? 'rgba(124,58,237,0.15)' : 'rgba(234,179,8,0.15)',
                  color:           tier === 'free' ? '#6b7280'                : tier === 'pro' ? '#7c3aed'                 : '#a16207',
                }}>{tier === 'field_boss' ? '⭐ Field Boss' : tier}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 8, minWidth: 36, minHeight: 36,
              background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quota strip — shows how much of this month's plan is used */}
        {quota && usage && (() => {
          const sPct = Math.min(100, Math.round((usage.searches / quota.searches) * 100))
          const ePct = Math.min(100, Math.round((usage.enrichments / quota.enrichments) * 100))
          const high = sPct >= 70 || ePct >= 70
          const tone = high ? '#a16207' : theme.textMuted
          return (
            <div style={{
              flexShrink: 0,
              padding: '8px 16px',
              backgroundColor: high ? 'rgba(234,179,8,0.08)' : theme.bgCard,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: 11, color: tone,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>Searches:</span>
                <strong>{usage.searches}/{quota.searches}</strong>
                <div style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${sPct}%`, height: '100%', backgroundColor: sPct >= 100 ? '#dc2626' : sPct >= 70 ? '#eab308' : '#7c3aed' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>Enrichments:</span>
                <strong>{usage.enrichments}/{quota.enrichments}</strong>
                <div style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${ePct}%`, height: '100%', backgroundColor: ePct >= 100 ? '#dc2626' : ePct >= 70 ? '#eab308' : '#7c3aed' }} />
                </div>
              </div>
              {high && tier === 'free' && (
                <button
                  onClick={() => { onClose?.(); navigate('/settings#subscription') }}
                  style={{
                    marginLeft: 'auto', padding: '4px 10px',
                    backgroundColor: '#7c3aed', color: '#fff',
                    border: 'none', borderRadius: 5,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Zap size={11} /> Upgrade
                </button>
              )}
            </div>
          )
        })()}

        {/* Search bar */}
        <form onSubmit={runSearch} style={{
          flexShrink: 0,
          padding: '14px 16px',
          backgroundColor: theme.bgCard,
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="warehouses in Salt Lake County over 50 employees"
              style={{ ...inp, paddingLeft: 36 }}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
            <strong>Try:</strong> "auto repair shops in Northern Utah", "restaurants with 20+ locations in Idaho", "manufacturing plants near Lehi with old lighting"
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            style={{
              ...btn, width: '100%',
              backgroundColor: searching ? theme.border : '#7c3aed',
              opacity: (searching || !query.trim()) ? 0.6 : 1,
              cursor: (searching || !query.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {searching ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Researching… (10-30s)</> : <><Sparkles size={16} /> Find prospects</>}
          </button>
        </form>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 100 }}>
          {error && (
            <div style={{
              padding: 12, marginBottom: 12,
              backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: 8, color: '#dc2626', fontSize: 13,
            }}>{error}</div>
          )}

          {!searching && results.length === 0 && !error && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
              <Sparkles size={32} style={{ color: '#7c3aed', opacity: 0.5, marginBottom: 12 }} />
              <div style={{ fontWeight: 600, color: theme.text, marginBottom: 4 }}>Type what you're hunting for</div>
              <div style={{ fontSize: 12 }}>
                Be specific. The more detail you give, the better results you'll get.
              </div>
            </div>
          )}

          {results.map((p) => {
            const selected = selectedIds.has(p.candidate_id)
            const enriched = enrichments[p.candidate_id]
            const isEnriching = enriching[p.candidate_id]
            return (
              <div
                key={p.candidate_id}
                style={{
                  marginBottom: 10, padding: 12,
                  backgroundColor: theme.bgCard,
                  border: `2px solid ${selected ? theme.accent : theme.border}`,
                  borderRadius: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(p.candidate_id)}
                    style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.company_name || 'Unknown'}
                      </div>
                      {p.confidence && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 10,
                          backgroundColor: p.confidence === 'high' ? 'rgba(34,197,94,0.15)' : p.confidence === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(156,163,175,0.15)',
                          color: p.confidence === 'high' ? '#16a34a' : p.confidence === 'medium' ? '#a16207' : '#6b7280',
                          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>{p.confidence}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
                      {(p.city || p.state) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{p.city}{p.city && p.state ? ', ' : ''}{p.state}</span>}
                      {p.industry && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Briefcase size={11} />{p.industry}</span>}
                      {p.estimated_size && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Users size={11} />{p.estimated_size}</span>}
                    </div>
                    {p.why_it_matches && (
                      <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6, lineHeight: 1.4 }}>
                        {p.why_it_matches}
                      </div>
                    )}

                    {/* Initial contact (from search step) */}
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>
                      {p.phone && <div>📞 {p.phone}</div>}
                      {p.website && <div><a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent, textDecoration: 'none' }}>🌐 {p.website.replace(/^https?:\/\//, '').slice(0, 40)}</a></div>}
                    </div>

                    {/* Enrichment result */}
                    {enriched && (
                      <div style={{
                        marginTop: 8, padding: 10,
                        backgroundColor: 'rgba(124,58,237,0.05)',
                        border: '1px solid rgba(124,58,237,0.20)',
                        borderRadius: 6, fontSize: 12, color: theme.text,
                      }}>
                        {enriched.decision_maker_name && (
                          <div style={{ marginBottom: 6 }}>
                            <strong>{enriched.decision_maker_name}</strong>
                            {enriched.decision_maker_title ? ` — ${enriched.decision_maker_title}` : ''}
                          </div>
                        )}

                        {/* Mobile / cell — most useful for cold outreach. Star it. */}
                        {enriched.mobile_phone && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 8px', marginBottom: 4,
                            backgroundColor: 'rgba(34,197,94,0.10)',
                            border: '1px solid rgba(34,197,94,0.30)',
                            borderRadius: 5,
                          }}>
                            <span style={{ fontSize: 14 }}>📱</span>
                            <a href={`tel:${enriched.mobile_phone}`} style={{ color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>
                              {enriched.mobile_phone}
                            </a>
                            <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, padding: '1px 5px', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 3 }}>
                              MOBILE · {enriched.mobile_phone_confidence || 'found'}
                            </span>
                            <a href={`sms:${enriched.mobile_phone}`} style={{ marginLeft: 'auto', fontSize: 10, color: '#16a34a', textDecoration: 'none', border: '1px solid #16a34a', padding: '2px 6px', borderRadius: 3 }}>
                              Text
                            </a>
                          </div>
                        )}
                        {enriched.mobile_phone_confidence === 'not_found' && !enriched.mobile_phone && (
                          <div style={{ fontSize: 11, color: theme.textMuted, fontStyle: 'italic', marginBottom: 4 }}>
                            📱 Mobile number not publicly listed — try LinkedIn DM
                          </div>
                        )}

                        {/* Business phone */}
                        {(enriched.business_phone || enriched.phone) && (enriched.business_phone || enriched.phone) !== enriched.mobile_phone && (
                          <div style={{ marginBottom: 3 }}>
                            ☎ <a href={`tel:${enriched.business_phone || enriched.phone}`} style={{ color: theme.accent, textDecoration: 'none' }}>
                              {enriched.business_phone || enriched.phone}
                            </a>
                            <span style={{ fontSize: 10, color: theme.textMuted, marginLeft: 4 }}>(business)</span>
                          </div>
                        )}

                        {/* Email — work first, personal as a secondary line */}
                        {enriched.email && (
                          <div style={{ marginBottom: 3 }}>
                            ✉ <a href={`mailto:${enriched.email}`} style={{ color: theme.accent, textDecoration: 'none' }}>{enriched.email}</a>
                            {enriched.email_confidence && (
                              <span style={{ fontSize: 10, color: theme.textMuted, marginLeft: 4 }}>({enriched.email_confidence})</span>
                            )}
                          </div>
                        )}
                        {enriched.personal_email && enriched.personal_email !== enriched.email && (
                          <div style={{ marginBottom: 3 }}>
                            ✉ <a href={`mailto:${enriched.personal_email}`} style={{ color: theme.accent, textDecoration: 'none' }}>{enriched.personal_email}</a>
                            <span style={{ fontSize: 10, color: theme.textMuted, marginLeft: 4 }}>(personal)</span>
                          </div>
                        )}

                        {enriched.linkedin_url && (
                          <div style={{ marginBottom: 3 }}>
                            <a href={enriched.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent, textDecoration: 'none' }}>
                              LinkedIn ↗
                            </a>
                          </div>
                        )}

                        {enriched.notes && (
                          <div style={{ marginTop: 6, fontStyle: 'italic', color: theme.textMuted, lineHeight: 1.4 }}>{enriched.notes}</div>
                        )}
                      </div>
                    )}

                    {/* Action row */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {!enriched && (
                        <button
                          onClick={() => enrich(p.candidate_id)}
                          disabled={isEnriching}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '6px 10px', minHeight: 32,
                            backgroundColor: '#7c3aed', color: '#fff',
                            border: 'none', borderRadius: 6,
                            fontSize: 12, fontWeight: 600,
                            cursor: isEnriching ? 'not-allowed' : 'pointer', opacity: isEnriching ? 0.6 : 1,
                          }}
                        >
                          {isEnriching ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Finding contact…</> : <><Sparkles size={12} /> Find decision-maker</>}
                        </button>
                      )}
                      {(p.source_urls || []).slice(0, 2).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '6px 10px', fontSize: 11, color: theme.textMuted,
                            border: `1px solid ${theme.border}`, borderRadius: 6,
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={11} /> source {i + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Sticky bottom action bar (selection + import) */}
        {selectedIds.size > 0 && (
          <div style={{
            flexShrink: 0,
            padding: '12px 16px',
            backgroundColor: theme.bgCard,
            borderTop: `1px solid ${theme.border}`,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 8 }}>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px', minHeight: 44,
                  border: `1px solid ${theme.border}`, borderRadius: 8,
                  fontSize: 14, color: theme.text, backgroundColor: '#fff',
                }}
              >
                <option value="">Assign to me</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <button
                onClick={importSelected}
                disabled={importing}
                style={{
                  ...btn,
                  flex: isMobile ? 'none' : 1,
                  backgroundColor: '#16a34a',
                  cursor: importing ? 'not-allowed' : 'pointer',
                  opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</> : <><UserPlus size={16} /> Add {selectedIds.size} to leads</>}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Upgrade modal — pops when the server returns 402 / limit_reached */}
      {blocked && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setBlocked(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{
            maxWidth: 480, width: '100%',
            backgroundColor: theme.bgCard, borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 20px',
              background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
              color: '#fff',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Zap size={24} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Monthly limit reached</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>You're on the {blocked.tier} plan</div>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{
                padding: '10px 12px', marginBottom: 14,
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8, fontSize: 13, color: '#dc2626',
              }}>
                <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                You've used {blocked.used} / {blocked.limit} {blocked.kind === 'search' ? 'searches' : 'enrichments'} this month. Limit resets on the 1st.
              </div>

              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <PlanCard
                  name="Prospecting Pro"
                  price="$49/mo"
                  features={['50 searches per month', '200 enrichments per month', 'Tap-to-text mobile reveal', 'All your seats share the pool']}
                  highlight={true}
                />
                <div style={{
                  padding: 12,
                  backgroundColor: 'rgba(234,179,8,0.08)',
                  border: '1px solid rgba(234,179,8,0.30)',
                  borderRadius: 10,
                  fontSize: 12, color: theme.textSecondary, lineHeight: 1.5,
                }}>
                  ⭐ <strong style={{ color: '#a16207' }}>On JobScout Field Boss?</strong> Prospecting is bundled in free for life — no upgrade needed.
                </div>
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted, textAlign: 'center', marginBottom: 14 }}>
                Save 20% with annual billing · Cancel anytime
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setBlocked(null)}
                  style={{
                    flex: 1, padding: '12px', minHeight: 44,
                    background: 'transparent', color: theme.textSecondary,
                    border: `1px solid ${theme.border}`, borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Maybe later
                </button>
                <button
                  onClick={() => { setBlocked(null); onClose?.(); navigate('/settings#subscription') }}
                  style={{
                    flex: 2, padding: '12px', minHeight: 44,
                    background: '#7c3aed', color: '#fff',
                    border: 'none', borderRadius: 8,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  See plans →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function PlanCard({ name, price, features, highlight }) {
  return (
    <div style={{
      padding: 14,
      backgroundColor: highlight ? 'rgba(124,58,237,0.06)' : '#fafafa',
      border: `2px solid ${highlight ? '#7c3aed' : '#e5e7eb'}`,
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{name}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed' }}>{price}</div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: '#4b5563' }}>
        {features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <CheckCircle2 size={11} color="#16a34a" /> {f}
          </li>
        ))}
      </ul>
    </div>
  )
}
