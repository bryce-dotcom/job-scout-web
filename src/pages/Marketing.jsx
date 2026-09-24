import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { toast } from '../lib/toast'
import { getAccessLevel, ACCESS_LEVELS } from '../lib/accessControl'
import {
  BRAND_KIT_KEY, AYRSHARE_KEY, MEDIA_BUCKET, PLATFORMS, PLATFORM_BY_ID,
  emptyBrandKit, deriveBrandKitFromEos, setupProgress, platformProblems, capturePath, composeCaption,
} from '../lib/marketing'
import {
  Megaphone, Inbox, ListChecks, Palette, Link2, Mail, Sparkles, Upload, Camera, Check, X,
  Send, Clock, ExternalLink, RefreshCw, ChevronRight, CircleCheck, Circle, Trash2, Pencil,
  Image as ImageIcon, AlertTriangle, Archive, CalendarClock, Hand, Copy, Download,
} from 'lucide-react'

// Marketing — step 1 of the Sales Flow. Everything a company does to be found
// lives here: the brand kit (derived from EOS, edited in place), the connected
// social accounts (Ayrshare is the publisher), the inbox of photos the crew
// shared from the field, and the queue of posts the AI drafted from them.
//
// The setup walkthrough is ON THIS PAGE, at the top, until all three steps are
// done. Nothing about marketing is configured from Settings.
//
// Rules shared with Field Scout and the two edge functions live in
// src/lib/marketing.js; this file is layout and data plumbing.

const MKT = '#e11d48'
const MKT_BG = 'rgba(225,29,72,0.10)'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgHover: '#eef2eb', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const STATUS_STYLE = {
  draft:     { label: 'Draft',     color: '#7d8a7f' },
  approved:  { label: 'Approved',  color: '#3b82f6' },
  scheduled: { label: 'Scheduled', color: '#a855f7' },
  posted:    { label: 'Posted',    color: '#22c55e' },
  failed:    { label: 'Failed',    color: '#ef4444' },
  archived:  { label: 'Archived',  color: '#7d8a7f' },
}

const parseJson = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return fallback }
}
const linesToList = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)
const listToLines = (xs) => (Array.isArray(xs) ? xs.join('\n') : '')
const fmtWhen = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Marketing() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const employees = useStore((s) => s.employees)
  const currentEmployee = useMemo(() => (employees || []).find((e) => e.email === user?.email) || null, [employees, user])
  const isManager = getAccessLevel(currentEmployee) >= ACCESS_LEVELS.MANAGER

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('queue')
  const [company, setCompany] = useState(null)
  const [eos, setEos] = useState({})
  const [brandKit, setBrandKit] = useState(null)      // null = never saved
  const [ayrshare, setAyrshare] = useState(null)
  const [posts, setPosts] = useState([])
  const [captures, setCaptures] = useState([])
  const [composer, setComposer] = useState(null)      // { post?, captureIds[] }
  const [handPost, setHandPost] = useState(null)      // post being posted by hand
  const [walkthroughHidden, setWalkthroughHidden] = useState(() => {
    try { return localStorage.getItem('mkt_walkthrough_hidden') === '1' } catch { return false }
  })

  const load = useCallback(async () => {
    if (!companyId) return
    const [{ data: settings }, { data: co }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('settings').select('key, value').eq('company_id', companyId)
        .in('key', [BRAND_KIT_KEY, AYRSHARE_KEY, 'eos_core_values', 'eos_core_focus', 'eos_marketing_strategy']),
      supabase.from('companies').select('id, company_name, logo_url, website, phone, city, state, primary_color').eq('id', companyId).maybeSingle(),
      supabase.from('marketing_posts').select('*').eq('company_id', companyId).neq('status', 'archived').order('created_at', { ascending: false }).limit(200),
      supabase.from('marketing_captures').select('*').eq('company_id', companyId).eq('status', 'new').order('created_at', { ascending: false }).limit(200),
    ])
    const get = (k) => (settings || []).find((r) => r.key === k)?.value
    setBrandKit(get(BRAND_KIT_KEY) ? parseJson(get(BRAND_KIT_KEY), null) : null)
    setAyrshare(parseJson(get(AYRSHARE_KEY), null))
    setEos({
      core_values: parseJson(get('eos_core_values'), []),
      core_focus: parseJson(get('eos_core_focus'), {}),
      marketing: parseJson(get('eos_marketing_strategy'), {}),
    })
    setCompany(co || null)
    setPosts(p || [])
    setCaptures(c || [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const saveSetting = useCallback(async (key, value) => {
    const { error } = await supabase.from('settings')
      .upsert({ company_id: companyId, key, value: JSON.stringify(value) }, { onConflict: 'company_id,key' })
    if (error) { toast.error(error.message); return false }
    return true
  }, [companyId])

  const progress = useMemo(() => setupProgress({ brandKit, ayrshare, posts }), [brandKit, ayrshare, posts])
  const linkedPlatforms = useMemo(() => new Set((ayrshare?.accounts || []).map((a) => a.platform)), [ayrshare])

  // ── Brand kit ──────────────────────────────────────────────────────
  const saveBrandKit = async (next) => {
    const kit = { ...emptyBrandKit(), ...(brandKit || {}), ...next, updated_at: new Date().toISOString() }
    setBrandKit(kit)
    await saveSetting(BRAND_KIT_KEY, kit)
  }
  const fillFromEos = async () => {
    const kit = deriveBrandKitFromEos({ eos, company, existing: brandKit })
    await saveBrandKit(kit)
    toast.success('Brand kit filled from your EOS and company profile. Edit anything.')
  }

  // ── Captures (inbox) ───────────────────────────────────────────────
  const uploadRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    let ok = 0
    for (const file of files) {
      try {
        const path = capturePath(companyId, file.name)
        const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
        const { error: dbErr } = await supabase.from('marketing_captures').insert({
          company_id: companyId, employee_id: currentEmployee?.id || null, bucket: MEDIA_BUCKET, path,
          url: pub.publicUrl, media_type: file.type?.startsWith('video/') ? 'video' : 'image',
        })
        if (dbErr) throw dbErr
        ok++
      } catch (err) {
        toast.error(`${file.name}: ${err.message || 'upload failed'}`)
      }
    }
    setUploading(false)
    if (ok) { toast.success(ok === 1 ? 'Photo added to the inbox' : `${ok} photos added`); load() }
  }
  const dismissCapture = async (id) => {
    await supabase.from('marketing_captures').update({ status: 'dismissed' }).eq('id', id).eq('company_id', companyId)
    setCaptures((xs) => xs.filter((c) => c.id !== id))
  }

  // ── Posts ──────────────────────────────────────────────────────────
  // Stable identity: ChannelsTab keys an effect on it.
  const invoke = useCallback(async (fn, body) => {
    const { data, error } = await supabase.functions.invoke(fn, { body })
    if (error) {
      // supabase-js hides the function's JSON on non-2xx; read it back.
      let msg = error.message
      let extra = {}
      try { const j = await error.context?.json(); if (j?.error) msg = j.error; if (j) extra = j } catch { /* keep */ }
      return { ...extra, ok: false, error: msg }
    }
    return data || { ok: false, error: 'No reply' }
  }, [])
  const setPostStatus = async (post, status, extra = {}) => {
    const patch = { status, ...extra }
    if (status === 'approved') { patch.approved_by = currentEmployee?.id || null; patch.approved_at = new Date().toISOString() }
    const { error } = await supabase.from('marketing_posts').update(patch).eq('id', post.id).eq('company_id', companyId)
    if (error) { toast.error(error.message); return }
    load()
  }
  const publishPost = async (post) => {
    const r = await invoke('marketing-publish', { action: 'publish', post_id: post.id })
    if (!r.ok) { toast.error(r.error || 'Publish failed'); load(); return }
    if (r.warning) toast.error(`Posted with a problem: ${r.warning}`)
    else toast.success(r.status === 'scheduled' ? 'Scheduled' : 'Posted')
    load()
  }
  const unschedulePost = async (post) => {
    const r = await invoke('marketing-publish', { action: 'delete', post_id: post.id })
    if (!r.ok) { toast.error(r.error || 'Could not unschedule'); return }
    toast.success('Back in the queue as approved')
    load()
  }

  const tabs = [
    { id: 'queue', label: 'Queue', icon: ListChecks, count: posts.filter((p) => ['draft', 'approved'].includes(p.status)).length },
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: captures.length },
    { id: 'brand', label: 'Brand', icon: Palette },
    { id: 'channels', label: 'Channels', icon: Link2 },
    { id: 'email', label: 'Email', icon: Mail },
  ]

  if (!companyId) return null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '12px 16px 90px' : '20px 24px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: MKT_BG, color: MKT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Megaphone size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: theme.text, fontWeight: 700 }}>Marketing</h1>
          <div style={{ fontSize: 13, color: theme.textMuted }}>Photos from the field become posts in your voice. Approve, then publish everywhere.</div>
        </div>
        <button type="button" onClick={() => setComposer({ captureIds: [] })} style={primaryBtn(MKT)}>
          <Sparkles size={16} /> New post
        </button>
      </div>

      {/* Setup walkthrough: on the page, until done */}
      {!loading && !(progress.complete && walkthroughHidden) && (
        <SetupWalkthrough
          theme={theme} isMobile={isMobile} progress={progress} isManager={isManager}
          onBrand={() => setTab('brand')} onChannels={() => setTab('channels')} onFirstPost={() => setComposer({ captureIds: [] })}
          onHide={() => { try { localStorage.setItem('mkt_walkthrough_hidden', '1') } catch { /* private mode */ } setWalkthroughHidden(true) }}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 12, WebkitOverflowScrolling: 'touch' }}>
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={() => (t.id === 'email' ? navigate('/agents/conrad-connect') : setTab(t.id))} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', minHeight: 40, borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${active ? MKT : theme.border}`, background: active ? MKT_BG : theme.bgCard, color: active ? MKT : theme.textSecondary,
              fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', flexShrink: 0,
            }}>
              <Icon size={15} /> {t.label}
              {t.count > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: active ? MKT : theme.border, color: active ? '#fff' : theme.text, borderRadius: 999, padding: '1px 7px' }}>{t.count}</span>}
              {t.id === 'email' && <ExternalLink size={12} />}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: 14, padding: 24 }}>Loading…</div>
      ) : tab === 'queue' ? (
        <QueueTab theme={theme} isMobile={isMobile} posts={posts} isManager={isManager}
          onEdit={(p) => setComposer({ post: p, captureIds: p.capture_ids || [] })}
          onApprove={(p) => setPostStatus(p, 'approved')} onPublish={publishPost} onUnschedule={unschedulePost}
          onArchive={(p) => setPostStatus(p, 'archived')} onNew={() => setComposer({ captureIds: [] })}
          onHandPost={(p) => setHandPost(p)} />
      ) : tab === 'inbox' ? (
        <InboxTab theme={theme} isMobile={isMobile} captures={captures} uploading={uploading}
          onUploadClick={() => uploadRef.current?.click()} onDismiss={dismissCapture}
          onMakePost={(ids) => setComposer({ captureIds: ids })} />
      ) : tab === 'brand' ? (
        <BrandTab theme={theme} isMobile={isMobile} kit={brandKit} company={company} eos={eos} onSave={saveBrandKit} onFill={fillFromEos} />
      ) : tab === 'channels' ? (
        <ChannelsTab theme={theme} isMobile={isMobile} ayrshare={ayrshare} isManager={isManager} invoke={invoke} onChanged={load} />
      ) : null}

      <input ref={uploadRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleUpload} />

      {handPost && (
        <HandPostSheet
          theme={theme} isMobile={isMobile} post={handPost}
          onClose={() => setHandPost(null)}
          onMarked={async (note) => {
            // Posted with no ayrshare_id = posted by hand. No new column needed;
            // the card reads that combination as "Posted by hand".
            const { error } = await supabase.from('marketing_posts').update({
              status: 'posted', posted_at: new Date().toISOString(), ayrshare_id: null, post_urls: [], error: note || null,
              approved_by: handPost.approved_by || currentEmployee?.id || null, approved_at: handPost.approved_at || new Date().toISOString(),
            }).eq('id', handPost.id).eq('company_id', companyId)
            if (error) { toast.error(error.message); return }
            if (handPost.capture_ids?.length) {
              await supabase.from('marketing_captures').update({ status: 'used', post_id: handPost.id }).eq('company_id', companyId).in('id', handPost.capture_ids)
            }
            toast.success('Marked as posted')
            setHandPost(null)
            load()
          }}
        />
      )}
      {composer && (
        <Composer
          theme={theme} isMobile={isMobile} companyId={companyId} currentEmployee={currentEmployee} isManager={isManager}
          initialPost={composer.post || null} initialCaptureIds={composer.captureIds || []}
          captures={captures} linkedPlatforms={linkedPlatforms} invoke={invoke}
          onClose={() => setComposer(null)} onSaved={() => { setComposer(null); load() }}
          onPublish={publishPost}
        />
      )}
    </div>
  )
}

// ── Setup walkthrough ────────────────────────────────────────────────
function SetupWalkthrough({ theme, isMobile, progress, isManager, onBrand, onChannels, onFirstPost, onHide }) {
  const actions = { brand: onBrand, channels: onChannels, first_post: onFirstPost }
  const hints = {
    brand: 'Pulled from your EOS core values, focus and marketing strategy. Fix anything that sounds wrong; the AI writes in this voice.',
    channels: isManager ? 'Tap Connect on Facebook, Instagram, Google Business or LinkedIn and sign in. Two minutes, no other accounts to create.' : 'A Manager or above connects the accounts. Ask them to open this page.',
    first_post: 'Pick a photo from the inbox, or start blank. The AI drafts it, you approve it, it goes everywhere at once.',
  }
  const next = progress.steps.find((s) => !s.done)
  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${progress.complete ? theme.border : MKT}`, borderRadius: 12, padding: isMobile ? 14 : 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1 }}>
          {progress.complete ? 'Marketing is set up' : `Set up marketing · ${progress.done} of ${progress.total} done`}
        </div>
        {progress.complete && (
          <button type="button" onClick={onHide} style={{ ...ghostBtn(theme), padding: '6px 10px', minHeight: 32 }}>Hide</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        {progress.steps.map((s, i) => {
          const isNext = next?.id === s.id
          return (
            <button key={s.id} type="button" onClick={actions[s.id]} style={{
              textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', minHeight: 44,
              border: `1px solid ${isNext ? MKT : theme.border}`, background: isNext ? MKT_BG : theme.bg,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {s.done ? <CircleCheck size={18} color="#22c55e" /> : <Circle size={18} color={isNext ? MKT : theme.textMuted} />}
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{i + 1}. {s.label}</span>
                <ChevronRight size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
              </div>
              <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.4 }}>{hints[s.id]}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Queue ────────────────────────────────────────────────────────────
function QueueTab({ theme, isMobile, posts, isManager, onEdit, onApprove, onPublish, onUnschedule, onArchive, onNew, onHandPost }) {
  const [filter, setFilter] = useState('open')
  const filtered = posts.filter((p) => {
    if (filter === 'open') return ['draft', 'approved', 'failed'].includes(p.status)
    if (filter === 'scheduled') return p.status === 'scheduled'
    if (filter === 'posted') return p.status === 'posted'
    return true
  })
  const [busy, setBusy] = useState(null)
  const run = async (id, fn) => { setBusy(id); try { await fn() } finally { setBusy(null) } }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['open', 'Needs attention'], ['scheduled', 'Scheduled'], ['posted', 'Posted'], ['all', 'All']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} style={chip(theme, filter === id)}>{label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Empty theme={theme} icon={ListChecks} title={filter === 'open' ? 'Nothing waiting' : 'Nothing here yet'}
          body="Share a photo from Field Scout or upload one to the inbox, then draft a post." action={<button type="button" onClick={onNew} style={primaryBtn(MKT)}><Sparkles size={15} /> New post</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map((p) => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.draft
            const thumb = (p.media_urls || [])[0]
            const urls = Array.isArray(p.post_urls) ? p.post_urls.filter((u) => u?.postUrl) : []
            return (
              <div key={p.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {thumb ? (
                  <img src={thumb} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ height: 60, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}><ImageIcon size={18} /></div>
                )}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.color + '18', borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                    {p.status === 'scheduled' && p.scheduled_for && <span style={{ fontSize: 11, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {fmtWhen(p.scheduled_for)}</span>}
                    {p.status === 'posted' && p.posted_at && <span style={{ fontSize: 11, color: theme.textMuted }}>{fmtWhen(p.posted_at)}{!p.ayrshare_id ? ' · by hand' : ''}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted }}>{(p.platforms || []).map((id) => PLATFORM_BY_ID[id]?.label || id).join(' · ')}</span>
                  </div>
                  <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.45, whiteSpace: 'pre-wrap', maxHeight: 96, overflow: 'hidden' }}>{composeCaption(p.caption, p.hashtags) || <span style={{ color: theme.textMuted }}>No caption yet</span>}</div>
                  {p.error && p.status === 'posted' && !p.ayrshare_id
                    ? <div style={{ fontSize: 12, color: theme.textMuted }}>{p.error}</div>
                    : p.error && <div style={{ fontSize: 12, color: '#ef4444', display: 'flex', gap: 6, alignItems: 'flex-start' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {p.error}</div>}
                  {urls.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {urls.map((u) => <a key={u.platform + u.id} href={u.postUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}><ExternalLink size={12} /> {PLATFORM_BY_ID[u.platform]?.label || u.platform}</a>)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {['draft', 'approved', 'failed'].includes(p.status) && <button type="button" onClick={() => onEdit(p)} style={ghostBtn(theme)}><Pencil size={14} /> Edit</button>}
                    {p.status === 'draft' && <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onApprove(p))} style={ghostBtn(theme)}><Check size={14} /> Approve</button>}
                    {['approved', 'failed'].includes(p.status) && isManager && (
                      <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onPublish(p))} style={primaryBtn(MKT)}>
                        {p.scheduled_for && new Date(p.scheduled_for) > new Date() ? <><CalendarClock size={14} /> Schedule</> : <><Send size={14} /> Publish now</>}
                      </button>
                    )}
                    {['approved', 'failed'].includes(p.status) && (
                      <button type="button" onClick={() => onHandPost(p)} style={ghostBtn(theme)} title="Copy the caption, save the photo, post it yourself, then mark it done here">
                        <Hand size={14} /> Post by hand
                      </button>
                    )}
                    {p.status === 'scheduled' && isManager && <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onUnschedule(p))} style={ghostBtn(theme)}><X size={14} /> Unschedule</button>}
                    {p.status !== 'posted' && p.status !== 'scheduled' && <button type="button" onClick={() => onArchive(p)} style={{ ...ghostBtn(theme), marginLeft: 'auto' }} title="Archive"><Archive size={14} /></button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Inbox ────────────────────────────────────────────────────────────
function InboxTab({ theme, isMobile, captures, uploading, onUploadClick, onDismiss, onMakePost }) {
  const [selected, setSelected] = useState([])
  const toggle = (id) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(-5)))
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onUploadClick} disabled={uploading} style={ghostBtn(theme)}><Upload size={15} /> {uploading ? 'Uploading…' : 'Upload photos'}</button>
        {selected.length > 0 && <button type="button" onClick={() => { onMakePost(selected); setSelected([]) }} style={primaryBtn(MKT)}><Sparkles size={15} /> Make a post from {selected.length}</button>}
        <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 'auto' }}>Crews add photos here from Field Scout with Share to Marketing.</span>
      </div>
      {captures.length === 0 ? (
        <Empty theme={theme} icon={Camera} title="Inbox is empty" body="Photos your crew shares from Field Scout land here. You can also upload straight from your phone." action={<button type="button" onClick={onUploadClick} style={primaryBtn(MKT)}><Upload size={15} /> Upload photos</button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {captures.map((c) => {
            const on = selected.includes(c.id)
            return (
              <div key={c.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `2px solid ${on ? MKT : theme.border}`, background: theme.bgCard }}>
                <button type="button" onClick={() => toggle(c.id)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                  {c.media_type === 'video'
                    ? <video src={c.url} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} muted />
                    : <img src={c.url} alt={c.note || ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />}
                </button>
                <div style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: '50%', background: on ? MKT : 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  {on ? <Check size={14} /> : null}
                </div>
                <button type="button" onClick={() => onDismiss(c.id)} title="Dismiss" style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>
                <div style={{ padding: '6px 8px', fontSize: 11, color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {c.note && <div style={{ color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note}</div>}
                  <div>{fmtWhen(c.created_at)}{c.job_id ? ` · job ${c.job_id}` : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Brand kit ────────────────────────────────────────────────────────
// Local state + onBlur save, per the app's input rule. Defined at module
// level (not inside BrandTab) so a parent re-render does not remount the
// input and drop what someone is typing.
function BrandField({ theme, k, onSave, label, name, multiline, hint, list, placeholder }) {
  const initial = list ? listToLines(k[name]) : (k[name] || '')
  const [v, setV] = useState(initial)
  useEffect(() => { setV(initial) }, [initial])
  const commit = () => {
    const next = list ? linesToList(v) : v
    const same = list ? JSON.stringify(next) === JSON.stringify(k[name] || []) : next === (k[name] || '')
    if (!same) onSave({ [name]: next })
  }
  const Tag = multiline || list ? 'textarea' : 'input'
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>{label}</span>
      <Tag value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={placeholder} rows={list ? 4 : multiline ? 4 : undefined}
        style={{ ...inputStyle(theme), minHeight: multiline || list ? 90 : 44, resize: 'vertical', fontFamily: 'inherit' }} />
      {hint && <span style={{ fontSize: 11, color: theme.textMuted }}>{hint}</span>}
    </label>
  )
}

function BrandTab({ theme, isMobile, kit, company, eos, onSave, onFill }) {
  const k = { ...emptyBrandKit(), ...(kit || {}) }
  const hasEos = (eos?.core_values || []).length > 0 || eos?.core_focus?.purpose || eos?.marketing?.target_market

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {(k.logo_url || company?.logo_url) && <img src={k.logo_url || company?.logo_url} alt="logo" style={{ height: 44, maxWidth: 140, objectFit: 'contain', background: '#2c3530', borderRadius: 8, padding: 6 }} />}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{k.company_name || company?.company_name}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {kit ? `Last edited ${fmtWhen(k.updated_at) || 'just now'}` : 'Not set up yet.'} {hasEos ? 'Your EOS answers can fill this in.' : 'Fill out EOS under Admin and this can start from there.'}
          </div>
        </div>
        <button type="button" onClick={onFill} style={primaryBtn(MKT)}><Sparkles size={15} /> {kit ? 'Fill blanks from EOS' : 'Start from EOS'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        <Card theme={theme} title="Messaging">
          <BrandField theme={theme} k={k} onSave={onSave} label="Voice (how we sound)" name="voice" multiline placeholder="Straight talk from people who do the work. Confident, not salesy." hint="The AI writes every post in this voice." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Tone words" name="tone_words" list placeholder={'friendly\nexpert\nplain-spoken'} hint="One per line." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Who we talk to" name="audience" multiline placeholder="Facility managers and owners of warehouses and shops in northern Utah." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Tagline / what we do" name="tagline" placeholder="Commercial LED retrofits, rebates handled." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Default call to action" name="cta" placeholder="Call for a free lighting audit." />
        </Card>
        <Card theme={theme} title="Proof points">
          <BrandField theme={theme} k={k} onSave={onSave} label="Core values" name="values" list hint="From EOS. One per line." />
          <BrandField theme={theme} k={k} onSave={onSave} label="What sets us apart" name="uniques" list hint="From EOS marketing strategy." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Guarantee" name="guarantee" multiline />
          <BrandField theme={theme} k={k} onSave={onSave} label="Services we post about" name="services" list placeholder={'LED retrofits\nParking lot lighting\nCleaning'} />
          <BrandField theme={theme} k={k} onSave={onSave} label="Service area" name="service_area" placeholder="Ogden to Salt Lake" />
        </Card>
        <Card theme={theme} title="Say / never say">
          <BrandField theme={theme} k={k} onSave={onSave} label="Say things like" name="do_say" list placeholder={'Lights on, bill down.\nWe handle the rebate paperwork.'} />
          <BrandField theme={theme} k={k} onSave={onSave} label="Never say" name="dont_say" list placeholder={'cheap\nbest in the world\nlimited time'} />
          <BrandField theme={theme} k={k} onSave={onSave} label="House hashtags" name="hashtags" list placeholder={'LEDretrofit\nUtahBusiness'} hint="Without the #. The AI picks a few." />
        </Card>
        <Card theme={theme} title="Contact & look">
          <BrandField theme={theme} k={k} onSave={onSave} label="Website" name="website" placeholder="https://" />
          <BrandField theme={theme} k={k} onSave={onSave} label="Phone" name="phone" />
          <BrandField theme={theme} k={k} onSave={onSave} label="Logo URL" name="logo_url" hint="Defaults to the company logo from Settings." />
          <BrandField theme={theme} k={k} onSave={onSave} label="Primary color" name="primary_color" placeholder="#5a6349" />
        </Card>
      </div>
    </div>
  )
}

// ── Channels ─────────────────────────────────────────────────────────
function ChannelsTab({ theme, isMobile, ayrshare, isManager, invoke, onChanged }) {
  // The user never creates an Ayrshare account. JobScout holds one platform
  // key; each company gets an Ayrshare profile made on its first Connect.
  // Tapping Connect opens a popup that runs the network's own sign-in, the
  // popup posts connect:success back, and we refresh the account list.
  const [status, setStatus] = useState(null)   // { mode, platform_available, networks }
  const [busy, setBusy] = useState(null)       // platform id being connected
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [key, setKey] = useState('')
  const popupRef = useRef(null)
  const accounts = ayrshare?.accounts || []
  const byPlatform = useMemo(() => Object.fromEntries(accounts.map((a) => [a.platform, a])), [accounts])

  useEffect(() => {
    let cancelled = false
    invoke('marketing-publish', { action: 'status' }).then((r) => { if (!cancelled && r?.ok) setStatus(r) })
    return () => { cancelled = true }
  }, [invoke, ayrshare])

  const refresh = useCallback(async (quiet) => {
    const r = await invoke('marketing-publish', { action: 'accounts' })
    if (!r.ok) { if (!quiet) toast.error(r.error || 'Refresh failed'); return }
    if (!quiet) toast.success(`${r.accounts?.length || 0} connected`)
    onChanged()
  }, [invoke, onChanged])

  // The popup talks back with postMessage; a closed popup with no message
  // (the user closed it by hand) still triggers a refresh after a grace period.
  useEffect(() => {
    const onMsg = (e) => {
      const t = typeof e.data === 'string' ? e.data : e.data?.type || e.data?.event || ''
      if (!/^connect:/.test(t)) return
      if (t === 'connect:success') toast.success('Connected')
      else if (t === 'connect:error') toast.error(e.data?.message || 'That connection did not go through')
      setBusy(null)
      try { popupRef.current?.close() } catch { /* cross-origin */ }
      refresh(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [refresh])

  const connect = async (network) => {
    if (!isManager) { toast.error('A Manager or above connects social accounts.'); return }
    // Open the window inside the click, before any await, or the browser
    // blocks it as a popup. We point it at the real URL a moment later.
    const w = isMobile ? 420 : 620, h = 760
    const left = Math.max(0, (window.screen.width - w) / 2), top = Math.max(0, (window.screen.height - h) / 2)
    const popup = window.open('', 'jobscout_connect', `width=${w},height=${h},left=${left},top=${top}`)
    popupRef.current = popup
    setBusy(network)
    const r = await invoke('marketing-publish', { action: 'connect', network, origin: window.location.origin })
    if (!r.ok) {
      try { popup?.close() } catch { /* ignore */ }
      setBusy(null)
      toast.error(r.error || 'Could not start the connection')
      if (r.platform_missing) setShowAdvanced(true)
      return
    }
    if (popup) popup.location = r.url
    else window.open(r.url, '_blank')
    const started = Date.now()
    const timer = setInterval(() => {
      if (popup && !popup.closed && Date.now() - started < 10 * 60e3) return
      clearInterval(timer)
      setBusy((b) => (b === network ? null : b))
      refresh(true)
    }, 800)
  }

  const disconnect = async (platform) => {
    if (!window.confirm(`Disconnect ${PLATFORM_BY_ID[platform]?.label || platform}? Posts already published stay up.`)) return
    setBusy(platform)
    const r = await invoke('marketing-publish', { action: 'disconnect', platform })
    setBusy(null)
    if (!r.ok) { toast.error(r.error || 'Could not disconnect'); return }
    toast.success('Disconnected')
    onChanged()
  }

  const saveKey = async () => {
    if (!key.trim()) return
    setBusy('key')
    const r = await invoke('marketing-publish', { action: 'save_key', api_key: key.trim() })
    setBusy(null)
    if (!r.ok) { toast.error(r.error || 'Could not connect'); return }
    setKey('')
    toast.success(r.accounts?.length ? `Connected. ${r.accounts.length} account${r.accounts.length === 1 ? '' : 's'} linked.` : 'Key accepted. Now connect your networks.')
    onChanged()
  }

  const mode = status?.mode || (ayrshare?.profile_key ? 'platform' : ayrshare?.api_key ? 'byo' : 'unconfigured')
  const offered = new Set(status?.networks || PLATFORMS.map((p) => p.id))
  const canConnect = mode !== 'unconfigured' || status?.platform_available
  const shown = PLATFORMS.filter((p) => offered.has(p.id) || byPlatform[p.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card theme={theme} title="Social accounts" right={accounts.length > 0 && <button type="button" onClick={() => refresh(false)} disabled={!!busy} style={ghostBtn(theme)}><RefreshCw size={14} /> Refresh</button>}>
        <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
          {accounts.length === 0
            ? 'Tap Connect and sign in to the network. JobScout never sees the password; the network gives us permission to post on your behalf. Facebook and Instagram come through the Facebook login (Instagram needs a Business or Creator account tied to a Facebook Page).'
            : `${accounts.length} connected. Every post goes to the networks you pick in the composer.`}
        </div>
        {!canConnect && status && (
          <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '8px 10px' }}>
            Social publishing is not switched on for this JobScout install yet. An admin needs to set the publisher key on the server. Until then, a company with its own Ayrshare key can use Advanced below.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {shown.map((p) => {
            const a = byPlatform[p.id]
            const working = busy === p.id
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, minHeight: 60, background: a ? 'rgba(34,197,94,0.08)' : theme.bg, border: `1px solid ${a ? 'rgba(34,197,94,0.35)' : theme.border}` }}>
                {a?.image
                  ? <img src={a.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 32, height: 32, borderRadius: '50%', background: a ? '#22c55e' : theme.border, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a ? <Check size={16} /> : <Link2 size={15} color={theme.textMuted} />}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: a ? '#15803d' : theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a ? a.display_name : p.videoOnly ? 'Video posts only' : 'Not connected'}
                  </div>
                </div>
                {a ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {a.profile_url && <a href={a.profile_url} target="_blank" rel="noreferrer" title="Open profile" style={{ ...ghostBtn(theme), padding: 8, minHeight: 36 }}><ExternalLink size={14} /></a>}
                    {isManager && <button type="button" onClick={() => disconnect(p.id)} disabled={!!busy} title="Disconnect" style={{ ...ghostBtn(theme), padding: 8, minHeight: 36 }}><X size={14} /></button>}
                  </div>
                ) : (
                  <button type="button" onClick={() => connect(p.id)} disabled={!!busy || !canConnect || !isManager} style={{ ...primaryBtn(MKT), padding: '8px 12px', minHeight: 40, opacity: (!canConnect || !isManager) ? 0.5 : 1 }}>
                    {working ? 'Waiting…' : 'Connect'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {!isManager && <div style={{ fontSize: 12, color: theme.textMuted }}>A Manager or above connects and disconnects accounts.</div>}
        {ayrshare?.monthly_post_quota != null && (
          <div style={{ fontSize: 12, color: theme.textMuted }}>{ayrshare.monthly_post_count ?? 0} of {ayrshare.monthly_post_quota} posts used this month.</div>
        )}
      </Card>

      {isManager && (
        <div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} style={{ ...ghostBtn(theme), fontSize: 12, minHeight: 36, padding: '6px 10px' }}>
            {showAdvanced ? 'Hide advanced' : 'Advanced: use your own Ayrshare account'}
          </button>
          {showAdvanced && (
            <Card theme={theme} title="Your own Ayrshare key">
              <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
                Only for a company that already runs its own Ayrshare account. Paste that account's API key and link networks on <a href="https://app.ayrshare.com/social-accounts" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>Ayrshare's Social Accounts page</a>, then Refresh here. {mode === 'byo' && `Connected ${fmtWhen(ayrshare?.connected_at)}.`}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={mode === 'byo' ? 'Paste a new key to replace it' : 'Ayrshare API key'} style={{ ...inputStyle(theme), flex: 1, minWidth: 200 }} autoComplete="off" />
                <button type="button" onClick={saveKey} disabled={busy === 'key' || !key.trim()} style={primaryBtn(MKT)}>{mode === 'byo' ? 'Replace key' : 'Use this key'}</button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ── Composer ─────────────────────────────────────────────────────────
function Composer({ theme, isMobile, companyId, currentEmployee, isManager, initialPost, initialCaptureIds, captures, linkedPlatforms, invoke, onClose, onSaved, onPublish }) {
  const [captureIds, setCaptureIds] = useState(initialCaptureIds)
  const [note, setNote] = useState('')
  const [platforms, setPlatforms] = useState(initialPost?.platforms?.length ? initialPost.platforms : [...linkedPlatforms].filter((p) => !PLATFORM_BY_ID[p]?.videoOnly))
  const [caption, setCaption] = useState(initialPost?.caption || '')
  const [hashtags, setHashtags] = useState((initialPost?.hashtags || []).join(' '))
  const [aiDraft, setAiDraft] = useState(initialPost?.ai_draft || null)
  const [when, setWhen] = useState(toLocalInput(initialPost?.scheduled_for))
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [extraMedia, setExtraMedia] = useState(initialPost && !(initialPost.capture_ids || []).length ? initialPost.media_urls || [] : [])

  // A post we are editing may reference captures already marked used; keep
  // their urls even though they are not in the inbox list.
  const captureById = useMemo(() => Object.fromEntries(captures.map((c) => [c.id, c])), [captures])
  const mediaUrls = useMemo(() => {
    const fromCaptures = captureIds.map((id) => captureById[id]?.url).filter(Boolean)
    const known = new Set(fromCaptures)
    const kept = (initialPost?.media_urls || []).filter((u) => !known.has(u) && (initialPost?.capture_ids || []).length > 0 && captureIds.length === (initialPost?.capture_ids || []).length)
    return [...fromCaptures, ...kept, ...extraMedia]
  }, [captureIds, captureById, initialPost, extraMedia])
  const mediaType = captureIds.some((id) => captureById[id]?.media_type === 'video') ? 'video' : 'image'
  const tagList = hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean)
  const problems = platformProblems({ platforms, caption: composeCaption(caption, tagList), mediaUrls, mediaType })
  const unlinked = platforms.filter((p) => !linkedPlatforms.has(p))

  const draft = async () => {
    if (!captureIds.length && !note.trim()) { toast.error('Give the AI something to go on: pick a photo or say what happened.'); return }
    setDrafting(true)
    const r = await invoke('marketing-draft', { capture_ids: captureIds, note, platforms, job_id: initialPost?.job_id || captureIds.map((id) => captureById[id]?.job_id).find(Boolean) || null })
    setDrafting(false)
    if (!r.ok) { toast.error(r.error || 'Could not draft'); return }
    setCaption(r.caption || '')
    setHashtags((r.hashtags || []).join(' '))
    if (!aiDraft) setAiDraft(r.caption || '')
  }

  const save = async (status) => {
    if (!caption.trim() && !mediaUrls.length) { toast.error('Write something or pick a photo first.'); return null }
    setSaving(true)
    const row = {
      company_id: companyId, status, caption: caption.trim(), ai_draft: aiDraft, hashtags: tagList, platforms,
      media_urls: mediaUrls, capture_ids: captureIds, source: captureIds.length ? 'photo' : 'manual',
      job_id: initialPost?.job_id || captureIds.map((id) => captureById[id]?.job_id).find(Boolean) || null,
      scheduled_for: when ? new Date(when).toISOString() : null,
    }
    if (status === 'approved') { row.approved_by = currentEmployee?.id || null; row.approved_at = new Date().toISOString() }
    let saved = null
    if (initialPost) {
      const { data, error } = await supabase.from('marketing_posts').update(row).eq('id', initialPost.id).eq('company_id', companyId).select().maybeSingle()
      if (error) { toast.error(error.message); setSaving(false); return null }
      saved = data
    } else {
      const { data, error } = await supabase.from('marketing_posts').insert({ ...row, created_by: currentEmployee?.id || null }).select().maybeSingle()
      if (error) { toast.error(error.message); setSaving(false); return null }
      saved = data
    }
    setSaving(false)
    return saved
  }
  const saveAnd = async (status, thenPublish) => {
    const saved = await save(status)
    if (!saved) return
    if (thenPublish) { await onPublish(saved); onSaved(); return }
    toast.success(status === 'approved' ? 'Approved. A manager can publish it from the queue.' : 'Saved as draft')
    onSaved()
  }

  const inFuture = when && new Date(when) > new Date()
  const canPublish = isManager && problems.length === 0 && unlinked.length === 0 && platforms.length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 720, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, background: theme.bgCard, zIndex: 1 }}>
          <Sparkles size={18} color={MKT} />
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, flex: 1 }}>{initialPost ? 'Edit post' : 'New post'}</div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Media */}
          <div>
            <div style={sectionLabel(theme)}>Photos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {mediaUrls.map((u, i) => (
                <div key={u + i} style={{ position: 'relative' }}>
                  <img src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: `1px solid ${theme.border}` }} />
                  <button type="button" onClick={() => { const id = captureIds.find((cid) => captureById[cid]?.url === u); if (id) setCaptureIds((xs) => xs.filter((x) => x !== id)); else setExtraMedia((xs) => xs.filter((x) => x !== u)) }}
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#2c3530', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setShowPicker((v) => !v)} style={{ width: 84, height: 84, borderRadius: 8, border: `1px dashed ${theme.border}`, background: theme.bg, color: theme.textMuted, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11 }}>
                <ImageIcon size={18} /> From inbox
              </button>
            </div>
            {showPicker && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 8, background: theme.bg, borderRadius: 8 }}>
                {captures.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted, gridColumn: '1 / -1' }}>Inbox is empty. Upload from the Inbox tab.</div>}
                {captures.map((c) => {
                  const on = captureIds.includes(c.id)
                  return (
                    <button key={c.id} type="button" onClick={() => setCaptureIds((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id].slice(-5)))} style={{ padding: 0, border: `2px solid ${on ? MKT : 'transparent'}`, borderRadius: 8, background: 'none', cursor: 'pointer', overflow: 'hidden' }}>
                      <img src={c.url} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Note + draft */}
          <div>
            <div style={sectionLabel(theme)}>What happened? (for the AI)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Swapped 40 highbays at a warehouse in Ogden, crew of three, done in a day. Customer was thrilled."
              style={{ ...inputStyle(theme), minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={draft} disabled={drafting} style={primaryBtn(MKT)}><Sparkles size={15} /> {drafting ? 'Writing…' : caption ? 'Redraft with AI' : 'Draft with AI'}</button>
              <span style={{ fontSize: 12, color: theme.textMuted }}>Uses your brand kit and what you approved before.</span>
            </div>
          </div>

          {/* Caption */}
          <div>
            <div style={sectionLabel(theme)}>Caption</div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} placeholder="Or write it yourself."
              style={{ ...inputStyle(theme), minHeight: 140, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }} />
            <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="hashtags, space separated" style={{ ...inputStyle(theme), marginTop: 8 }} />
            {aiDraft && aiDraft.trim() !== caption.trim() && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>You changed the AI's draft. The next draft learns from this edit.</div>}
          </div>

          {/* Platforms */}
          <div>
            <div style={sectionLabel(theme)}>Post to</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PLATFORMS.map((p) => {
                const linked = linkedPlatforms.has(p.id)
                const on = platforms.includes(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => setPlatforms((xs) => (on ? xs.filter((x) => x !== p.id) : [...xs, p.id]))}
                    title={linked ? '' : 'Not connected yet'} style={{ ...chip(theme, on), opacity: linked ? 1 : 0.55 }}>
                    {on ? <Check size={13} /> : null} {p.label}
                  </button>
                )
              })}
            </div>
            {unlinked.length > 0 && <div style={{ fontSize: 12, color: '#eab308', marginTop: 6 }}>Not connected yet: {unlinked.map((p) => PLATFORM_BY_ID[p]?.label || p).join(', ')}. Connect them under Channels, or unpick them.</div>}
            {problems.map((pr) => <div key={pr.platform + pr.reason} style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{pr.reason}</div>)}
          </div>

          {/* Schedule */}
          <div>
            <div style={sectionLabel(theme)}>When</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inputStyle(theme), width: 'auto' }} />
              {when && <button type="button" onClick={() => setWhen('')} style={ghostBtn(theme)}>Now</button>}
              <span style={{ fontSize: 12, color: theme.textMuted }}>{inFuture ? 'Will be scheduled.' : 'Leave blank to post as soon as it is published.'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${theme.border}`, position: 'sticky', bottom: 0, background: theme.bgCard, flexWrap: 'wrap' }}>
          <button type="button" disabled={saving} onClick={() => saveAnd('draft', false)} style={ghostBtn(theme)}>Save draft</button>
          <button type="button" disabled={saving} onClick={() => saveAnd('approved', false)} style={ghostBtn(theme)}><Check size={15} /> Approve</button>
          <div style={{ flex: 1 }} />
          {isManager && (
            <button type="button" disabled={saving || !canPublish} onClick={() => saveAnd('approved', true)} style={{ ...primaryBtn(MKT), opacity: canPublish ? 1 : 0.5 }}>
              {inFuture ? <><CalendarClock size={15} /> Schedule</> : <><Send size={15} /> Publish now</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Post by hand ─────────────────────────────────────────────────────
// The last mile when no publisher is connected yet (or a network is not):
// copy the caption, save the photo, post it in the network's own app, then
// mark it done so the queue, the learning loop and reporting stay true.
function HandPostSheet({ theme, isMobile, post, onClose, onMarked }) {
  const text = composeCaption(post.caption, post.hashtags)
  const [copied, setCopied] = useState(false)
  const [where, setWhere] = useState(() => (post.platforms || []).map((id) => PLATFORM_BY_ID[id]?.label || id).join(', '))
  const [saving, setSaving] = useState(false)
  const media = (post.media_urls || []).filter(Boolean)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the text and copy it.')
    }
  }
  // Public bucket objects come with CORS, so a fetch → blob → object URL
  // gives a real download; a plain <a download> is ignored cross-origin.
  const download = async (url, i) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `post-${post.id}-${i + 1}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch {
      window.open(url, '_blank')
    }
  }
  const mark = async () => {
    setSaving(true)
    await onMarked(where.trim() ? `Posted by hand to ${where.trim()}` : 'Posted by hand')
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 560, maxHeight: '92vh', overflowY: 'auto', borderRadius: isMobile ? '14px 14px 0 0' : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <Hand size={18} color={MKT} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Post it yourself</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Copy, save the photo, post from the network's app, then mark it done.</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ ...sectionLabel(theme), marginBottom: 0, flex: 1 }}>1. Caption</div>
              <button type="button" onClick={copy} style={{ ...ghostBtn(theme), minHeight: 36, padding: '6px 10px' }}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
            </div>
            <textarea readOnly value={text} rows={6} onFocus={(e) => e.target.select()} style={{ ...inputStyle(theme), minHeight: 120, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }} />
          </div>
          <div>
            <div style={sectionLabel(theme)}>2. Photo{media.length === 1 ? '' : 's'}</div>
            {media.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.textMuted }}>No photo on this post.</div>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {media.map((u, i) => (
                  <div key={u} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    <img src={u} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 8, border: `1px solid ${theme.border}` }} />
                    <button type="button" onClick={() => download(u, i)} style={{ ...ghostBtn(theme), minHeight: 36, padding: '6px 10px' }}><Download size={14} /> Save</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>On a phone, press and hold the photo to save it to your camera roll.</div>
          </div>
          <div>
            <div style={sectionLabel(theme)}>3. Where did it go?</div>
            <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Facebook, Instagram, Google Business" style={inputStyle(theme)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${theme.border}` }}>
          <button type="button" onClick={onClose} style={ghostBtn(theme)}>Not yet</button>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={saving} onClick={mark} style={primaryBtn(MKT)}><Check size={15} /> Mark as posted</button>
        </div>
      </div>
    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────
function Card({ theme, title, right, children }) {
  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, flex: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
function Empty({ theme, icon: Icon, title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 12 }}>
      <Icon size={32} color={theme.textMuted} />
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>{body}</div>
      {action && <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>{action}</div>}
    </div>
  )
}
const sectionLabel = (theme) => ({ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 })
const inputStyle = (theme) => ({ width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 14 })
const primaryBtn = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' })
const ghostBtn = (theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bgCard, color: theme.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' })
const chip = (theme, on) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', minHeight: 36, borderRadius: 999, border: `1px solid ${on ? MKT : theme.border}`, background: on ? MKT_BG : theme.bgCard, color: on ? MKT : theme.textSecondary, fontSize: 12, fontWeight: on ? 600 : 500, cursor: 'pointer' })
