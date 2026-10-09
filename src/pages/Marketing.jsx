import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { toast } from '../lib/toast'
import { getAccessLevel, ACCESS_LEVELS } from '../lib/accessControl'
import {
  BRAND_KIT_KEY, PUBLISHER_KEY, BRANDS_KEY, MEDIA_BUCKET, PLATFORMS, PLATFORM_BY_ID,
  emptyBrandKit, deriveBrandKitFromEos, setupProgress, platformProblems, capturePath, composeCaption,
  brandsFrom, brandKey, brandForUnit, slugify,
  postsByDay, weekOf, weekProgress, monthGrid, postDay, profileLinks,
} from '../lib/marketing'
import { uploadCapture, captureThumb, backfillVideoPosters } from '../lib/marketingUpload'
import ScoutLoader from '../components/ScoutLoader'
import { renderEdit, renderStoryboard, normalizeStoryboard, totalSeconds, defaultTrim, canEditVideo, ASPECTS, MAX_RESULT_SECONDS } from '../lib/videoEdit'
import { MOODS, renderMusicBed, decodeTrack } from '../lib/musicBed'
import {
  Megaphone, Inbox, ListChecks, Palette, Link2, Mail, Sparkles, Upload, Camera, Check, X,
  Send, Clock, ExternalLink, RefreshCw, ChevronRight, CircleCheck, Circle, Trash2, Pencil,
  Image as ImageIcon, AlertTriangle, Archive, CalendarClock, Hand, Copy, Download,
  Play, CalendarDays, BarChart3, Globe, ChevronLeft, FolderOpen, Search, Film, FileText, RotateCcw, Scissors, ArrowUp, ArrowDown, Clapperboard, Music, Mic, Volume2, Plus, Loader2,
} from 'lucide-react'

// Marketing — step 1 of the Sales Flow. Everything a company does to be found
// lives here: the brand kit (derived from EOS, edited in place), the connected
// social accounts (Upload-Post publishes for us), the inbox of photos the crew
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
  publishing:{ label: 'Sending…',  color: '#a855f7' },
  failed:    { label: 'Failed',    color: '#ef4444' },
  archived:  { label: 'Archived',  color: '#7d8a7f' },
}

const parseJson = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return fallback }
}
// A capture in a private bucket (a suggested draft's job photo) needs a
// signed URL to show; public ones already carry theirs.
async function signPrivateCaptures(rows) {
  const priv = (rows || []).filter((x) => x.bucket && x.bucket !== MEDIA_BUCKET && x.path)
  const byBucket = priv.reduce((m, x) => { (m[x.bucket] ||= []).push(x); return m }, {})
  for (const [bucket, list] of Object.entries(byBucket)) {
    try {
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(list.map((x) => x.path), 3600)
      ;(signed || []).forEach((s, i) => { if (s?.signedUrl) list[i].url = s.signedUrl })
    } catch (err) { console.warn('[Marketing] sign failed', bucket, err) }
  }
  return rows
}
const monthKey = (d) => {
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? 'undated' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (k) => (k === 'undated' ? 'Undated' : new Date(`${k}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
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
  const businessUnits = useStore((s) => s.businessUnits)
  const currentEmployee = useMemo(() => (employees || []).find((e) => e.email === user?.email) || null, [employees, user])
  const isManager = getAccessLevel(currentEmployee) >= ACCESS_LEVELS.MANAGER

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('queue')
  // On a phone the page opens on "shoot it and send it". The queue, tabs and
  // settings are the marketer's; a tech in the field never needs them.
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'capture' : 'full'))
  const noteRef = useRef('')
  const backfillingRef = useRef(false)
  const [company, setCompany] = useState(null)
  const [companyLinks, setCompanyLinks] = useState({ website: '', google_place_id: '', google_review_url: '' })
  // The brand's links back into Settings → Company, when they are the same thing.
  const pushLinksToCompany = async (links) => {
    const patch = {}
    if (links.website) patch.website = links.website
    const place = (links.google_business || '').match(/place_id:([A-Za-z0-9_-]+)/)?.[1]
    if (place) patch.google_place_id = place
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('companies').update(patch).eq('id', companyId)
      if (error) { toast.error(error.message); return }
    }
    if (links.reviews) await saveSetting('google_review_url', links.reviews)
    toast.success('Saved to company settings.')
    load()
  }
  const [eos, setEos] = useState({})
  // One company, possibly several brands (HHH: cleaning, lighting, JobScout).
  // Every brand's kit and publisher load at once so switching is instant;
  // the current brand id is remembered per viewer.
  const [brands, setBrands] = useState([])
  const [brandId, setBrandId] = useState(() => { try { return localStorage.getItem('mkt_brand') || '' } catch { return '' } })
  const [kitsByBrand, setKitsByBrand] = useState({})     // brand id → kit (null = never saved)
  const [pubsByBrand, setPubsByBrand] = useState({})     // brand id → publisher blob
  const brandKit = kitsByBrand[brandId] ?? null
  const publisher = pubsByBrand[brandId] ?? null
  const currentBrand = brands.find((b) => b.id === brandId) || brands[0] || null
  const pickBrand = (id) => { setBrandId(id); try { localStorage.setItem('mkt_brand', id) } catch { /* private mode */ } }
  const [posts, setPosts] = useState([])
  const [captures, setCaptures] = useState([])
  const [captureMap, setCaptureMap] = useState({})    // every capture a post or the inbox refers to, private urls signed
  const [composer, setComposer] = useState(null)      // { post?, captureIds[] }
  const [handPost, setHandPost] = useState(null)      // post being posted by hand
  const [walkthroughHidden, setWalkthroughHidden] = useState(() => {
    try { return localStorage.getItem('mkt_walkthrough_hidden') === '1' } catch { return false }
  })

  const load = useCallback(async () => {
    if (!companyId) return
    const [{ data: settings }, { data: co }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('settings').select('key, value').eq('company_id', companyId)
        .or('key.like.marketing_%,key.in.(eos_core_values,eos_core_focus,eos_marketing_strategy,google_review_url)'),
      supabase.from('companies').select('id, company_name, logo_url, website, phone, city, state, primary_color, google_place_id').eq('id', companyId).maybeSingle(),
      supabase.from('marketing_posts').select('*').eq('company_id', companyId).neq('status', 'archived').order('created_at', { ascending: false }).limit(200),
      supabase.from('marketing_captures').select('*').eq('company_id', companyId).eq('status', 'new').order('created_at', { ascending: false }).limit(200),
    ])
    const get = (k) => (settings || []).find((r) => r.key === k)?.value
    const brandList = brandsFrom(parseJson(get(BRANDS_KEY), []), co || {})
    setBrands(brandList)
    const kits = {}, pubs = {}
    for (const b of brandList) {
      kits[b.id] = get(brandKey(BRAND_KIT_KEY, b.id)) ? parseJson(get(brandKey(BRAND_KIT_KEY, b.id)), null) : null
      pubs[b.id] = parseJson(get(brandKey(PUBLISHER_KEY, b.id)), null)
    }
    setKitsByBrand(kits)
    setPubsByBrand(pubs)
    setBrandId((cur) => (brandList.some((b) => b.id === cur) ? cur : brandList[0]?.id || ''))
    setEos({
      core_values: parseJson(get('eos_core_values'), []),
      core_focus: parseJson(get('eos_core_focus'), {}),
      marketing: parseJson(get('eos_marketing_strategy'), {}),
    })
    setCompany(co || null)
    setCompanyLinks({ website: co?.website || '', google_place_id: co?.google_place_id || '', google_review_url: parseJson(get('google_review_url'), '') || '' })
    // Captures a post points at may be 'used' (not in the inbox list) and may
    // live in a PRIVATE bucket (a suggested draft's job photos). Fetch the
    // missing ones and sign private paths so thumbnails render everywhere.
    const referenced = new Set((p || []).flatMap((x) => x.capture_ids || []))
    const have = new Set((c || []).map((x) => x.id))
    const missing = [...referenced].filter((id) => !have.has(id))
    const { data: more } = missing.length
      ? await supabase.from('marketing_captures').select('*').eq('company_id', companyId).in('id', missing)
      : { data: [] }
    const all = [...(c || []), ...(more || [])]
    const priv = all.filter((x) => x.bucket && x.bucket !== MEDIA_BUCKET && x.path)
    const byBucket = priv.reduce((m, x) => { (m[x.bucket] ||= []).push(x); return m }, {})
    for (const [bucket, rows] of Object.entries(byBucket)) {
      try {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(rows.map((x) => x.path), 3600)
        ;(signed || []).forEach((s, i) => { if (s?.signedUrl) rows[i].url = s.signedUrl })
      } catch (err) { console.warn('[Marketing] sign failed', bucket, err) }
    }
    setCaptureMap(Object.fromEntries(all.map((x) => [x.id, x])))
    setPosts(p || [])
    setCaptures(c || [])
    setLoading(false)
    // Videos that went up without a poster (the phone could not decode
    // them at upload) get one now, from whatever device this is.
    if (!backfillingRef.current && all.some((x) => x.media_type === 'video' && !x.poster_url)) {
      backfillingRef.current = true
      backfillVideoPosters(all).then((n) => { backfillingRef.current = false; if (n) load() })
    }
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const saveSetting = useCallback(async (key, value) => {
    const { error } = await supabase.from('settings')
      .upsert({ company_id: companyId, key, value: JSON.stringify(value) }, { onConflict: 'company_id,key' })
    if (error) { toast.error(error.message); return false }
    return true
  }, [companyId])

  const progress = useMemo(() => setupProgress({ brandKit, publisher, posts }), [brandKit, publisher, posts])
  const linkedPlatforms = useMemo(() => new Set((publisher?.accounts || []).map((a) => a.platform)), [publisher])

  // ── Brand kit ──────────────────────────────────────────────────────
  const saveBrandKit = async (next) => {
    const kit = { ...emptyBrandKit(), ...(brandKit || {}), ...next, updated_at: new Date().toISOString() }
    setKitsByBrand((m) => ({ ...m, [brandId]: kit }))
    await saveSetting(brandKey(BRAND_KIT_KEY, brandId), kit)
  }
  const fillFromEos = async () => {
    // A named brand starts from its own name and logo; EOS still supplies
    // the values and strategy, which are company-wide.
    const seed = currentBrand?.id
      ? { ...company, company_name: currentBrand.name, logo_url: currentBrand.logo_url || company?.logo_url }
      : company
    const kit = deriveBrandKitFromEos({ eos, company: seed, existing: brandKit })
    await saveBrandKit(kit)
    toast.success('Brand kit filled from your EOS and company profile. Edit anything.')
  }

  // The brand list itself. Going from one unnamed default brand to named
  // brands moves whatever was already set up (kit, connected accounts) onto
  // the first named brand, so nothing connected is lost or orphaned.
  const saveBrands = async (list) => {
    const clean = brandsFrom(list, company || {})
    const named = clean.filter((b) => b.id)
    const hadDefaultData = !!(kitsByBrand[''] || pubsByBrand[''])
    const ops = []
    if (named.length && hadDefaultData && !brands.some((b) => b.id)) {
      const first = named[0].id
      if (kitsByBrand['']) ops.push(saveSetting(brandKey(BRAND_KIT_KEY, first), kitsByBrand['']))
      if (pubsByBrand['']) ops.push(saveSetting(brandKey(PUBLISHER_KEY, first), pubsByBrand['']))
      await Promise.all(ops)
      await supabase.from('settings').delete().eq('company_id', companyId).in('key', [BRAND_KIT_KEY, PUBLISHER_KEY])
      toast.success(`Your existing setup now belongs to ${named[0].name}.`)
    }
    await saveSetting(BRANDS_KEY, named.map(({ id, name, unit, logo_url }) => ({ id, name, unit, logo_url })))
    if (named.length) pickBrand(named.some((b) => b.id === brandId) ? brandId : named[0].id)
    else pickBrand('')
    await load()
  }

  // ── Captures (inbox) ───────────────────────────────────────────────
  const uploadRef = useRef(null)
  // On a phone, capture= opens the camera straight away: one for a photo,
  // one for a video. Field content is shot, not picked from a library.
  const photoCamRef = useRef(null)
  const videoCamRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(null)   // 0..100 while a large file goes up
  // 'photo' | 'video' | 'library' while the camera or picker is open. On a
  // phone the camera takes a few seconds to hand a video over, and nothing
  // on screen said so — people pressed the button again. The hint under the
  // buttons covers that gap; the scout takes over the moment the file lands.
  const [picking, setPicking] = useState(null)
  const pick = (kind, ref) => { setPicking(kind); ref.current?.click() }
  useEffect(() => {
    if (!picking) return
    // Back in the app with nothing chosen (cancelled): clear the hint after a beat.
    const onFocus = () => setTimeout(() => setPicking((p) => (p === picking ? null : p)), 3000)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [picking])
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setPicking(null)
    if (!files.length) return
    setUploading(true)
    let ok = 0
    for (const file of files) {
      try {
        // Photo or video; a video also gets its poster and stills here.
        setUploadPct(0)
        await uploadCapture({ companyId, employeeId: currentEmployee?.id || null, file, note: noteRef.current || '', source: 'shared', brand: brands.length > 1 ? brandId : null, onProgress: (f) => setUploadPct(Math.round(f * 100)) })
        ok++
      } catch (err) {
        toast.error(`${file.name}: ${err.message || 'upload failed'}`)
      }
    }
    setUploading(false)
    setUploadPct(null)
    if (ok) {
      noteRef.current = ''
      toast.success(view === 'capture' ? (ok === 1 ? 'Sent. The office has it.' : `Sent ${ok}. The office has them.`) : (ok === 1 ? 'Added to the inbox' : `${ok} added to the inbox`))
      load()
    }
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
    // No networks picked: open the editor rather than error. (Post #5 on
    // HHH: made from JobScout-filed photos, switched to HHH, nothing picked.)
    if (!post.platforms?.length) {
      toast.error('Pick where it goes first.')
      setComposer({ post, captureIds: post.capture_ids || [] })
      return
    }
    const r = await invoke('marketing-publish', { action: 'publish', post_id: post.id })
    if (!r.ok) { toast.error(r.error || 'Publish failed'); load(); return }
    if (r.warning) toast.error(`Posted with a problem: ${r.warning}`)
    else toast.success(r.status === 'scheduled' ? 'Scheduled' : 'Posted. Links arrive in a moment.')
    load()
    // The vendor answers before the networks do; ask again for the links.
    if (r.status === 'posted' && !(r.post_urls || []).some((u) => u.postUrl)) {
      setTimeout(async () => { await invoke('marketing-publish', { action: 'sync_post', post_id: post.id }); load() }, 8000)
      setTimeout(async () => { await invoke('marketing-publish', { action: 'sync_post', post_id: post.id }); load() }, 30000)
    }
  }
  const syncPost = async (post) => {
    const r = await invoke('marketing-publish', { action: 'sync_post', post_id: post.id })
    if (!r.ok) { toast.error(r.error || 'Could not check'); return }
    toast.success(r.status === 'completed' ? 'Links updated' : `Still going: ${r.completed || 0} of ${r.total || '?'} networks done`)
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
    { id: 'library', label: 'Library', icon: FolderOpen },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
    { id: 'brand', label: 'Brand', icon: Palette },
    { id: 'channels', label: 'Channels', icon: Link2 },
    { id: 'email', label: 'Email', icon: Mail },
  ]
  const brandPosts = brands.length > 1 ? posts.filter((p) => (p.brand || '') === (brandId || '')) : posts

  if (!companyId) return null

  const hiddenInputs = (
    <>
      <input ref={uploadRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
      <input ref={photoCamRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleUpload} />
      <input ref={videoCamRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={handleUpload} />
    </>
  )

  // The marketing tools are the marketer's (Manager and above). A tech gets
  // the capture screen and nothing else, on any device.
  if (view === 'capture' || !isManager) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: isMobile ? '12px 16px 90px' : '20px 24px 60px' }}>
        <CaptureFirst
          theme={theme} isMobile={isMobile} brands={brands} brandId={brandId} onPickBrand={pickBrand}
          uploading={uploading} uploadPct={uploadPct} noteRef={noteRef} isManager={isManager}
          captures={captures} captureMap={captureMap} posts={posts} employeeId={currentEmployee?.id || null}
          links={profileLinks(publisher, brandKit)}
          waiting={posts.filter((p) => ['draft', 'approved'].includes(p.status)).length}
          scheduled={posts.filter((p) => p.status === 'scheduled').length}
          picking={picking} onTakePhoto={() => pick('photo', photoCamRef)} onRecordVideo={() => pick('video', videoCamRef)} onLibrary={() => pick('library', uploadRef)}
          onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          onOpenTab={(t) => { setTab(t); setView('full') }}
        />
        {hiddenInputs}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '12px 16px 90px' : '20px 24px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {isMobile && (
          <button type="button" onClick={() => setView('capture')} title="Back" style={{ ...ghostBtn(theme), padding: 8, minHeight: 40 }}><ChevronLeft size={18} /></button>
        )}
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

      {/* Brand switcher: only when the company markets more than one thing */}
      {brands.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {brands.map((b) => {
            const on = b.id === brandId
            const acc = (pubsByBrand[b.id]?.accounts || []).length
            return (
              <button key={b.id} type="button" onClick={() => pickBrand(b.id)} style={{ ...chip(theme, on), padding: '8px 12px 8px 8px', gap: 8 }}>
                {b.logo_url
                  ? <img src={b.logo_url} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'contain', background: '#2c3530' }} />
                  : <span style={{ width: 22, height: 22, borderRadius: 6, background: on ? MKT : theme.border, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{(b.name || '?').slice(0, 1)}</span>}
                <span>{b.name}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{acc ? `${acc} linked` : 'not linked'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Setup walkthrough: on the page, until done */}
      {!loading && !(progress.complete && walkthroughHidden) && (
        <SetupWalkthrough
          theme={theme} isMobile={isMobile} progress={progress} isManager={isManager}
          onBrand={() => setTab('brand')} onChannels={() => setTab('channels')} onFirstPost={() => setComposer({ captureIds: [] })}
          onHide={() => { try { localStorage.setItem('mkt_walkthrough_hidden', '1') } catch { /* private mode */ } setWalkthroughHidden(true) }}
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'wrap' : 'nowrap', overflowX: isMobile ? 'visible' : 'auto', paddingBottom: 6, marginBottom: 12, WebkitOverflowScrolling: 'touch' }}>
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
        <ScoutLoader theme={theme} label="Opening marketing…" />
      ) : tab === 'queue' ? (
        <QueueTab theme={theme} isMobile={isMobile} posts={posts} isManager={isManager} captureMap={captureMap} brands={brands} brand={brandId}
          onEdit={(p) => setComposer({ post: p, captureIds: p.capture_ids || [] })}
          onApprove={(p) => setPostStatus(p, 'approved')} onPublish={publishPost} onUnschedule={unschedulePost}
          onArchive={(p) => setPostStatus(p, 'archived')} onNew={() => setComposer({ captureIds: [] })}
          onHandPost={(p) => setHandPost(p)} onSync={syncPost} />
      ) : tab === 'inbox' ? (
        <InboxTab theme={theme} isMobile={isMobile} captures={captures} uploading={uploading} uploadPct={uploadPct} invoke={invoke} isManager={isManager} onChanged={load}
          picking={picking} onUploadClick={() => pick('library', uploadRef)} onTakePhoto={() => pick('photo', photoCamRef)} onRecordVideo={() => pick('video', videoCamRef)} onDismiss={dismissCapture}
          onMakePost={(ids) => setComposer({ captureIds: ids })} />
      ) : tab === 'brand' ? (
        <BrandTab theme={theme} isMobile={isMobile} kit={brandKit} company={company} eos={eos} onSave={saveBrandKit} onFill={fillFromEos} brands={brands} brand={currentBrand} businessUnits={businessUnits} isManager={isManager} onSaveBrands={saveBrands} />
      ) : tab === 'library' ? (
        <LibraryTab theme={theme} isMobile={isMobile} companyId={companyId} brands={brands} brand={brandId} employees={employees} isManager={isManager}
          onMakePost={(ids) => setComposer({ captureIds: ids })}
          onReuse={(p) => setComposer({ captureIds: [], caption: p.caption, hashtags: p.hashtags || [] })} />
      ) : tab === 'calendar' ? (
        <CalendarTab theme={theme} isMobile={isMobile} posts={brandPosts} captureMap={captureMap} kit={brandKit} isManager={isManager}
          onCadence={(n) => saveBrandKit({ cadence_per_week: n })} onOpen={(p) => (['draft', 'approved', 'failed'].includes(p.status) ? setComposer({ post: p, captureIds: p.capture_ids || [] }) : null)}
          onNewOn={(day) => setComposer({ captureIds: [], scheduledFor: day })} />
      ) : tab === 'performance' ? (
        <PerformanceTab theme={theme} isMobile={isMobile} posts={brandPosts} captureMap={captureMap} brand={brandId} invoke={invoke} publisher={publisher} />
      ) : tab === 'channels' ? (
        <ChannelsTab theme={theme} isMobile={isMobile} publisher={publisher} brand={brandId} brandName={currentBrand?.name} isManager={isManager} invoke={invoke} onChanged={load} kit={brandKit} onSaveKit={saveBrandKit}
          companyLinks={companyLinks} onPushToCompany={pushLinksToCompany} />
      ) : null}

      {hiddenInputs}

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
          initialPost={composer.post || null} initialCaptureIds={composer.captureIds || []} initialScheduledFor={composer.scheduledFor || null}
          initialCaption={composer.caption || ''} initialHashtags={composer.hashtags || []}
          captures={captures} captureMap={captureMap} linkedPlatforms={linkedPlatforms} invoke={invoke} brands={brands} brand={brandId} pubsByBrand={pubsByBrand} kitsByBrand={kitsByBrand} company={company}
          onClose={() => setComposer(null)} onSaved={() => { setComposer(null); load() }}
          onPublish={publishPost}
        />
      )}
    </div>
  )
}

// ── Capture first ────────────────────────────────────────────────────
// What a phone opens on. Three big buttons, a line to say what it is, and
// what you have sent today. The queue and the tabs are one tap away for
// the marketer; a tech never has to see them. Bryce: "if I'm in the field
// and I press marketing the first thing I should see is how to add a video
// from my phone or take one. Let the marketer deal with the posts."
function CaptureFirst({ theme, isMobile, brands, brandId, onPickBrand, uploading, uploadPct, picking = null, noteRef, isManager, captures, captureMap = {}, posts = [], employeeId, links = [], waiting = 0, scheduled = 0, onTakePhoto, onRecordVideo, onLibrary, onBack, onOpenTab }) {
  const [note, setNote] = useState('')
  const [recent, setRecent] = useState(null)   // the viewer's last 20 captures, any status
  const multi = brands.length > 1
  const companyId = useStore((s) => s.companyId)
  useEffect(() => {
    let cancelled = false
    let q = supabase.from('marketing_captures').select('id, url, poster_url, frames, media_type, status, post_id, created_at, employee_id, note').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20)
    if (employeeId) q = q.eq('employee_id', employeeId)
    q.then(({ data }) => { if (!cancelled) setRecent(data || []) })
    return () => { cancelled = true }
  }, [companyId, employeeId, captures.length])
  const postById = useMemo(() => Object.fromEntries(posts.map((p) => [p.id, p])), [posts])
  const statusOf = (c) => {
    const p = c.post_id ? postById[c.post_id] : null
    if (p?.status === 'posted') return { label: 'Posted', color: '#22c55e', url: (p.post_urls || []).find((u) => u.postUrl)?.postUrl || null }
    if (p?.status === 'scheduled') return { label: 'Scheduled', color: '#a855f7' }
    if (p) return { label: 'In a post', color: '#3b82f6' }
    if (c.status === 'dismissed') return { label: 'Not used', color: theme.textMuted }
    return { label: 'Waiting', color: theme.textMuted }
  }
  const mine = recent || []
  const sending = uploading ? (uploadPct != null && uploadPct < 100 ? `Sending ${uploadPct}%` : 'Sending…') : null
  const big = (color) => ({ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '18px 16px', minHeight: 72, borderRadius: 14, border: 'none', background: color, color: '#fff', fontSize: 17, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', textAlign: 'left', opacity: uploading ? 0.7 : 1 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onBack} title="Back" style={{ ...ghostBtn(theme), padding: 8, minHeight: 40 }}><ChevronLeft size={18} /></button>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: MKT_BG, color: MKT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Megaphone size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Send it to marketing</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>Shoot the work, the truck, the crew. The office turns it into a post.</div>
        </div>
      </div>

      {multi && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {brands.map((b) => <button key={b.id} type="button" onClick={() => onPickBrand(b.id)} style={chip(theme, b.id === brandId)}>{b.name}</button>)}
        </div>
      )}

      <button type="button" onClick={onTakePhoto} disabled={uploading} style={big(MKT)}>
        <Camera size={26} /> <span>{sending || 'Take a photo'}</span>
      </button>
      <button type="button" onClick={onRecordVideo} disabled={uploading} style={big('#2c3530')}>
        <Play size={26} /> <span>{sending ? 'Video' : 'Record a video'}</span>
      </button>
      <button type="button" onClick={onLibrary} disabled={uploading} style={{ ...big(theme.bgCard), color: theme.text, border: `1px solid ${theme.border}` }}>
        <Upload size={24} /> <span>From my phone's library</span>
      </button>
      {uploading && (
        <ScoutLoader overlay theme={theme} label={uploadPct != null && uploadPct < 100 ? 'Sending' : 'Almost there…'} pct={uploadPct} sub="Keep the app open until he gets there. One tap is enough." />
      )}
      {picking && !uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: MKT_BG, border: `1px solid ${MKT}`, fontSize: 13, color: theme.text }}>
          <img src="/scout-walk.gif" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
          <span>{picking === 'video' ? 'Camera is open. When you stop recording, the phone takes a few seconds to hand the video over, then the scout walks while it sends. One tap is enough.' : picking === 'photo' ? 'Camera is open. Take the shot and the scout walks while it sends.' : 'Pick from your library and the scout walks while it sends.'}</span>
        </div>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>What is it? (optional, goes with the next thing you send)</span>
        <input value={note} onChange={(e) => { setNote(e.target.value); noteRef.current = e.target.value }} placeholder="Finished the Ogden warehouse today, crew of three" style={inputStyle(theme)} />
      </label>

      {/* What this person has sent, and where each one got to */}
      {mine.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>What you've sent</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {mine.map((c) => {
              const st = statusOf(c)
              const Wrap = st.url ? 'a' : 'div'
              return (
                <Wrap key={c.id} {...(st.url ? { href: st.url, target: '_blank', rel: 'noreferrer' } : {})} style={{ flexShrink: 0, width: 84, textDecoration: 'none' }}>
                  <div style={{ position: 'relative' }}>
                    {captureThumb(c) ? <img src={captureThumb(c)} alt="" style={{ width: 84, height: 84, borderRadius: 8, objectFit: 'cover', border: `1px solid ${theme.border}`, display: 'block' }} /> : <div style={{ width: 84, height: 84, borderRadius: 8, background: theme.bg, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>{c.media_type === 'video' ? <Play size={16} /> : <ImageIcon size={16} />}</div>}
                    {c.media_type === 'video' && <div style={{ position: 'absolute', right: 4, top: 4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={10} /></div>}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: st.color, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>{st.label}{st.url && <ExternalLink size={9} />}</div>
                  <div style={{ fontSize: 10, color: theme.textMuted }}>{fmtWhen(c.created_at)}</div>
                </Wrap>
              )
            })}
          </div>
        </div>
      )}

      {/* Where the brand lives online: see the pics once they are up */}
      {links.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>Find us online</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {links.map((l) => (
              <a key={l.platform} href={l.url} target="_blank" rel="noreferrer" style={{ ...chip(theme, false), textDecoration: 'none', gap: 6 }}>
                <span>{l.label}</span><span style={{ fontSize: 11, opacity: 0.7 }}>{l.name}</span><ExternalLink size={11} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* The marketer's tools: Manager and above only */}
      {isManager && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>Marketing tools</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {[
              ['queue', ListChecks, 'Queue', waiting ? `${waiting} waiting for approval` : 'Drafts, approvals, publishing'],
              ['calendar', CalendarDays, 'Calendar', scheduled ? `${scheduled} scheduled` : 'Schedule and cadence'],
              ['library', FolderOpen, 'Library', 'Every photo, video and script'],
              ['performance', BarChart3, 'Performance', 'What each post did'],
              ['brand', Palette, 'Brand', 'Voice, kit and brands'],
              ['channels', Link2, 'Channels', 'Accounts, pages, website, ads'],
            ].map(([id, Icon, label, sub]) => (
              <button key={id} type="button" onClick={() => onOpenTab(id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '12px', minHeight: 72, borderRadius: 12, border: `1px solid ${id === 'queue' && waiting ? MKT : theme.border}`, background: id === 'queue' && waiting ? MKT_BG : theme.bgCard, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: id === 'queue' && waiting ? MKT : theme.text, fontSize: 14, fontWeight: 700 }}><Icon size={16} /> {label}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.3 }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>
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
function QueueTab({ theme, isMobile, posts, isManager, captureMap = {}, brands = [], brand = '', onEdit, onApprove, onPublish, onUnschedule, onArchive, onNew, onHandPost, onSync }) {
  const [filter, setFilter] = useState('open')
  const multi = brands.length > 1
  const brandName = (id) => brands.find((b) => b.id === (id || ''))?.name || ''
  const filtered = posts.filter((p) => {
    // With several brands the queue shows the selected brand's posts.
    if (multi && (p.brand || '') !== (brand || '')) return false
    if (filter === 'open') return ['draft', 'approved', 'failed'].includes(p.status)
    if (filter === 'scheduled') return p.status === 'scheduled'
    if (filter === 'posted') return p.status === 'posted'
    return true
  })
  const [busy, setBusy] = useState(null)
  const [busyLabel, setBusyLabel] = useState('')
  const run = async (id, fn, label = 'Working on it…') => { setBusy(id); setBusyLabel(label); try { await fn() } finally { setBusy(null); setBusyLabel('') } }
  return (
    <div>
      {busy && <ScoutLoader overlay theme={theme} label={busyLabel} />}
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
            const firstCap = (p.capture_ids || []).map((id) => captureMap[id]).find(Boolean)
            const isVideo = p.media_type === 'video' || firstCap?.media_type === 'video'
            const thumb = isVideo ? captureThumb(firstCap) : ((p.media_urls || [])[0] || (p.capture_ids || []).map((id) => captureMap[id]?.url).find(Boolean))
            const urls = Array.isArray(p.post_urls) ? p.post_urls.filter((u) => u?.postUrl) : []
            return (
              <div key={p.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {thumb ? (
                  <div style={{ position: 'relative' }}>
                    <img src={thumb} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                    {isVideo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={18} /></div></div>}
                  </div>
                ) : isVideo ? (
                  <div style={{ height: 60, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}><Play size={18} /></div>
                ) : (
                  <div style={{ height: 60, background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}><ImageIcon size={18} /></div>
                )}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.color + '18', borderRadius: 999, padding: '2px 8px' }}>{st.label}</span>
                    {isVideo && <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '2px 8px' }}>{p.video_format === 'story' ? 'Story' : p.video_format === 'video' ? 'Video' : 'Reel'}</span>}
                    {p.suggested_at && p.status === 'draft' && <span title="Drafted overnight from recent work. Nobody has read it yet." style={{ fontSize: 11, fontWeight: 700, color: MKT, background: MKT_BG, borderRadius: 999, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> Suggested</span>}
                    {multi && brandName(p.brand) && <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '2px 8px' }}>{brandName(p.brand)}</span>}
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
                      <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onPublish(p), `Posting to ${(p.platforms || []).map((id) => PLATFORM_BY_ID[id]?.label || id).join(', ')}…`)} style={primaryBtn(MKT)}>
                        {p.scheduled_for && new Date(p.scheduled_for) > new Date() ? <><CalendarClock size={14} /> Schedule</> : <><Send size={14} /> Publish now</>}
                      </button>
                    )}
                    {['approved', 'failed'].includes(p.status) && (
                      <button type="button" onClick={() => onHandPost(p)} style={ghostBtn(theme)} title="Copy the caption, save the photo, post it yourself, then mark it done here">
                        <Hand size={14} /> Post by hand
                      </button>
                    )}
                    {p.status === 'scheduled' && isManager && <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onUnschedule(p))} style={ghostBtn(theme)}><X size={14} /> Unschedule</button>}
                    {p.status === 'posted' && p.ayrshare_id && !urls.length && <button type="button" disabled={busy === p.id} onClick={() => run(p.id, () => onSync(p))} style={ghostBtn(theme)} title="Ask the networks for the post links"><RefreshCw size={14} /> Get links</button>}
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
function InboxTab({ theme, isMobile, captures, uploading, uploadPct = null, picking = null, invoke, isManager, onChanged, onUploadClick, onTakePhoto, onRecordVideo, onDismiss, onMakePost }) {
  const sending = uploading ? (uploadPct != null && uploadPct < 100 ? `Sending ${uploadPct}%` : 'Sending…') : null
  const [selected, setSelected] = useState([])
  const [suggesting, setSuggesting] = useState(false)
  const toggle = (id) => setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(-5)))
  // The same thing the nightly cron does, on demand for this company: draft
  // a post for every inbox photo nobody used and every job that finished
  // since yesterday with photos on it.
  const suggestNow = async () => {
    setSuggesting(true)
    const r = await invoke('marketing-suggest', {})
    setSuggesting(false)
    if (!r.ok) { toast.error(r.error || 'Could not draft'); return }
    const made = Object.values(r.results || {}).reduce((n, x) => n + (x?.made || 0), 0)
    toast.success(made ? `${made} draft${made === 1 ? '' : 's'} added to the queue` : 'Nothing new to draft: no unused photos and no finished jobs with photos since yesterday.')
    onChanged()
  }
  const SOURCE_LABEL = { text: 'texted', shared: 'from Field Scout', suggested: 'from a job', upload: '' }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onTakePhoto} disabled={uploading} style={primaryBtn(MKT)}><Camera size={15} /> {sending || 'Take photo'}</button>
        <button type="button" onClick={onRecordVideo} disabled={uploading} style={primaryBtn(MKT)}><Play size={15} /> {sending ? 'Video' : 'Record video'}</button>
        <button type="button" onClick={onUploadClick} disabled={uploading} style={ghostBtn(theme)}><Upload size={15} /> Upload</button>
        {selected.length > 0 && <button type="button" onClick={() => { onMakePost(selected); setSelected([]) }} style={primaryBtn(MKT)}><Sparkles size={15} /> Make a post from {selected.length}</button>}
        {isManager && <button type="button" onClick={suggestNow} disabled={suggesting} title="Draft posts from unused photos and yesterday's finished jobs" style={ghostBtn(theme)}><Sparkles size={15} /> {suggesting ? 'Drafting…' : 'Suggest posts now'}</button>}
        <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 'auto' }}>Every morning, unused photos and finished jobs become drafts in the queue.</span>
      </div>
      {uploading && <ScoutLoader overlay theme={theme} label={uploadPct != null && uploadPct < 100 ? 'Sending' : 'Almost there…'} pct={uploadPct} sub="Keep this open until he gets there. One tap is enough." />}
      {picking && !uploading && <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 10 }}>{picking === 'video' ? 'Camera is open. After you stop recording, the phone takes a few seconds to hand the video over, then the scout walks while it sends.' : 'Pick the file and the scout walks while it sends.'}</div>}
      <TextInCard theme={theme} isMobile={isMobile} invoke={invoke} isManager={isManager} />
      {captures.length === 0 ? (
        <Empty theme={theme} icon={Camera} title="Inbox is empty" body="Photos and videos your crew shares from Field Scout land here. Or shoot one right now." action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}><button type="button" onClick={onTakePhoto} style={primaryBtn(MKT)}><Camera size={15} /> Take photo</button><button type="button" onClick={onRecordVideo} style={primaryBtn(MKT)}><Play size={15} /> Record video</button><button type="button" onClick={onUploadClick} style={ghostBtn(theme)}><Upload size={15} /> Upload</button></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {captures.map((c) => {
            const on = selected.includes(c.id)
            return (
              <div key={c.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `2px solid ${on ? MKT : theme.border}`, background: theme.bgCard }}>
                <button type="button" onClick={() => toggle(c.id)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                  {c.media_type === 'video'
                    ? (captureThumb(c)
                        ? <div style={{ position: 'relative' }}><img src={captureThumb(c)} alt={c.note || ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} /><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={15} /></div></div></div>
                        : <VideoFrameTile src={c.url} size={140} />)
                    : <img src={c.url} alt={c.note || ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />}
                </button>
                <div style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: '50%', background: on ? MKT : 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  {on ? <Check size={14} /> : null}
                </div>
                <button type="button" onClick={() => onDismiss(c.id)} title="Dismiss" style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>
                <div style={{ padding: '6px 8px', fontSize: 11, color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {c.note && <div style={{ color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note}</div>}
                  <div>{fmtWhen(c.created_at)}{SOURCE_LABEL[c.source] ? ` · ${SOURCE_LABEL[c.source]}` : ''}{c.job_id ? ` · job ${c.job_id}` : ''}</div>
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

function BrandTab({ theme, isMobile, kit, company, eos, onSave, onFill, brands = [], brand = null, businessUnits = [], isManager, onSaveBrands }) {
  const k = { ...emptyBrandKit(), ...(kit || {}) }
  const shownLogo = k.logo_url || brand?.logo_url || company?.logo_url
  const shownName = k.company_name || brand?.name || company?.company_name
  const hasEos = (eos?.core_values || []).length > 0 || eos?.core_focus?.purpose || eos?.marketing?.target_market

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <BrandsEditor theme={theme} isMobile={isMobile} brands={brands} company={company} businessUnits={businessUnits} isManager={isManager} onSave={onSaveBrands} />
      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {shownLogo && <img src={shownLogo} alt="logo" style={{ height: 44, maxWidth: 140, objectFit: 'contain', background: '#2c3530', borderRadius: 8, padding: 6 }} />}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{shownName}{brand?.id && brand.name !== company?.company_name ? <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}> · a brand of {company?.company_name}</span> : null}</div>
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
function ChannelsTab({ theme, isMobile, publisher, brand = '', brandName, isManager, invoke, onChanged, kit, onSaveKit, companyLinks, onPushToCompany }) {
  // The user never creates a publisher account. JobScout holds one Upload-Post
  // key; each company gets its own profile made on its first Connect. Tapping
  // Connect opens a popup on the hosted connect page filtered to that one
  // network; the network's own sign-in runs there. When the popup closes we
  // re-read the profile's connected accounts.
  const [status, setStatus] = useState(null)   // { mode, platform_available, networks }
  const [busy, setBusy] = useState(null)       // platform id being connected
  const popupRef = useRef(null)
  const accounts = publisher?.accounts || []
  const byPlatform = useMemo(() => Object.fromEntries(accounts.map((a) => [a.platform, a])), [accounts])

  useEffect(() => {
    let cancelled = false
    invoke('marketing-publish', { action: 'status', brand }).then((r) => { if (!cancelled && r?.ok) setStatus(r) })
    return () => { cancelled = true }
  }, [invoke, publisher, brand])

  const refresh = useCallback(async (quiet) => {
    const r = await invoke('marketing-publish', { action: 'accounts', brand })
    if (!r.ok) { if (!quiet) toast.error(r.error || 'Refresh failed'); return }
    if (!quiet) toast.success(`${r.accounts?.length || 0} connected`)
    onChanged()
  }, [invoke, onChanged, brand])

  // Open the window inside the click, before any await, or the browser blocks
  // it as a popup. We point it at the real URL a moment later, then watch for
  // it to close (the connect page has no postMessage; closing is the signal).
  const openConnect = async (network) => {
    if (!isManager) { toast.error('A Manager or above connects social accounts.'); return }
    const w = isMobile ? 420 : 640, h = 780
    const left = Math.max(0, (window.screen.width - w) / 2), top = Math.max(0, (window.screen.height - h) / 2)
    const popup = window.open('', 'jobscout_connect', `width=${w},height=${h},left=${left},top=${top}`)
    popupRef.current = popup
    setBusy(network || 'all')
    const r = await invoke('marketing-publish', { action: 'connect', network: network || undefined, origin: window.location.origin, brand })
    if (!r.ok) {
      try { popup?.close() } catch { /* ignore */ }
      setBusy(null)
      toast.error(r.error || 'Could not start the connection')
      return
    }
    if (popup) popup.location = r.url
    else window.open(r.url, '_blank')
    const started = Date.now()
    const timer = setInterval(() => {
      if (popup && !popup.closed && Date.now() - started < 15 * 60e3) return
      clearInterval(timer)
      setBusy(null)
      refresh(true)
    }, 800)
  }

  const canConnect = !!status?.platform_available
  const offered = new Set(status?.networks || PLATFORMS.map((p) => p.id))
  const shown = PLATFORMS.filter((p) => offered.has(p.id) || byPlatform[p.id])
  const needsReauth = accounts.filter((a) => a.reauth_required)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card theme={theme} title={brandName ? `${brandName} · social accounts` : 'Social accounts'} right={
        <div style={{ display: 'flex', gap: 6 }}>
          {accounts.length > 0 && isManager && <button type="button" onClick={() => openConnect(null)} disabled={!!busy} style={ghostBtn(theme)} title="Add, reconnect or remove accounts">Manage</button>}
          {accounts.length > 0 && <button type="button" onClick={() => refresh(false)} disabled={!!busy} style={ghostBtn(theme)}><RefreshCw size={14} /> Refresh</button>}
        </div>
      }>
        <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
          {accounts.length === 0
            ? 'Tap Connect and sign in to the network. JobScout never sees the password; the network gives us permission to post on your behalf. Instagram needs a Business or Creator account tied to a Facebook Page.'
            : `${accounts.length} connected. Every post goes to the networks you pick in the composer.`}
        </div>
        {status && !canConnect && (
          <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '8px 10px' }}>
            Social publishing is not switched on for this JobScout install yet. An admin needs to set the publisher key on the server. Until then, use Post by hand from the queue.
          </div>
        )}
        {needsReauth.length > 0 && (
          <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '8px 10px' }}>
            {needsReauth.map((a) => PLATFORM_BY_ID[a.platform]?.label || a.platform).join(', ')} asked to be signed in again. Tap Reconnect.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {shown.map((p) => {
            const a = byPlatform[p.id]
            const working = busy === p.id
            const ok = a && !a.reauth_required
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, minHeight: 60, background: ok ? 'rgba(34,197,94,0.08)' : theme.bg, border: `1px solid ${ok ? 'rgba(34,197,94,0.35)' : theme.border}` }}>
                {a?.image
                  ? <img src={a.image} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 32, height: 32, borderRadius: '50%', background: ok ? '#22c55e' : theme.border, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ok ? <Check size={16} /> : <Link2 size={15} color={theme.textMuted} />}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: ok ? '#15803d' : theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a ? (a.reauth_required ? `${a.display_name} · needs sign-in` : a.display_name) : p.videoOnly ? 'Video posts only' : 'Not connected'}
                  </div>
                </div>
                {ok ? (
                  isManager && <button type="button" onClick={() => openConnect(p.id)} disabled={!!busy} title="Reconnect or remove" style={{ ...ghostBtn(theme), padding: '6px 10px', minHeight: 36, fontSize: 12 }}>Manage</button>
                ) : (
                  <button type="button" onClick={() => openConnect(p.id)} disabled={!!busy || !canConnect || !isManager} style={{ ...primaryBtn(MKT), padding: '8px 12px', minHeight: 40, opacity: (!canConnect || !isManager) ? 0.5 : 1 }}>
                    {working ? 'Waiting…' : a ? 'Reconnect' : 'Connect'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {!isManager && <div style={{ fontSize: 12, color: theme.textMuted }}>A Manager or above connects and disconnects accounts.</div>}
        {busy && <div style={{ fontSize: 12, color: theme.textMuted }}>Finish signing in the popup window, then close it. This list refreshes on its own.</div>}
        {(byPlatform.facebook || byPlatform.linkedin) && <PagePickers theme={theme} brand={brand} invoke={invoke} isManager={isManager} status={status} />}
      </Card>
      <LinksCard theme={theme} isMobile={isMobile} kit={kit} brandName={brandName} isManager={isManager} onSave={onSaveKit} companyLinks={companyLinks} onPushToCompany={onPushToCompany} />
      <AdsCard theme={theme} isMobile={isMobile} kit={kit} isManager={isManager} onSave={onSaveKit} />
    </div>
  )
}

// ── Composer ─────────────────────────────────────────────────────────
function Composer({ theme, isMobile, companyId, currentEmployee, isManager, initialPost, initialCaptureIds, initialScheduledFor = null, initialCaption = '', initialHashtags = [], captures, captureMap = {}, linkedPlatforms: linkedDefault, invoke, brands = [], brand: brandDefault = '', pubsByBrand = {}, kitsByBrand = {}, company = null, onClose, onSaved, onPublish }) {
  const [captureIds, setCaptureIds] = useState(initialCaptureIds)
  // Which brand this post speaks for. The post's own, else the photo's, else
  // the brand selected on the page. Accounts follow the brand.
  const multi = brands.length > 1
  const [postBrand, setPostBrand] = useState(() => initialPost?.brand ?? (initialCaptureIds.map((id) => captureMap[id]?.brand).find((b) => b != null) ?? brandDefault ?? ''))
  const linkedPlatforms = useMemo(() => (multi ? new Set((pubsByBrand[postBrand]?.accounts || []).map((a) => a.platform)) : linkedDefault), [multi, pubsByBrand, postBrand, linkedDefault])
  const brandInfo = useMemo(() => {
    const b = brands.find((x) => x.id === (postBrand || '')) || brands[0] || {}
    const kit = kitsByBrand[postBrand || ''] || {}
    return { name: kit.company_name || b.name || company?.company_name || '', logo_url: kit.logo_url || b.logo_url || company?.logo_url || null, color: kit.primary_color || company?.primary_color || '#5a6349' }
  }, [brands, postBrand, kitsByBrand, company])
  const [note, setNote] = useState('')
  // Where it goes: whatever the brand has connected that takes this kind of
  // post. Until the person hand-picks, the list follows the brand — switching
  // "Posting as" from a brand with nothing connected to one with five must
  // not leave the post aimed at nothing.
  const defaultPlatforms = (linked) => [...linked].filter((p) => !PLATFORM_BY_ID[p]?.videoOnly)
  const [platforms, setPlatforms] = useState(initialPost?.platforms?.length ? initialPost.platforms : defaultPlatforms(linkedPlatforms))
  const [platformsTouched, setPlatformsTouched] = useState(!!initialPost?.platforms?.length)
  useEffect(() => {
    if (platformsTouched) return
    setPlatforms(defaultPlatforms(linkedPlatforms))
  }, [linkedPlatforms, platformsTouched]) // eslint-disable-line react-hooks/exhaustive-deps
  const [caption, setCaption] = useState(initialPost?.caption || initialCaption || '')
  const [hashtags, setHashtags] = useState((initialPost?.hashtags?.length ? initialPost.hashtags : initialHashtags || []).join(' '))
  const [aiDraft, setAiDraft] = useState(initialPost?.ai_draft || null)
  const [when, setWhen] = useState(toLocalInput(initialPost?.scheduled_for) || (initialScheduledFor ? `${initialScheduledFor}T09:00` : ''))
  // Video posts: a Reel (default), a plain feed video, or a 24-hour Story.
  const [videoFormat, setVideoFormat] = useState(initialPost?.video_format || 'reel')
  const [primaryId, setPrimaryId] = useState(initialPost?.primary_capture_id || null)
  const [aiPick, setAiPick] = useState(null)   // the drafter's choice, shown as a hint
  const [splitting, setSplitting] = useState(false)
  const [editing, setEditing] = useState(false)        // the clip editor is open
  const [directing, setDirecting] = useState(false)    // the AI video maker is open
  const onDirected = (row) => {
    // The made video stands in for whatever was selected.
    setShot((xs) => [...xs, row])
    setCaptureIds([row.id])
    setPrimaryId(row.id)
    setDirecting(false)
    setReopen(null)
  }
  // AI pictures made anywhere in the composer join the list and the selection.
  const onPictures = (rows) => {
    if (!rows?.length) return
    setShot((xs) => [...xs, ...rows])
    setCaptureIds((xs) => [...xs, ...rows.map((r) => r.id)].slice(-5))
  }
  // Reopen a video the AI made: its plan is on the capture; the source
  // photos may no longer be in the inbox list, so fetch them by id.
  const [reopen, setReopen] = useState(null)   // { initial, captures }
  const [viewing, setViewing] = useState(null) // { url, video } — full-size preview with sound
  const [addMenu, setAddMenu] = useState(false) // the one Add button's menu
  // One door into editing a video: an AI-made one reopens its plan (scenes,
  // music, voice); a clip from the field opens the clip editor (trim, music, voice).
  const editVideo = () => { if (videoCapture?.source === 'generated' && videoCapture?.storyboard?.sb) reopenVideo(videoCapture); else setEditing(true) }
  const [painting, setPainting] = useState(false)
  const [paintSheet, setPaintSheet] = useState(false)
  const reopenVideo = async (cap) => {
    const sbd = cap?.storyboard
    if (!sbd?.sb) return
    const ids = (sbd.source_capture_ids || []).filter(Boolean)
    const have = ids.map((id) => captureById[id]).filter(Boolean)
    let rows = have
    if (have.length < ids.length) {
      const { data } = await supabase.from('marketing_captures').select('*').eq('company_id', companyId).in('id', ids)
      rows = ids.map((id) => have.find((c) => c.id === id) || (data || []).find((c) => c.id === id)).filter(Boolean)
    }
    setReopen({ initial: sbd, captures: rows })
    setDirecting(true)
  }
  const paintPictures = async (description, count) => {
    setPainting(true)
    const r = await invoke('marketing-image', { description, brand: multi ? postBrand || '' : '', count, aspect: 'vertical' })
    setPainting(false)
    if (!r.ok) { toast.error(r.error || 'Could not make pictures'); return false }
    onPictures(r.captures || [])
    toast.success(`Made ${(r.captures || []).length} picture${(r.captures || []).length === 1 ? '' : 's'}. They are in the inbox too.`)
    return true
  }
  // The editor's result replaces the post's videos with the one it made.
  const onEdited = (row) => {
    const keep = captureIds.filter((id) => captureById[id]?.media_type !== 'video')
    setShot((xs) => [...xs, row])
    setCaptureIds([...keep, row.id].slice(-5))
    setPrimaryId(row.id)
    setEditing(false)
  }
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  // Shoot straight into this post: the camera input uploads through the
  // same path as the inbox and the new capture is selected at once.
  const [shot, setShot] = useState([])          // captures made from inside the composer
  const [shooting, setShooting] = useState(false)
  const [shotPct, setShotPct] = useState(null)
  const camPhotoRef = useRef(null)
  const camVideoRef = useRef(null)
  const onShot = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setShooting(true)
    for (const file of files) {
      try {
        setShotPct(0)
        const row = await uploadCapture({ companyId, employeeId: currentEmployee?.id || null, jobId: initialPost?.job_id || null, file, source: 'shared', brand: multi ? postBrand || null : null, onProgress: (f) => setShotPct(Math.round(f * 100)) })
        if (row) { setShot((xs) => [...xs, row]); setCaptureIds((xs) => [...xs, row.id].slice(-5)) }
      } catch (err) { toast.error(err.message || 'Upload failed') }
    }
    setShooting(false)
    setShotPct(null)
  }
  const [extraMedia, setExtraMedia] = useState(initialPost && !(initialPost.capture_ids || []).length ? initialPost.media_urls || [] : [])

  // A post we are editing may reference captures already marked used; keep
  // their urls even though they are not in the inbox list.
  const captureById = useMemo(() => ({ ...captureMap, ...Object.fromEntries(captures.map((c) => [c.id, c])), ...Object.fromEntries(shot.map((c) => [c.id, c])) }), [captures, captureMap, shot])
  const mediaUrls = useMemo(() => {
    const fromCaptures = captureIds.map((id) => captureById[id]?.url).filter(Boolean)
    const known = new Set(fromCaptures)
    const kept = (initialPost?.media_urls || []).filter((u) => !known.has(u) && (initialPost?.capture_ids || []).length > 0 && captureIds.length === (initialPost?.capture_ids || []).length)
    return [...fromCaptures, ...kept, ...extraMedia]
  }, [captureIds, captureById, initialPost, extraMedia])
  const videoCaptures = captureIds.map((id) => captureById[id]).filter((c) => c?.media_type === 'video')
  const videoCapture = videoCaptures.find((c) => c.id === primaryId) || videoCaptures[0] || null
  // One post per video: same caption, each with one clip, saved as drafts.
  const splitVideos = async () => {
    if (videoCaptures.length < 2) return
    setSplitting(true)
    const rows = videoCaptures.map((c) => ({
      company_id: companyId, status: 'draft', caption: caption.trim(), ai_draft: aiDraft, hashtags: tagList, platforms,
      media_urls: [], capture_ids: [c.id], source: 'photo', job_id: initialPost?.job_id || c.job_id || null,
      scheduled_for: null, brand: postBrand || null, media_type: 'video', video_format: videoFormat, primary_capture_id: c.id,
      created_by: currentEmployee?.id || null,
    }))
    const { data, error } = await supabase.from('marketing_posts').insert(rows).select('id')
    if (error) { toast.error(error.message); setSplitting(false); return }
    if (initialPost) await supabase.from('marketing_posts').update({ status: 'archived' }).eq('id', initialPost.id).eq('company_id', companyId)
    toast.success(`${data.length} drafts in the queue, one per video.`)
    setSplitting(false)
    onSaved()
  }
  const mediaType = videoCapture ? 'video' : (initialPost?.media_type === 'video' ? 'video' : 'image')
  const tagList = hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean)
  const problems = platformProblems({ platforms, caption: composeCaption(caption, tagList), mediaUrls, mediaType })
  const unlinked = platforms.filter((p) => !linkedPlatforms.has(p))

  const draft = async () => {
    if (!captureIds.length && !note.trim()) { toast.error('Give the AI something to go on: pick a photo or say what happened.'); return }
    setDrafting(true)
    const r = await invoke('marketing-draft', { brand: postBrand || '', capture_ids: captureIds, note, platforms, job_id: initialPost?.job_id || captureIds.map((id) => captureById[id]?.job_id).find(Boolean) || null })
    setDrafting(false)
    if (!r.ok) { toast.error(r.error || 'Could not draft'); return }
    setCaption(r.caption || '')
    setHashtags((r.hashtags || []).join(' '))
    if (!aiDraft) setAiDraft(r.caption || '')
    if (r.best_capture_id) { setAiPick(r.best_capture_id); setPrimaryId(r.best_capture_id) }
  }

  const save = async (status) => {
    if (!caption.trim() && !mediaUrls.length) { toast.error('Write something or pick a photo first.'); return null }
    setSaving(true)
    const row = {
      company_id: companyId, status, caption: caption.trim(), ai_draft: aiDraft, hashtags: tagList, platforms,
      media_urls: mediaUrls, capture_ids: captureIds, source: captureIds.length ? 'photo' : 'manual',
      job_id: initialPost?.job_id || captureIds.map((id) => captureById[id]?.job_id).find(Boolean) || null,
      scheduled_for: when ? new Date(when).toISOString() : null,
      brand: postBrand || null,
      media_type: mediaType === 'video' ? 'video' : mediaUrls.length ? 'image' : 'text',
      video_format: mediaType === 'video' ? videoFormat : 'reel',
      primary_capture_id: mediaType === 'video' ? (primaryId || videoCaptures[0]?.id || null) : null,
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
    // A draft can be aimed at nothing yet; an approved post cannot, or the
    // queue's Publish has nowhere to send it.
    if (status === 'approved' && !platforms.length) {
      toast.error(linkedPlatforms.size ? 'Pick where it goes before approving.' : `${multi ? brands.find((b) => b.id === postBrand)?.name || 'This brand' : 'This company'} has no social accounts connected yet. Connect one under Channels, or save as a draft.`)
      return
    }
    const saved = await save(status)
    if (!saved) return
    if (thenPublish) { await onPublish(saved); onSaved(); return }
    toast.success(status === 'approved' ? 'Approved. A manager can publish it from the queue.' : 'Saved as draft')
    onSaved()
  }

  const inFuture = when && new Date(when) > new Date()
  const canPublish = isManager && problems.length === 0 && unlinked.length === 0 && platforms.length > 0
  const busyLabel = drafting ? 'Writing the post…' : shooting ? (shotPct != null && shotPct < 100 ? 'Sending' : 'Almost there…') : saving ? 'Saving…' : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }} onClick={onClose}>
      {busyLabel && <ScoutLoader overlay theme={theme} label={busyLabel} pct={shooting ? shotPct : null} sub={drafting ? 'Reading the photos and your brand kit.' : null} />}
      {editing && (
        <VideoEditor theme={theme} isMobile={isMobile} clips={videoCaptures} caption={caption} note={note} companyId={companyId} employeeId={currentEmployee?.id || null}
          brand={multi ? postBrand || null : null} jobId={initialPost?.job_id || null} invoke={invoke} onClose={() => setEditing(false)} onDone={onEdited} />
      )}
      {directing && (
        <StoryboardMaker theme={theme} isMobile={isMobile} captures={reopen ? reopen.captures : captureIds.map((id) => captureById[id]).filter(Boolean)} caption={caption} note={note}
          companyId={companyId} employeeId={currentEmployee?.id || null} brand={multi ? postBrand || null : null} brandInfo={brandInfo} jobId={initialPost?.job_id || null}
          invoke={invoke} initial={reopen?.initial || null} onPictures={onPictures} onClose={() => { setDirecting(false); setReopen(null) }} onDone={onDirected} />
      )}
      {viewing && (
        <div onClick={() => setViewing(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <button type="button" onClick={() => setViewing(null)} style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
          {viewing.video
            ? <video src={viewing.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '92vh', borderRadius: 10, background: '#000' }} />
            : <img src={viewing.url} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '92vh', borderRadius: 10, objectFit: 'contain' }} />}
        </div>
      )}
      {paintSheet && (
        <PictureMaker theme={theme} isMobile={isMobile} seed={note || caption || ''} busy={painting} invoke={invoke} onClose={() => setPaintSheet(false)}
          onMake={async (description, count) => { const ok = await paintPictures(description, count); if (ok) setPaintSheet(false) }} />
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 720, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, background: theme.bgCard, zIndex: 1 }}>
          <Sparkles size={18} color={MKT} />
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, flex: 1 }}>{initialPost ? 'Edit post' : 'New post'}</div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {multi && (
            <div>
              <div style={sectionLabel(theme)}>Posting as</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {brands.map((b) => (
                  <button key={b.id} type="button" onClick={() => setPostBrand(b.id)} style={chip(theme, postBrand === b.id)}>{b.name}</button>
                ))}
              </div>
            </div>
          )}
          {/* Media */}
          <div>
            <div style={sectionLabel(theme)}>Photos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {mediaUrls.map((u, i) => {
                const isVid = !!videoCapture && videoCapture.url === u
                return (
                  <div key={u + i} style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setViewing({ url: u, video: isVid })} title={isVid ? 'Play it, with sound' : 'See it full size'} style={{ position: 'relative', padding: 0, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', background: '#000', cursor: 'pointer', width: isVid ? 150 : 84, height: 84, display: 'block' }}>
                      {isVid
                        ? (captureThumb(videoCapture) ? <img src={captureThumb(videoCapture)} alt="" style={{ width: 150, height: 84, objectFit: 'cover', display: 'block', opacity: 0.85 }} /> : <VideoFrameTile src={u} size={84} style={{ width: 150 }} />)
                        : <img src={u} alt="" style={{ width: 84, height: 84, objectFit: 'cover', display: 'block' }} />}
                      {isVid && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={16} /></span></span>}
                      {isVid && videoCapture?.duration_s && <span style={{ position: 'absolute', bottom: 5, right: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.65)', borderRadius: 999, padding: '2px 6px' }}>{Math.round(videoCapture.duration_s)}s</span>}
                    </button>
                    <button type="button" onClick={() => { const id = captureIds.find((cid) => captureById[cid]?.url === u); if (id) setCaptureIds((xs) => xs.filter((x) => x !== id)); else setExtraMedia((xs) => xs.filter((x) => x !== u)) }} title="Remove from the post"
                      style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#2c3530', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                  </div>
                )
              })}
              {/* One Add button; the ways in live in its menu. */}
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => { setAddMenu((v) => !v); setShowPicker(false) }} disabled={shooting} style={{ width: 84, height: 84, borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600, border: `1px dashed ${MKT}`, background: MKT_BG, color: MKT }}>
                  {shooting ? <><Loader2 size={18} /> {shotPct != null && shotPct < 100 ? `${shotPct}%` : 'Sending…'}</> : <><Plus size={20} /> Add</>}
                </button>
                {addMenu && (
                  <div onMouseLeave={() => setAddMenu(false)} style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 5, background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', minWidth: 220, padding: 6, display: 'flex', flexDirection: 'column' }}>
                    {[
                      ['Take a photo', Camera, () => camPhotoRef.current?.click()],
                      ['Record a video', Play, () => camVideoRef.current?.click()],
                      ['From the inbox', ImageIcon, () => setShowPicker(true)],
                      ['AI picture, from a line', Sparkles, () => setPaintSheet(true)],
                    ].map(([label, Icon, go]) => (
                      <button key={label} type="button" onClick={() => { setAddMenu(false); go() }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: theme.text, fontSize: 13, borderRadius: 8 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgCardHover }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
                        <Icon size={16} color={MKT} /> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {canEditVideo() && (
                <button type="button" onClick={() => setDirecting(true)} title="The AI plans a short vertical video from these photos and clips and your line, with music and a narrator; the app makes it" style={{ width: 84, height: 84, borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600, border: 'none', background: '#2c3530', color: '#fff' }}>
                  <Clapperboard size={20} /> Make a video
                </button>
              )}
              <input ref={camPhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onShot} />
              <input ref={camVideoRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={onShot} />
            </div>
            {showPicker && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 8, background: theme.bg, borderRadius: 8 }}>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>{captures.length ? 'Tap what goes on the post.' : 'Inbox is empty. Add from the camera or make a picture.'}</span>
                  <button type="button" onClick={() => setShowPicker(false)} style={{ ...ghostBtn(theme), minHeight: 30, padding: '4px 10px', fontSize: 12 }}>Done</button>
                </div>
                {captures.map((c) => {
                  const on = captureIds.includes(c.id)
                  return (
                    <button key={c.id} type="button" onClick={() => setCaptureIds((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id].slice(-5)))} style={{ padding: 0, border: `2px solid ${on ? MKT : 'transparent'}`, borderRadius: 8, background: '#111', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                      {/* A video's poster, a photo's own file. A video with no
                          stills (texted in) gets a play glyph, not a broken image. */}
                      {captureThumb(c)
                        ? <img src={captureThumb(c)} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                        : c.media_type === 'video' && c.url
                          ? <VideoFrameTile src={c.url} size={72} />
                          : <div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}><ImageIcon size={18} /></div>}
                      {c.media_type === 'video' && <div style={{ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={10} /></div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {videoCaptures.length > 1 && (
            <div style={{ borderRadius: 10, padding: 12, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={15} /> Every network takes one video per post.</div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, lineHeight: 1.4 }}>Pick the one that carries this caption. The others go back to the inbox, or split this into {videoCaptures.length} posts and the AI writes each one.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {videoCaptures.map((c) => {
                  const on = (primaryId || videoCaptures[0]?.id) === c.id
                  return (
                    <button key={c.id} type="button" onClick={() => setPrimaryId(c.id)} style={{ position: 'relative', padding: 0, border: `3px solid ${on ? MKT : 'transparent'}`, borderRadius: 10, background: '#111', cursor: 'pointer', overflow: 'hidden', width: 96 }}>
                      {captureThumb(c) ? <img src={captureThumb(c)} alt="" style={{ width: 96, height: 72, objectFit: 'cover', display: 'block' }} /> : <VideoFrameTile src={c.url} size={72} />}
                      {on && <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: MKT, borderRadius: 999, padding: '2px 6px' }}>This one</div>}
                      {aiPick === c.id && <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.65)', borderRadius: 999, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}><Sparkles size={9} /> AI pick</div>}
                      {c.duration_s && <div style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.65)', borderRadius: 999, padding: '2px 6px' }}>{Math.round(c.duration_s)}s</div>}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {canEditVideo() && <button type="button" onClick={() => setEditing(true)} style={{ ...primaryBtn(MKT), minHeight: 36 }}><Scissors size={14} /> Cut them into one video</button>}
                <button type="button" onClick={splitVideos} disabled={splitting || !caption.trim()} title={caption.trim() ? '' : 'Draft or write the caption first'} style={{ ...ghostBtn(theme), minHeight: 36 }}>{splitting ? 'Splitting…' : `Split into ${videoCaptures.length} posts`}</button>
                <span style={{ fontSize: 11, color: '#92400e' }}>Vertical clips, 3 to 90 seconds, do best as Reels.</span>
              </div>
            </div>
          )}
          {mediaType === 'video' && videoCaptures.length === 1 && canEditVideo() && (() => {
            const plan = videoCapture?.source === 'generated' ? videoCapture?.storyboard : null
            const madeByAi = videoCapture?.source === 'generated'
            const musicLabel = !plan ? 'its own sound' : plan.music === 'track' && plan.track?.title ? plan.track.title : plan.music === 'own' ? 'your track' : plan.music === 'none' ? 'no music' : plan.music ? 'simple bed' : 'no music'
            const voiceLabel = !plan ? null : plan.voiceOn === false || !plan.script ? 'no narrator' : 'Arnie narrating'
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setViewing({ url: videoCapture.url, video: true })} style={ghostBtn(theme)}><Play size={14} /> Preview</button>
                  <button type="button" onClick={editVideo} style={primaryBtn(MKT)}>{plan?.sb ? <Clapperboard size={14} /> : <Scissors size={14} />} Edit video, music & voice</button>
                </div>
                <div style={{ fontSize: 12, color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Music size={13} color={theme.textMuted} /> <span>{musicLabel}</span>
                  {voiceLabel && <><span style={{ color: theme.textMuted }}>·</span> <Mic size={13} color={theme.textMuted} /> <span>{voiceLabel}</span></>}
                  {plan?.sb && <span style={{ color: theme.textMuted }}>· {plan.sb.scenes?.length || 0} scenes</span>}
                  {madeByAi && !plan?.sb && <span style={{ color: theme.textMuted }}>· made before plans were saved; Make a video again to get an editable one</span>}
                </div>
              </div>
            )
          })()}
          {mediaType === 'video' && (
            <div>
              <div style={sectionLabel(theme)}>Format</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['reel', 'Reel', 'Instagram Reel + Facebook Reel. Vertical works best, 3 to 90 seconds.'], ['video', 'Video post', 'A regular video in the Facebook feed. Instagram still gets a Reel.'], ['story', 'Story', 'Up for 24 hours on Instagram and Facebook. The caption is not shown.']].map(([id, label, hint]) => (
                  <button key={id} type="button" onClick={() => setVideoFormat(id)} title={hint} style={chip(theme, videoFormat === id)}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
                {videoFormat === 'reel' ? 'Instagram Reel and Facebook Reel. Vertical works best, 3 to 90 seconds.' : videoFormat === 'video' ? 'A regular video in the Facebook feed. Instagram still gets a Reel.' : 'Up for 24 hours on Instagram and Facebook. Stories do not show the caption.'}
              </div>
            </div>
          )}

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
                  <button key={p.id} type="button" onClick={() => { setPlatformsTouched(true); setPlatforms((xs) => (on ? xs.filter((x) => x !== p.id) : [...xs, p.id])) }}
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

// ── Brands editor ────────────────────────────────────────────────────
// The list of things this company markets. Most companies never open it:
// one brand, the company. HHH has three. A brand may name the business
// unit whose finished jobs feed it (so the nightly drafts land in the
// right voice); a brand with no unit (JobScout) only gets what people
// share into it by hand.
function BrandsEditor({ theme, isMobile, brands, company, businessUnits = [], isManager, onSave }) {
  const named = brands.filter((b) => b.id)
  const [open, setOpen] = useState(named.length > 0)
  const [rows, setRows] = useState(() => named.map((b) => ({ ...b })))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setRows(named.map((b) => ({ ...b }))) }, [brands]) // eslint-disable-line react-hooks/exhaustive-deps
  const units = (businessUnits || []).map((u) => (typeof u === 'string' ? u : u?.name)).filter(Boolean)
  const unitLogo = (name) => (businessUnits || []).find((u) => u && typeof u === 'object' && u.name === name)?.logo_url || ''
  const dirty = JSON.stringify(rows.map((r) => [r.name, r.unit || null, r.logo_url || ''])) !== JSON.stringify(named.map((r) => [r.name, r.unit || null, r.logo_url || '']))
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => setRows((rs) => [...rs, { id: '', name: '', unit: null, logo_url: '' }])
  const save = async () => {
    const list = rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id || slugify(r.name), name: r.name.trim(), unit: r.unit || null, logo_url: r.logo_url || '' }))
    const ids = list.map((r) => r.id)
    if (new Set(ids).size !== ids.length) { toast.error('Two brands have the same name.'); return }
    setSaving(true)
    await onSave(list)
    setSaving(false)
  }
  if (!isManager && !named.length) return null
  return (
    <Card theme={theme} title={named.length ? `Brands (${named.length})` : 'One brand'} right={
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...ghostBtn(theme), minHeight: 34, padding: '6px 10px', fontSize: 12 }}>{open ? 'Hide' : named.length ? 'Edit' : 'Market more than one thing?'}</button>
    }>
      {!open ? (
        <div style={{ fontSize: 13, color: theme.textSecondary }}>
          {named.length ? named.map((b) => b.name).join(' · ') : `Everything posts as ${company?.company_name || 'the company'}. Add brands if you market separate businesses with their own accounts.`}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>
            Each brand gets its own voice, its own connected accounts and its own queue. Tie a brand to a business unit and finished jobs from that unit are drafted in its voice. A brand with no unit only gets what people share into it.
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.4fr) auto', gap: 8, alignItems: 'center', padding: 10, borderRadius: 8, background: theme.bg, border: `1px solid ${theme.border}` }}>
              <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Brand name" disabled={!isManager} style={inputStyle(theme)} />
              <select value={r.unit || ''} onChange={(e) => setRow(i, { unit: e.target.value || null, logo_url: r.logo_url || unitLogo(e.target.value) })} disabled={!isManager} style={inputStyle(theme)}>
                <option value="">No business unit</option>
                {units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input value={r.logo_url || ''} onChange={(e) => setRow(i, { logo_url: e.target.value })} placeholder="Logo URL (optional)" disabled={!isManager} style={inputStyle(theme)} />
              {isManager && <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} title="Remove" style={{ ...ghostBtn(theme), padding: 8, minHeight: 40 }}><X size={14} /></button>}
            </div>
          ))}
          {isManager && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={add} style={ghostBtn(theme)}>Add a brand</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={save} disabled={saving || !dirty} style={{ ...primaryBtn(MKT), opacity: dirty ? 1 : 0.5 }}>{saving ? 'Saving…' : 'Save brands'}</button>
            </div>
          )}
          {named.length === 0 && rows.length > 0 && <div style={{ fontSize: 12, color: '#b45309' }}>Saving moves what is already set up (voice, connected accounts) onto the first brand in the list.</div>}
        </>
      )}
    </Card>
  )
}

// ── Page pickers ─────────────────────────────────────────────────────
// A Facebook login can reach several Pages and a LinkedIn login several
// company pages. The vendor only guesses when there is exactly one, so
// the brand says which. Publishing to that network refuses until it does.
function PagePickers({ theme, brand, invoke, isManager, status }) {
  const [pages, setPages] = useState(null)   // { facebook: [], linkedin: [], chosen }
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    invoke('marketing-publish', { action: 'pages', brand }).then((r) => { if (!cancelled && r?.ok) setPages(r) })
    return () => { cancelled = true }
  }, [invoke, brand, status])
  const choose = async (patch) => {
    setBusy(true)
    const r = await invoke('marketing-publish', { action: 'set_pages', brand, ...patch })
    setBusy(false)
    if (!r.ok) { toast.error(r.error || 'Could not save'); return }
    setPages((p) => ({ ...(p || {}), chosen: r.chosen }))
    toast.success('Saved')
  }
  if (!pages) return null
  const fb = pages.facebook || [], li = pages.linkedin || []
  if (fb.length < 2 && li.length < 2) return null
  const sel = (theme) => ({ ...inputStyle(theme), minHeight: 40, padding: '8px 10px' })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, padding: 10, borderRadius: 8, background: theme.bg, border: `1px solid ${theme.border}` }}>
      {fb.length > 1 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>Facebook posts go to</span>
          <select value={pages.chosen?.facebook_page_id || ''} disabled={!isManager || busy} onChange={(e) => choose({ facebook_page_id: e.target.value })} style={sel(theme)}>
            <option value="">Pick a Page…</option>
            {fb.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!pages.chosen?.facebook_page_id && <span style={{ fontSize: 11, color: '#b45309' }}>This login reaches {fb.length} Pages. Facebook posts wait until you pick one.</span>}
        </label>
      )}
      {li.length > 1 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>LinkedIn posts go to</span>
          <select value={pages.chosen?.linkedin_page_id || ''} disabled={!isManager || busy} onChange={(e) => choose({ linkedin_page_id: e.target.value })} style={sel(theme)}>
            <option value="">Pick a page…</option>
            <option value="personal">Personal profile</option>
            {li.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!pages.chosen?.linkedin_page_id && <span style={{ fontSize: 11, color: '#b45309' }}>This login reaches {li.length} company pages. LinkedIn posts wait until you pick one.</span>}
        </label>
      )}
    </div>
  )
}

// ── Website & Google Ads ─────────────────────────────────────────────
// Everything a brand runs, one tap away. Google Ads is a link and an
// account id for now: live spend needs Google's developer token, which is
// applied for separately; when it lands, the numbers slot in here.
function LinksCard({ theme, isMobile, kit, brandName, isManager, onSave, company, companyLinks, onPushToCompany }) {
  const links = kit?.links || {}
  // What the company settings already say (Settings → Company): website,
  // Google place (listing + review link). Pull them in with one tap, or
  // push this brand's links back to the company when they are the same thing.
  const fromCompany = {
    website: companyLinks?.website || '',
    google_business: companyLinks?.google_place_id ? `https://www.google.com/maps/place/?q=place_id:${companyLinks.google_place_id}` : '',
    reviews: companyLinks?.google_review_url || (companyLinks?.google_place_id ? `https://search.google.com/local/writereview?placeid=${companyLinks.google_place_id}` : ''),
  }
  const companyHas = Object.values(fromCompany).some(Boolean)
  const differs = Object.entries(fromCompany).some(([k, v]) => v && (links[k] || '') !== v)
  const matches = companyHas && !differs
  const pull = () => onSave({ links: { ...links, ...Object.fromEntries(Object.entries(fromCompany).filter(([, v]) => v)) } })
  const Field = ({ name, label, placeholder }) => {
    const [v, setV] = useState(links[name] || '')
    useEffect(() => { setV(links[name] || '') }, [links[name]]) // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>{label}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if ((v || '') !== (links[name] || '')) onSave({ links: { ...links, [name]: v.trim() } }) }} placeholder={placeholder} disabled={!isManager} style={inputStyle(theme)} />
          {v && <a href={/^https?:/.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn(theme), padding: 8 }}><ExternalLink size={14} /></a>}
        </div>
      </label>
    )
  }
  return (
    <Card theme={theme} title={`${brandName ? brandName + ' · ' : ''}Website & listings`}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <Field name="website" label="Website" placeholder="https://" />
        <Field name="google_business" label="Google Business listing" placeholder="https://g.page/…" />
        <Field name="booking" label="Booking / quote page" placeholder="https://" />
        <Field name="reviews" label="Leave-a-review link" placeholder="https://g.page/r/…/review" />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {isManager && companyHas && !matches && <button type="button" onClick={pull} style={ghostBtn(theme)}><RotateCcw size={14} /> Use the company settings</button>}
        {isManager && (links.website || links.google_business || links.reviews) && onPushToCompany && <button type="button" onClick={() => onPushToCompany(links)} style={ghostBtn(theme)}><Check size={14} /> Save these to company settings</button>}
        <span style={{ fontSize: 12, color: theme.textMuted }}>
          {matches ? 'Matches the company settings.' : companyHas ? 'The company settings have different links; pull them in or save these over them.' : 'Nothing saved under Settings → Company yet; saving these fills it.'} The AI uses the website as the call-to-action link when the brand kit has no other.
        </span>
      </div>
    </Card>
  )
}

function AdsCard({ theme, isMobile, kit, isManager, onSave }) {
  const ads = kit?.ads || {}
  const [cid, setCid] = useState(ads.google_ads_customer_id || '')
  useEffect(() => { setCid(ads.google_ads_customer_id || '') }, [ads.google_ads_customer_id])
  const clean = cid.replace(/[^\d]/g, '')
  const url = clean ? `https://ads.google.com/aw/overview?ocid=${clean}` : 'https://ads.google.com/'
  return (
    <Card theme={theme} title="Google Ads" right={<a href={url} target="_blank" rel="noreferrer" style={ghostBtn(theme)}><ExternalLink size={14} /> Open Google Ads</a>}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.4fr)', gap: 10, alignItems: 'start' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.textSecondary }}>Customer ID</span>
          <input value={cid} onChange={(e) => setCid(e.target.value)} onBlur={() => { if ((cid || '') !== (ads.google_ads_customer_id || '')) onSave({ ads: { ...ads, google_ads_customer_id: cid.trim() } }) }} placeholder="123-456-7890" disabled={!isManager} style={inputStyle(theme)} />
        </label>
        <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>
          Spend and conversions will show here once Google grants JobScout an Ads API developer token (a one-time application, weeks). Until then this is the door to the account. Paid social from the posts here is a later phase.
        </div>
      </div>
    </Card>
  )
}

// ── Calendar ─────────────────────────────────────────────────────────
// The month, with every post on the day it went out, is due, or was
// written. A cadence target per brand (posts a week) makes the gaps
// obvious; the suggester keeps drafting toward it.
function CalendarTab({ theme, isMobile, posts, captureMap, kit, isManager, onCadence, onOpen, onNewOn }) {
  const today = new Date()
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const byDay = useMemo(() => postsByDay(posts), [posts])
  const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym])
  const week = weekProgress(posts, kit?.cadence_per_week || 0, today)
  const todayKey = postDay({ status: 'draft', created_at: today })
  const thisWeek = new Set(weekOf(today))
  const label = new Date(ym.y, ym.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const move = (d) => setYm(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() } })
  const dot = (p) => (STATUS_STYLE[p.status] || STATUS_STYLE.draft).color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ fontSize: 13, color: theme.text, flex: 1, minWidth: 200 }}>
          <b>This week:</b> {week.counted} posted or scheduled{week.drafts ? `, ${week.drafts} waiting for approval` : ''}
          {week.target ? (week.met ? '. Target met.' : `. ${week.remaining} more to hit ${week.target} a week.`) : '.'}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.textSecondary }}>
          Target per week
          <select value={kit?.cadence_per_week || 0} disabled={!isManager} onChange={(e) => onCadence(Number(e.target.value))} style={{ ...inputStyle(theme), width: 'auto', minHeight: 36, padding: '6px 10px' }}>
            {[0, 1, 2, 3, 4, 5, 7].map((n) => <option key={n} value={n}>{n === 0 ? 'none' : n}</option>)}
          </select>
        </label>
      </div>
      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 8 : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => move(-1)} style={{ ...ghostBtn(theme), padding: 8, minHeight: 36 }}><ChevronLeft size={16} /></button>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1, textAlign: 'center' }}>{label}</div>
          <button type="button" onClick={() => move(1)} style={{ ...ghostBtn(theme), padding: 8, minHeight: 36 }}><ChevronRight size={16} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
          {cells.map((c, i) => {
            if (!c) return <div key={`b${i}`} />
            const list = byDay[c.key] || []
            const isToday = c.key === todayKey
            const inWeek = thisWeek.has(c.key)
            return (
              <div key={c.key} onClick={() => (isManager && !list.length ? onNewOn(c.key) : null)} style={{ minHeight: isMobile ? 54 : 84, borderRadius: 8, padding: 4, border: `1px solid ${isToday ? MKT : theme.border}`, background: inWeek ? MKT_BG.replace('0.10', '0.05') : theme.bg, cursor: isManager && !list.length ? 'pointer' : 'default', overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? MKT : theme.textSecondary }}>{c.day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  {list.slice(0, isMobile ? 2 : 3).map((p) => {
                    const cap = (p.capture_ids || []).map((id) => captureMap[id]).find(Boolean)
                    const thumb = (p.media_urls || [])[0] || captureThumb(cap)
                    return (
                      <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); onOpen(p) }} title={p.caption} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 2, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', minHeight: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot(p), flexShrink: 0 }} />
                        {thumb && !isMobile ? <img src={thumb} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} /> : null}
                        {!isMobile && <span style={{ fontSize: 10, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.caption || 'Untitled').slice(0, 24)}</span>}
                      </button>
                    )
                  })}
                  {list.length > (isMobile ? 2 : 3) && <div style={{ fontSize: 10, color: theme.textMuted }}>+{list.length - (isMobile ? 2 : 3)}</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: theme.textMuted }}>
          {Object.entries(STATUS_STYLE).filter(([k]) => k !== 'archived').map(([k, v]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} /> {v.label}</span>)}
          <span style={{ marginLeft: 'auto' }}>Tap an empty day to schedule a post there.</span>
        </div>
      </div>
    </div>
  )
}

// ── Performance ──────────────────────────────────────────────────────
// What the posts did. Metrics come from the publisher's cached analytics,
// keyed to our posts by the native post id each network gave back.
function PerformanceTab({ theme, isMobile, posts, captureMap, brand, invoke, publisher }) {
  const [metrics, setMetrics] = useState(null)      // per-post, from the vendor's snapshot cache (fills in over days)
  const [networks, setNetworks] = useState(null)    // per-network 30-day numbers, live from the networks
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!publisher?.profile_username) { setMetrics([]); setNetworks({}); return }
    setLoading(true); setErr(null)
    const [a, p] = await Promise.all([
      invoke('marketing-publish', { action: 'analytics', brand }),
      invoke('marketing-publish', { action: 'profile_analytics', brand }),
    ])
    setLoading(false)
    if (!a.ok && !p.ok) { setErr(a.error || p.error || 'Could not load'); setMetrics([]); setNetworks({}); return }
    setMetrics(a.ok ? (a.metrics || []) : [])
    setNetworks(p.ok ? (p.networks || {}) : {})
  }, [invoke, brand, publisher])
  useEffect(() => { load() }, [load])
  const netList = Object.entries(networks || {}).filter(([, v]) => v && !v.error)
  const sum = (k) => netList.reduce((n, [, v]) => n + (v[k] || 0), 0)

  const byKey = useMemo(() => Object.fromEntries((metrics || []).map((m) => [`${m.platform}:${m.post_id}`, m])), [metrics])
  const posted = posts.filter((p) => p.status === 'posted' && p.ayrshare_id)
  const rows = posted.map((p) => {
    const per = (p.post_urls || []).map((u) => ({ ...u, metrics: byKey[`${u.platform}:${u.id}`]?.m || null }))
    const sum = (k) => per.reduce((n, x) => n + (x.metrics?.[k] || 0), 0)
    return { p, per, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), any: per.some((x) => x.metrics) }
  }).sort((a, b) => (b.views + b.likes * 5) - (a.views + a.likes * 5))
  const totals = rows.reduce((t, r) => ({ views: t.views + r.views, likes: t.likes + r.likes, comments: t.comments + r.comments, shares: t.shares + r.shares }), { views: 0, likes: 0, comments: 0, shares: 0 })
  const handTotal = posts.filter((p) => p.status === 'posted' && !p.ayrshare_id).length
  const Stat = ({ label, value }) => (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{value.toLocaleString()}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 10 }}>
        <Stat label="Posts" value={posted.length + handTotal} />
        <Stat label="Followers" value={sum('followers')} />
        <Stat label="Reach · 30 days" value={sum('reach')} />
        <Stat label="Views · 30 days" value={sum('views')} />
        <Stat label="Likes · 30 days" value={sum('likes')} />
      </div>

      {/* Each network's own numbers, with the last 30 days of reach as bars */}
      {netList.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {netList.map(([platform, v]) => {
            const series = v.reach_series || []
            const max = Math.max(1, ...series.map((x) => x.value || 0))
            const peak = series.reduce((b, x) => (x.value > (b?.value || 0) ? x : b), null)
            return (
              <div key={platform} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, flex: 1 }}>{PLATFORM_BY_ID[platform]?.label || platform}</div>
                  {v.followers != null && <div style={{ fontSize: 12, color: theme.textMuted }}>{v.followers.toLocaleString()} followers</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, marginBottom: 8 }}>
                  {[['reach', 'reach'], ['views', 'views'], ['likes', 'likes'], ['comments', 'cmts']].map(([k, l]) => (
                    <div key={k}><div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{v[k] != null ? v[k].toLocaleString() : '–'}</div><div style={{ fontSize: 10, color: theme.textMuted }}>{l}</div></div>
                  ))}
                </div>
                {series.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
                      {series.map((x) => <div key={x.date} title={`${x.date}: ${x.value}`} style={{ flex: 1, height: `${Math.max(2, (x.value / max) * 100)}%`, background: x === peak ? MKT : theme.border, borderRadius: 2 }} />)}
                    </div>
                    <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>Daily reach, last 30 days{peak?.value ? ` · best ${fmtWhen(peak.date + 'T12:00:00').replace(/, .*$/, '')} (${peak.value})` : ''}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textMuted }}>
        {loading ? <ScoutLoader theme={theme} label="Reading the networks…" size={40} style={{ padding: 0 }} /> : err ? <span style={{ color: '#ef4444' }}>{err}</span> : metrics && metrics.length === 0 && posted.length ? 'Per-post numbers arrive from the networks over the first days after a post; the network totals above are live.' : handTotal ? `${handTotal} post${handTotal === 1 ? '' : 's'} went out by hand; those have no numbers here.` : ''}
        <button type="button" onClick={load} disabled={loading} style={{ ...ghostBtn(theme), marginLeft: 'auto', minHeight: 34, padding: '6px 10px' }}><RefreshCw size={13} /> Refresh</button>
      </div>
      {rows.length === 0 ? (
        <Empty theme={theme} icon={BarChart3} title="Nothing published yet" body="Once posts go out through the publisher, views, likes, comments and shares show here per post and per network." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(({ p, per, views, likes, comments, shares, any }) => {
            const cap = (p.capture_ids || []).map((id) => captureMap[id]).find(Boolean)
            const thumb = (p.media_urls || [])[0] || captureThumb(cap)
            return (
              <div key={p.id} style={{ display: 'flex', gap: 12, padding: 10, background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, alignItems: 'center' }}>
                {thumb ? <img src={thumb} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 56, height: 56, borderRadius: 8, background: theme.bg, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || 'Untitled'}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <span>{fmtWhen(p.posted_at)}</span>
                    {per.map((u) => (
                      <a key={u.platform + u.id} href={u.postUrl || '#'} target="_blank" rel="noreferrer" style={{ color: u.postUrl ? '#3b82f6' : theme.textMuted, textDecoration: 'none' }}>
                        {PLATFORM_BY_ID[u.platform]?.label || u.platform}{u.metrics ? ` ${(u.metrics.views || 0).toLocaleString()}v · ${(u.metrics.likes || 0).toLocaleString()}♥` : ''}
                      </a>
                    ))}
                  </div>
                </div>
                {!isMobile && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 56px)', gap: 4, textAlign: 'center', flexShrink: 0 }}>
                    {[['views', views], ['likes', likes], ['cmts', comments], ['shares', shares]].map(([l, v]) => (
                      <div key={l}><div style={{ fontSize: 15, fontWeight: 700, color: any ? theme.text : theme.textMuted }}>{any ? v.toLocaleString() : '–'}</div><div style={{ fontSize: 10, color: theme.textMuted }}>{l}</div></div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Library ──────────────────────────────────────────────────────────
// Everything ever shot or written, filed by the system: brand, then kind
// (videos, photos, scripts), then month, with tags nobody typed — the job's
// service, who shot it, how it arrived, whether it has been used. Search
// runs across all of it. Pick photos to make a post; reuse a script.
function LibraryTab({ theme, isMobile, companyId, brands, brand, employees, isManager, onMakePost, onReuse }) {
  const [caps, setCaps] = useState(null)
  const [posts, setPosts] = useState([])
  const [kind, setKind] = useState('all')          // all | video | photo | script
  const [month, setMonth] = useState('all')
  const [tag, setTag] = useState(null)
  const [q, setQ] = useState('')
  const [showDismissed, setShowDismissed] = useState(false)
  const [selected, setSelected] = useState([])
  const multi = brands.length > 1
  const empName = useMemo(() => Object.fromEntries((employees || []).map((e) => [e.id, e.name])), [employees])

  const load = useCallback(async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('marketing_captures').select('*, job:jobs(job_title, service_type, business_unit)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(600),
      supabase.from('marketing_posts').select('id, status, caption, hashtags, brand, created_at, posted_at, approved_at, capture_ids, media_type, job_id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(600),
    ])
    setCaps(await signPrivateCaptures(c || []))
    setPosts(p || [])
  }, [companyId])
  useEffect(() => { load() }, [load])

  // The brand a capture belongs to: its own, else its post's, else its job's unit.
  const postByCap = useMemo(() => { const m = {}; for (const p of posts) for (const id of p.capture_ids || []) m[id] = p; return m }, [posts])
  const brandOf = (c) => c.brand ?? postByCap[c.id]?.brand ?? (multi ? brandForUnit(brands, c.job?.business_unit) : '') ?? null
  const brandName = (id) => brands.find((b) => b.id === (id || ''))?.name || (id == null ? 'Unfiled' : id)

  const SOURCE = { text: 'texted in', shared: 'from the field', suggested: 'from a job', upload: 'uploaded' }
  const items = useMemo(() => {
    const out = []
    for (const c of caps || []) {
      const b = brandOf(c)
      const used = !!postByCap[c.id]
      const tags = [
        c.media_type === 'video' ? 'video' : 'photo',
        SOURCE[c.source] || c.source,
        used ? 'used' : 'unused',
        c.job?.service_type, c.job?.business_unit,
        empName[c.employee_id] ? `by ${empName[c.employee_id]}` : null,
        c.media_type === 'video' && c.duration_s ? (c.duration_s < 15 ? 'short clip' : c.duration_s < 60 ? 'under a minute' : 'long video') : null,
      ].filter(Boolean)
      out.push({ id: `c${c.id}`, kind: c.media_type === 'video' ? 'video' : 'photo', when: c.created_at, month: monthKey(c.created_at), brand: b, thumb: captureThumb(c), url: c.url, title: c.note || c.job?.job_title || (c.media_type === 'video' ? 'Video' : 'Photo'), sub: `${fmtWhen(c.created_at)}${c.job?.job_title ? ' · ' + c.job.job_title : ''}`, tags, text: [c.note, c.job?.job_title, c.job?.service_type, empName[c.employee_id]].filter(Boolean).join(' ').toLowerCase(), cap: c, dismissed: c.status === 'dismissed', used })
    }
    for (const p of posts) {
      if (!['approved', 'scheduled', 'posted'].includes(p.status) || !(p.caption || '').trim()) continue
      const when = p.posted_at || p.approved_at || p.created_at
      const tags = ['script', p.status === 'posted' ? 'went out' : p.status, p.media_type === 'video' ? 'for video' : null].filter(Boolean)
      out.push({ id: `p${p.id}`, kind: 'script', when, month: monthKey(when), brand: p.brand || '', thumb: null, title: p.caption, sub: `${fmtWhen(when)} · ${(p.hashtags || []).map((h) => '#' + h).join(' ')}`, tags, text: `${p.caption} ${(p.hashtags || []).join(' ')}`.toLowerCase(), post: p, dismissed: false, used: true })
    }
    return out.sort((a, b) => new Date(b.when) - new Date(a.when))
  }, [caps, posts, brands, empName]) // eslint-disable-line react-hooks/exhaustive-deps

  const inBrand = items.filter((it) => !multi || (it.brand || '') === (brand || '') || (it.brand == null && kind !== 'script'))
  const months = [...new Set(inBrand.map((it) => it.month))]
  const tagCounts = inBrand.reduce((m, it) => { for (const t of it.tags) m[t] = (m[t] || 0) + 1; return m }, {})
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 14)
  const needle = q.trim().toLowerCase()
  const shown = inBrand.filter((it) => (kind === 'all' || it.kind === kind) && (month === 'all' || it.month === month) && (!tag || it.tags.includes(tag)) && (!needle || it.text.includes(needle)) && (showDismissed || !it.dismissed))
  const counts = { video: inBrand.filter((i) => i.kind === 'video' && !i.dismissed).length, photo: inBrand.filter((i) => i.kind === 'photo' && !i.dismissed).length, script: inBrand.filter((i) => i.kind === 'script').length }
  const unfiled = multi ? items.filter((it) => it.brand == null && !it.dismissed).length : 0

  const toggle = (it) => { if (it.kind === 'script') return; setSelected((xs) => (xs.includes(it.cap.id) ? xs.filter((x) => x !== it.cap.id) : [...xs, it.cap.id].slice(-5))) }
  const setStatus = async (c, status) => { await supabase.from('marketing_captures').update({ status }).eq('id', c.id).eq('company_id', companyId); load() }
  const fileUnder = async (c, brandId) => { await supabase.from('marketing_captures').update({ brand: brandId || null }).eq('id', c.id).eq('company_id', companyId); load() }
  const download = async (it) => {
    try {
      const res = await fetch(it.url); const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = it.cap.path.split('/').pop() || 'file'; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch { window.open(it.url, '_blank') }
  }

  if (caps === null) return <ScoutLoader theme={theme} label="Opening the library…" />
  const folder = (id, label, Icon, n) => (
    <button key={id} type="button" onClick={() => setKind(id)} style={{ ...chip(theme, kind === id), gap: 6 }}><Icon size={14} /> {label}{n != null ? <span style={{ fontSize: 11, opacity: 0.75 }}>{n}</span> : null}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220, background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '0 12px', minHeight: 40 }}>
          <Search size={14} color={theme.textMuted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, jobs, captions, who shot it…" style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13, color: theme.text, minHeight: 38 }} />
          {q && <button type="button" onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: theme.textMuted }}><X size={14} /></button>}
        </div>
        {selected.length > 0 && <button type="button" onClick={() => { onMakePost(selected); setSelected([]) }} style={primaryBtn(MKT)}><Sparkles size={15} /> Make a post from {selected.length}</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {folder('all', 'Everything', FolderOpen, null)}
        {folder('video', 'Videos', Film, counts.video)}
        {folder('photo', 'Photos', ImageIcon, counts.photo)}
        {folder('script', 'Scripts', FileText, counts.script)}
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle(theme), width: 'auto', minHeight: 36, padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <label style={{ fontSize: 12, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> show dismissed
        </label>
      </div>
      {topTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.textMuted }}>Filed as</span>
          {topTags.map(([t, n]) => (
            <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} style={{ ...chip(theme, tag === t), minHeight: 30, padding: '4px 10px', fontSize: 11 }}>{t} <span style={{ opacity: 0.6 }}>{n}</span></button>
          ))}
        </div>
      )}
      {unfiled > 0 && kind !== 'script' && (
        <div style={{ fontSize: 12, color: '#b45309', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '8px 10px' }}>
          {unfiled} item{unfiled === 1 ? '' : 's'} could not be filed under a brand on their own (no job, no post yet). They show under every brand until you file them from the tile.
        </div>
      )}
      {shown.length === 0 ? (
        <Empty theme={theme} icon={FolderOpen} title={q || tag ? 'Nothing matches' : 'Library is empty'} body="Everything shot in the field, texted in, uploaded, or written as a post files itself here by brand, kind and month." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {shown.map((it) => {
            const on = it.cap && selected.includes(it.cap.id)
            return (
              <div key={it.id} style={{ borderRadius: 10, overflow: 'hidden', border: `2px solid ${on ? MKT : theme.border}`, background: theme.bgCard, opacity: it.dismissed ? 0.55 : 1, display: 'flex', flexDirection: 'column' }}>
                {it.kind === 'script' ? (
                  <div style={{ padding: 10, fontSize: 12, color: theme.text, lineHeight: 1.4, minHeight: 120, maxHeight: 150, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{it.title}</div>
                ) : (
                  <button type="button" onClick={() => toggle(it)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: '#111', cursor: 'pointer', position: 'relative' }}>
                    {it.thumb ? <img src={it.thumb} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} /> : it.kind === 'video' && it.url ? <VideoFrameTile src={it.url} size={130} /> : <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}><ImageIcon size={20} /></div>}
                    {it.kind === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={14} /></div></div>}
                    {on && <div style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: '50%', background: MKT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={13} /></div>}
                    {it.used && <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(34,197,94,0.85)', borderRadius: 999, padding: '2px 6px' }}>used</div>}
                  </button>
                )}
                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {it.kind !== 'script' && <div style={{ fontSize: 12, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>}
                  <div style={{ fontSize: 10, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {it.tags.slice(0, 3).map((t) => <span key={t} style={{ fontSize: 10, color: theme.textSecondary, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '1px 6px' }}>{t}</span>)}
                    {multi && it.brand != null && <span style={{ fontSize: 10, color: MKT, background: MKT_BG, borderRadius: 999, padding: '1px 6px' }}>{brandName(it.brand)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 'auto', alignItems: 'center' }}>
                    {it.kind === 'script'
                      ? <button type="button" onClick={() => onReuse(it.post)} style={{ ...ghostBtn(theme), minHeight: 30, padding: '4px 8px', fontSize: 11 }}><RotateCcw size={12} /> Reuse</button>
                      : <>
                          <button type="button" onClick={() => download(it)} title="Download" style={{ ...ghostBtn(theme), minHeight: 30, padding: '4px 8px', fontSize: 11 }}><Download size={12} /></button>
                          {multi && it.brand == null && isManager && (
                            <select defaultValue="" onChange={(e) => fileUnder(it.cap, e.target.value)} style={{ ...inputStyle(theme), minHeight: 30, padding: '2px 6px', fontSize: 11, width: 'auto' }}>
                              <option value="" disabled>File under…</option>
                              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          )}
                          <div style={{ flex: 1 }} />
                          {isManager && (it.dismissed
                            ? <button type="button" onClick={() => setStatus(it.cap, 'new')} title="Restore" style={{ ...ghostBtn(theme), minHeight: 30, padding: '4px 8px', fontSize: 11 }}>Restore</button>
                            : !it.used && <button type="button" onClick={() => setStatus(it.cap, 'dismissed')} title="Dismiss" style={{ ...ghostBtn(theme), minHeight: 30, padding: '4px 8px', fontSize: 11 }}><X size={12} /></button>)}
                        </>}
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

// ── Soundtrack (shared by the clip editor and the AI video maker) ───
// Music the app makes itself (nothing to license), the company's own
// track, or none; and a narrator read by ElevenLabs through marketing-voice.
// Mirrors VOICES in supabase/functions/marketing-voice; shown until the server answers.
const STOCK_VOICES = [['Bill', 'pqHfZKP75CvOlQylNhV4'], ['Rachel', '21m00Tcm4TlvDq8ikWAM'], ['Adam', 'pNInz6obpgDQGcFmaJgB'], ['Sarah', 'EXAVITQu4vr4xnSDxMaL'], ['Brian', 'nPczCjzI2devNBz1zQrb'], ['Drew', '29vD33N1CtxCmqQRPOHJ'], ['Antoni', 'ErXwobaYiN019PkySvjV'], ['Domi', 'AZnzlk1XvdvUeBnXmlld'], ['Charlie', 'IKne3meq5aSn9XLyUdCD']].map(([name, id]) => ({ id, name, category: 'premade', preview_url: null }))

function useSoundtrack({ invoke, brand, autoMood = 'calm', initialMusic = 'none', initialVoiceOn = false, initialMusicGain = 0.6, initialVoiceId = null, initialScript = '', initialTrack = null, initialMusicPrompt = '' }) {
  const [music, setMusic] = useState(initialMusic)      // track | auto | calm | upbeat | bold | own | none
  const [musicGain, setMusicGain] = useState(initialMusicGain)
  // Real music: a track ElevenLabs composed for this video (or one from the
  // company's library). The synthesised beds (auto/calm/upbeat/bold) are the
  // fallback when the server has no key.
  const [musicStatus, setMusicStatus] = useState(null)  // { available }
  const [tracks, setTracks] = useState([])              // the company's library
  const [track, setTrack] = useState(initialTrack)      // the chosen row { id, title, url, seconds }
  const [musicPrompt, setMusicPrompt] = useState(initialMusicPrompt || '')
  const [composing, setComposing] = useState(false)
  const [musicError, setMusicError] = useState(null)
  useEffect(() => {
    invoke('marketing-music', { action: 'status' }).then((r) => setMusicStatus(r?.ok ? r : { available: false }))
    invoke('marketing-music', { action: 'list' }).then((r) => { if (r?.ok) setTracks(r.tracks || []) })
  }, [invoke])
  const composeTrack = async (seconds, title = '') => {
    setComposing(true); setMusicError(null)
    const r = await invoke('marketing-music', { action: 'compose', prompt: musicPrompt.trim(), mood: ['calm', 'upbeat', 'bold'].includes(autoMood) && !musicPrompt.trim() ? autoMood : (musicPrompt.trim() ? 'custom' : 'calm'), seconds: Math.max(5, Math.ceil(seconds || 30)), brand: brand || '', title })
    setComposing(false)
    if (!r.ok) { setMusicError(r.error || 'Could not compose'); toast.error(r.error || 'Could not compose'); return null }
    setTracks((xs) => [r.track, ...xs]); setTrack(r.track); setMusic('track')
    toast.success(`Composed "${r.track.title}".`)
    return r.track
  }
  const pickTrack = (row) => { setTrack(row); setMusic('track') }
  const removeTrack = async (row) => {
    const r = await invoke('marketing-music', { action: 'delete', id: row.id })
    if (!r.ok) { toast.error(r.error || 'Could not remove'); return }
    setTracks((xs) => xs.filter((t) => t.id !== row.id)); if (track?.id === row.id) { setTrack(null); setMusic('none') }
  }
  const [ownTrack, setOwnTrack] = useState(null)        // { name, arrayBuffer }
  const trackRef = useRef(null)
  const [voiceOn, setVoiceOn] = useState(initialVoiceOn)
  const [voiceStatus, setVoiceStatus] = useState(null)  // { available, voices:[{id,name,category,preview_url}], from }
  const [voiceId, setVoiceId] = useState(initialVoiceId || STOCK_VOICES[0].id)
  const [script, setScript] = useState(initialScript || '')
  const [voiceUrl, setVoiceUrl] = useState(null)        // generated mp3 for the current script
  const [voicing, setVoicing] = useState(false)
  const [preview, setPreview] = useState(null)          // { kind: 'music'|'voice', pause }
  useEffect(() => { invoke('marketing-voice', { action: 'status' }).then((r) => setVoiceStatus(r?.ok ? r : { available: false, voices: [] })) }, [invoke])
  useEffect(() => { setVoiceUrl(null) }, [script, voiceId])
  const voices = voiceStatus?.voices?.length ? voiceStatus.voices : STOCK_VOICES
  // If the account list came back without the stock default, start on its first voice.
  useEffect(() => { if (voiceStatus?.voices?.length && !voiceStatus.voices.some((v) => v.id === voiceId)) setVoiceId(voiceStatus.voices[0].id) }, [voiceStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  const effectiveMood = music === 'auto' ? (autoMood || 'calm') : music
  const stopPreview = () => { try { preview?.pause() } catch { /* ignore */ } setPreview(null) }
  const previewMusic = async () => {
    stopPreview()
    const AC = window.AudioContext || window.webkitAudioContext
    const ac = new AC(); await ac.resume()
    if (music === 'track' && track?.url) {
      try { await ac.close() } catch { /* ignore */ }
      const a = new Audio(track.url); a.volume = Math.max(0, Math.min(1, musicGain)); a.play().catch(() => {})
      const p = { kind: 'music', pause: () => a.pause() }
      setPreview(p); a.onended = () => setPreview((x) => (x === p ? null : x))
      return
    }
    const buf = music === 'own' && ownTrack ? await decodeTrack(ownTrack.arrayBuffer, 8) : await renderMusicBed({ mood: effectiveMood, seconds: 8 })
    const src = ac.createBufferSource(); src.buffer = buf; const g = ac.createGain(); g.gain.value = musicGain; src.connect(g); g.connect(ac.destination); src.start()
    const fake = { kind: 'music', pause: () => { try { src.stop(); ac.close() } catch { /* ignore */ } } }
    setPreview(fake); src.onended = () => { setPreview((p) => (p === fake ? null : p)); try { ac.close() } catch { /* ignore */ } }
  }
  const makeVoice = async () => {
    if (!script.trim()) return null
    setVoicing(true)
    const r = await invoke('marketing-voice', { text: script.trim(), voice: voiceId, brand: brand || '' })
    setVoicing(false)
    if (!r.ok) { toast.error(r.error || 'Could not make the voice'); return null }
    setVoiceUrl(r.url)
    return r.url
  }
  const previewVoice = async () => {
    stopPreview()
    const url = voiceUrl || (await makeVoice())
    if (!url) return
    const a = new Audio(url); a.play().catch(() => {})
    const p = { kind: 'voice', pause: () => a.pause() }
    setPreview(p); a.onended = () => setPreview((x) => (x === p ? null : x))
  }
  // ElevenLabs' own sample of the chosen voice (no credits spent).
  const sampleVoice = () => {
    stopPreview()
    const url = voices.find((v) => v.id === voiceId)?.preview_url
    if (!url) return
    const a = new Audio(url); a.play().catch(() => {})
    const p = { kind: 'sample', pause: () => a.pause() }
    setPreview(p); a.onended = () => setPreview((x) => (x === p ? null : x))
  }
  const buildSoundtrack = async (seconds) => {
    // voice first: if the narrator runs long the picture (and the music) stretch to fit
    let voiceBuf = null
    if (voiceOn && voiceStatus?.available && script.trim()) {
      const url = voiceUrl || (await makeVoice())
      if (url) {
        const AC = window.AudioContext || window.webkitAudioContext
        const ac = new AC()
        try { voiceBuf = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer()) } catch { toast.error('The voice file could not be read; making it without the narrator.') }
        try { await ac.close() } catch { /* ignore */ }
      }
    }
    const len = Math.max(seconds, (voiceBuf?.duration || 0) + 0.6) + 2
    let musicBuf = null
    if (music !== 'none') {
      if (music === 'track' && track?.url) {
        try { musicBuf = await decodeTrack(await (await fetch(track.url)).arrayBuffer(), len) } catch { toast.error('The track could not be read; making it without music.') }
      } else if (music === 'own' && ownTrack) musicBuf = await decodeTrack(ownTrack.arrayBuffer, len)
      else musicBuf = await renderMusicBed({ mood: effectiveMood, seconds: len })
    }
    return { music: musicBuf, musicGain, voice: voiceBuf }
  }
  const needsRecording = voiceOn && !!voiceStatus?.available && !!script.trim() && !voiceUrl
  const wantsSound = music !== 'none' || (voiceOn && !!voiceStatus?.available && !!script.trim())
  return { music, setMusic, musicGain, setMusicGain, ownTrack, setOwnTrack, trackRef, voiceOn, setVoiceOn, voiceStatus, voices, voiceId, setVoiceId, sampleVoice, script, setScript, voiceUrl, voicing, preview, stopPreview, previewMusic, previewVoice, buildSoundtrack, needsRecording, wantsSound,
    musicStatus, tracks, track, pickTrack, removeTrack, musicPrompt, setMusicPrompt, composing, composeTrack, musicError }
}

// seconds: how long the picture runs, so a composed track fits it.
// moodLabel: what the AI picked ("Calm"), for the prompt box's hint.
function SoundtrackPanel({ theme, isMobile, snd, autoLabel = null, scriptPlaceholder = 'What the narrator says.', seconds = 0, moodLabel = null }) {
  const { music, setMusic, musicGain, setMusicGain, ownTrack, setOwnTrack, trackRef, voiceOn, setVoiceOn, voiceStatus, voices, voiceId, setVoiceId, sampleVoice, script, setScript, voiceUrl, voicing, preview, stopPreview, previewMusic, previewVoice,
    musicStatus, tracks, track, pickTrack, removeTrack, musicPrompt, setMusicPrompt, composing, composeTrack, musicError } = snd
  const chosen = voices.find((v) => v.id === voiceId)
  const real = !!musicStatus?.available
  const [showLibrary, setShowLibrary] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const fmtS = (n) => `${Math.round(Number(n) || 0)}s`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 10 }}>
      <div style={{ padding: 12, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: theme.text }}><Music size={15} /> Music</div>
        {real ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setShowCompose((v) => !v); setShowLibrary(false) }} style={{ ...chip(theme, music === 'track' && showCompose), minHeight: 32, padding: '6px 10px', fontSize: 12 }}><Sparkles size={13} /> Compose a track</button>
              <button type="button" onClick={() => { setShowLibrary((v) => !v); setShowCompose(false) }} disabled={!tracks.length} style={{ ...chip(theme, showLibrary), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>Library{tracks.length ? ` (${tracks.length})` : ''}</button>
              <button type="button" onClick={() => { setMusic('own'); if (!ownTrack) trackRef.current?.click() }} style={{ ...chip(theme, music === 'own'), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>Your track</button>
              <button type="button" onClick={() => setMusic('none')} style={{ ...chip(theme, music === 'none'), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>None</button>
            </div>
            {showCompose && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 8, background: theme.bgCard, border: `1px solid ${theme.border}` }}>
                <textarea value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} rows={2} placeholder={moodLabel ? `Leave empty for the AI's pick (${moodLabel}), or say what you hear: "warm acoustic guitar, hopeful, builds at the end".` : 'Say what you hear: "warm acoustic guitar, hopeful, builds at the end". Instrumental, no vocals.'} style={{ ...inputStyle(theme), minHeight: 52, resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => composeTrack(seconds)} disabled={composing} style={{ ...primaryBtn(MKT), minHeight: 32, padding: '6px 12px', fontSize: 12 }}><Sparkles size={13} /> {composing ? 'Composing…' : `Compose ${seconds ? fmtS(seconds + 2) : ''}`}</button>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>ElevenLabs Music, written for this video, cleared for your posts. About half a minute.{quotaLine(musicStatus?.used, musicStatus?.cap, 'tracks') ? ` ${quotaLine(musicStatus.used, musicStatus.cap, 'tracks')}.` : ''}</span>
                </div>
                {composing && <ScoutLoader theme={theme} label="Composing…" size={40} style={{ padding: 0 }} />}
                {musicError && <div style={{ fontSize: 11, color: '#b45309' }}>{musicError}</div>}
              </div>
            )}
            {showLibrary && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {tracks.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: track?.id === t.id && music === 'track' ? MKT_BG : theme.bgCard, border: `1px solid ${track?.id === t.id && music === 'track' ? MKT : theme.border}` }}>
                    <button type="button" onClick={() => { pickTrack(t); setShowLibrary(false) }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: theme.text, fontSize: 12, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>{t.mood || 'custom'} · {fmtS(t.seconds)}{t.source === 'upload' ? ' · yours' : ''}</div>
                    </button>
                    <button type="button" onClick={() => { const a = new Audio(t.url); a.play().catch(() => {}); setTimeout(() => a.pause(), 12000) }} title="12-second taste" style={{ ...ghostBtn(theme), minHeight: 28, padding: '4px 8px', fontSize: 11 }}><Play size={12} /></button>
                    <button type="button" onClick={() => removeTrack(t)} title="Remove from the library" style={{ ...ghostBtn(theme), minHeight: 28, padding: '4px 6px', fontSize: 11 }}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            {music === 'track' && track && <div style={{ fontSize: 12, color: theme.text }}><span style={{ fontWeight: 600 }}>{track.title}</span> <span style={{ color: theme.textMuted }}>· {fmtS(track.seconds)} · sits under the voice</span></div>}
            {music === 'none' && !showCompose && <div style={{ fontSize: 11, color: theme.textMuted }}>No music. Compose a track for this video, or pick one from the library.</div>}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...(autoLabel ? [['auto', autoLabel]] : []), ['calm', 'Calm'], ['upbeat', 'Upbeat'], ['bold', 'Bold'], ['own', 'Your track'], ['none', 'None']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => { setMusic(id); if (id === 'own' && !ownTrack) trackRef.current?.click() }} style={{ ...chip(theme, music === id), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>{label}</button>
              ))}
            </div>
            {music !== 'own' && music !== 'none' && <div style={{ fontSize: 11, color: theme.textMuted }}>Simple bed made by the app. Real composed tracks need the ElevenLabs key on the server.</div>}
          </>
        )}
        <input ref={trackRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setOwnTrack({ name: f.name, arrayBuffer: await f.arrayBuffer() }); setMusic('own') }} />
        {music === 'own' && <div style={{ fontSize: 11, color: theme.textMuted }}>{ownTrack ? `${ownTrack.name} — use only music you have the rights to post.` : 'Pick an audio file you have the rights to.'}</div>}
        {music !== 'none' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Volume2 size={14} color={theme.textMuted} />
            <input type="range" min={0} max={1} step={0.05} value={musicGain} onChange={(e) => setMusicGain(Number(e.target.value))} style={{ flex: 1 }} />
            <button type="button" onClick={preview?.kind === 'music' ? stopPreview : previewMusic} disabled={music === 'track' && !track} style={{ ...ghostBtn(theme), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>{preview?.kind === 'music' ? 'Stop' : 'Hear it'}</button>
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: theme.text }}>
          <Mic size={15} /> Voiceover
          <label style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} /> on</label>
        </div>
        {voiceStatus && !voiceStatus.available && <div style={{ fontSize: 11, color: '#b45309' }}>Needs an ElevenLabs key on the server. The script is ready for when it is set.</div>}
        {voiceStatus?.available && quotaLine(voiceStatus.used_chars, voiceStatus.cap_chars, 'narration characters') && <div style={{ fontSize: 11, color: theme.textMuted }}>{quotaLine(voiceStatus.used_chars, voiceStatus.cap_chars, 'narration characters')}.</div>}
        {voiceStatus?.available && voiceStatus.from === 'stock' && <div style={{ fontSize: 11, color: theme.textMuted }}>Stock voices. A key with Voices (read) lists your ElevenLabs My Voices here instead.</div>}
        <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={3} placeholder={scriptPlaceholder} style={{ ...inputStyle(theme), minHeight: 64, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, opacity: voiceOn ? 1 : 0.6 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={!voiceOn} style={{ ...inputStyle(theme), width: 'auto', maxWidth: 180, minHeight: 32, padding: '4px 8px', fontSize: 12 }}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.category && v.category !== 'premade' ? ' · yours' : ''}</option>)}
          </select>
          {chosen?.preview_url && <button type="button" onClick={preview?.kind === 'sample' ? stopPreview : sampleVoice} disabled={!voiceOn} title="ElevenLabs' sample of this voice" style={{ ...ghostBtn(theme), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>{preview?.kind === 'sample' ? 'Stop' : 'Sample'}</button>}
          <button type="button" onClick={preview?.kind === 'voice' ? stopPreview : previewVoice} disabled={!voiceOn || !voiceStatus?.available || !script.trim() || voicing} style={{ ...ghostBtn(theme), minHeight: 32, padding: '6px 10px', fontSize: 12 }}>{voicing ? 'Recording…' : preview?.kind === 'voice' ? 'Stop' : voiceUrl ? 'Hear it' : 'Record & hear'}</button>
          <span style={{ fontSize: 11, color: theme.textMuted }}>~{Math.round(script.trim().split(/\s+/).filter(Boolean).length / 2.5)}s spoken</span>
        </div>
      </div>
    </div>
  )
}

// ── Clip editor ──────────────────────────────────────────────────────
// Cut several clips into one video, or trim one, in the browser. Each clip
// keeps a stretch (start → end); clips are ordered; the frame is vertical
// for Reels unless told otherwise. "Let the AI plan it" asks the drafter to
// order and trim from the clips' stills and the caption. Rendering is real
// time with the scout walking; the result is uploaded as a new capture and
// put on the post in place of the clips.
function VideoEditor({ theme, isMobile, clips, caption, note, companyId, employeeId, brand, jobId, invoke, onClose, onDone }) {
  const [items, setItems] = useState(() => clips.map((c) => ({ ...c, ...defaultTrim(c.duration_s, clips.length > 1 ? 15 : 60) })))
  const [aspect, setAspect] = useState('vertical')
  const [planning, setPlanning] = useState(false)
  const [why, setWhy] = useState('')
  const [rendering, setRendering] = useState(null)   // { pct, seconds }
  const abortRef = useRef(null)
  const total = totalSeconds(items)
  // Clips keep their own sound by default; music and a narrator are opt-in here.
  const snd = useSoundtrack({ invoke, brand, autoMood: 'calm', initialMusic: 'none', initialVoiceOn: false })
  const over = total > MAX_RESULT_SECONDS
  const setItem = (id, patch) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const move = (i, d) => setItems((xs) => { const y = [...xs]; const j = i + d; if (j < 0 || j >= y.length) return xs; [y[i], y[j]] = [y[j], y[i]]; return y })
  const fmt = (n) => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`

  const plan = async () => {
    setPlanning(true)
    const r = await invoke('marketing-draft', { mode: 'plan_cut', capture_ids: clips.map((c) => c.id), caption: caption || note || '', max_seconds: 45 })
    setPlanning(false)
    if (!r.ok) { toast.error(r.error || 'Could not plan the cut'); return }
    const byId = Object.fromEntries(clips.map((c) => [c.id, c]))
    const next = r.order.map((id) => ({ ...byId[id], start: r.keep[id].start, end: r.keep[id].end }))
    if (!next.length) { toast.error('The planner kept nothing. Cut it by hand.'); return }
    setItems(next)
    setWhy(r.why || '')
    if (r.drop?.length) toast.success(`Planned: ${next.length} clip${next.length === 1 ? '' : 's'}, ${r.total}s. Left out ${r.drop.length}.`)
    else toast.success(`Planned: ${r.total}s.`)
  }

  const make = async () => {
    const ac = new AbortController(); abortRef.current = ac
    snd.stopPreview()
    setRendering({ pct: 0, seconds: 0, label: snd.needsRecording ? 'Recording the narrator…' : snd.wantsSound ? 'Mixing the soundtrack…' : null })
    try {
      const soundtrack = await snd.buildSoundtrack(total)
      const out = await renderEdit({ clips: items, aspect, soundtrack, onProgress: (pct, seconds) => setRendering({ pct: Math.round(pct * 100), seconds }), signal: ac.signal })
      setRendering({ pct: 100, seconds: out.duration, uploading: true })
      const row = await uploadCapture({ companyId, employeeId, jobId, file: out.file, note: `Cut from ${items.length} clip${items.length === 1 ? '' : 's'}${caption ? ': ' + caption.slice(0, 80) : ''}`, source: 'edited', brand })
      toast.success(`Made a ${Math.round(out.duration)}s video.`)
      onDone(row)
    } catch (err) {
      if (!/Cancelled/.test(String(err?.message))) toast.error(err?.message || 'Could not make the video')
      setRendering(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }} onClick={() => !rendering && onClose()}>
      {rendering && <ScoutLoader overlay theme={theme} label={rendering.uploading ? 'Sending the video…' : rendering.label && rendering.pct === 0 ? rendering.label : `Cutting ${fmt(rendering.seconds)} of ${fmt(total)}`} pct={rendering.uploading || (rendering.label && rendering.pct === 0) ? null : rendering.pct} sub={rendering.uploading ? null : 'It plays through once while it records. Keep this screen open.'} />}
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 680, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, background: theme.bgCard, zIndex: 1 }}>
          <Scissors size={18} color={MKT} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{clips.length > 1 ? 'Cut these into one video' : 'Edit this clip'}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{fmt(total)} total{over ? ` · over the ${MAX_RESULT_SECONDS}s limit` : total > 60 ? ' · Reels do best under 1:00' : ''}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={plan} disabled={planning} style={primaryBtn(MKT)}><Sparkles size={15} /> {planning ? 'Planning…' : 'Let the AI plan the cut'}</button>
            <span style={{ fontSize: 12, color: theme.textMuted }}>Orders the clips to tell the story and keeps the parts that match the caption.</span>
          </div>
          {planning && <ScoutLoader theme={theme} label="Watching the clips…" size={44} />}
          {why && <div style={{ fontSize: 12, color: theme.textSecondary, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px' }}><Sparkles size={12} /> {why}</div>}

          <div>
            <div style={sectionLabel(theme)}>Frame</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(ASPECTS).map(([id, a]) => <button key={id} type="button" onClick={() => setAspect(id)} style={chip(theme, aspect === id)}>{a.label}</button>)}
            </div>
          </div>

          <SoundtrackPanel theme={theme} isMobile={isMobile} snd={snd} seconds={total} scriptPlaceholder="What the narrator says over the clips. Leave it empty for no narrator." />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((c, i) => {
              const d = Number(c.duration_s) || Math.max(c.end, 1)
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '72px minmax(0,1fr)' : '96px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}` }}>
                  <div style={{ position: 'relative' }}>
                    {captureThumb(c) ? <img src={captureThumb(c)} alt="" style={{ width: '100%', height: isMobile ? 72 : 96, objectFit: 'cover', borderRadius: 8, display: 'block' }} /> : <VideoFrameTile src={c.url} size={isMobile ? 72 : 96} style={{ borderRadius: 8 }} />}
                    <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: '2px 6px' }}>{i + 1}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: theme.text, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>Keep {fmt(c.start)} → {fmt(c.end)}</span>
                      <span style={{ color: theme.textMuted, fontWeight: 500 }}>{fmt(Math.max(0, c.end - c.start))} of {fmt(d)}</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.textMuted, marginTop: 6 }}>Start
                      <input type="range" min={0} max={d} step={0.5} value={c.start} onChange={(e) => { const v = Math.min(Number(e.target.value), c.end - 1); setItem(c.id, { start: Math.max(0, v) }) }} style={{ flex: 1 }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.textMuted }}>End
                      <input type="range" min={0} max={d} step={0.5} value={c.end} onChange={(e) => { const v = Math.max(Number(e.target.value), c.start + 1); setItem(c.id, { end: Math.min(d, v) }) }} style={{ flex: 1 }} />
                    </label>
                    {isMobile && items.length > 1 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn(theme), padding: 6, minHeight: 32 }}><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} style={{ ...ghostBtn(theme), padding: 6, minHeight: 32 }}><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== c.id))} style={{ ...ghostBtn(theme), padding: 6, minHeight: 32, marginLeft: 'auto' }}><X size={14} /></button>
                      </div>
                    )}
                  </div>
                  {!isMobile && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowDown size={14} /></button>
                      {items.length > 1 && <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== c.id))} title="Leave this clip out" style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><X size={14} /></button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${theme.border}`, position: 'sticky', bottom: 0, background: theme.bgCard, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: over ? '#ef4444' : theme.textMuted, flex: 1 }}>{over ? `Trim ${Math.ceil(total - MAX_RESULT_SECONDS)}s to fit.` : 'Renders in real time, then goes on the post in place of the clips.'}</span>
          <button type="button" onClick={onClose} style={ghostBtn(theme)}>Cancel</button>
          <button type="button" onClick={make} disabled={over || !items.length || !!rendering} style={{ ...primaryBtn(MKT), opacity: over || !items.length ? 0.5 : 1 }}><Scissors size={15} /> Make the video</button>
        </div>
      </div>
    </div>
  )
}

// "12 of 60 pictures this month" — or nothing when the company is uncapped (the platform company).
function quotaLine(used, cap, unit) {
  if (cap == null) return null
  const n = (x) => Number(x || 0).toLocaleString()
  return `${n(used)} of ${n(cap)} ${unit} this month`
}

// ── AI pictures ──────────────────────────────────────────────────────
// For a post with nothing from the field: a line becomes one to three
// pictures in the brand's world (marketing-image, Gemini). They land in
// the inbox like any photo, labelled AI, and go straight onto the post.
function PictureMaker({ theme, isMobile, seed = '', busy, onMake, onClose, invoke = null }) {
  const [description, setDescription] = useState(seed)
  const [count, setCount] = useState(1)
  const [quota, setQuota] = useState(null)   // { used, cap, unit }
  useEffect(() => { if (invoke) invoke('marketing-image', { action: 'status' }).then((r) => { if (r?.ok) setQuota({ used: r.used, cap: r.cap, unit: r.unit }) }) }, [invoke])
  const left = quota?.cap == null ? null : Math.max(0, quota.cap - quota.used)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }} onClick={() => !busy && onClose()}>
      {busy && <ScoutLoader overlay theme={theme} label={`Painting ${count} picture${count === 1 ? '' : 's'}…`} sub="About twenty seconds each." />}
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 520, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <Sparkles size={18} color={MKT} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Make a picture with AI</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>For when there is nothing from the field. It is labelled AI in the inbox.</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={sectionLabel(theme)}>What should it show?</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="A two-man crew pressure washing granite pavers at a building entrance, morning light." style={{ ...inputStyle(theme), minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>Say the place, the work and the light. The brand's services and area are added for you. No text or logos are painted in.</div>
          </div>
          <div>
            <div style={sectionLabel(theme)}>How many</div>
            <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3].map((n) => <button key={n} type="button" onClick={() => setCount(n)} style={chip(theme, count === n)}>{n}</button>)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${theme.border}`, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: theme.textMuted, flex: 1 }}>{quota && quotaLine(quota.used, quota.cap, 'pictures') ? `${quotaLine(quota.used, quota.cap, 'pictures')}. ` : ''}Real photos from the crew always beat these.</span>
          <button type="button" onClick={onClose} style={ghostBtn(theme)}>Cancel</button>
          <button type="button" onClick={() => onMake(description.trim(), count)} disabled={busy || !description.trim() || (left != null && left < count)} title={left != null && left < count ? 'This month\'s pictures are used up' : ''} style={{ ...primaryBtn(MKT), opacity: description.trim() && !(left != null && left < count) ? 1 : 0.5 }}><Sparkles size={15} /> Make {count === 1 ? 'it' : 'them'}</button>
        </div>
      </div>
    </div>
  )
}

// ── AI video maker ───────────────────────────────────────────────────
// The pattern Bryce showed from an Instagram lighting ad: the same room
// dark then lit with a bold headline over it, a brand card, a call to
// action. The AI writes the storyboard from the selected photos, clips and
// a line; each scene is editable; the browser renders it with the brand's
// name, logo and colour; the result goes on the post.
// initial: a saved plan (marketing_captures.storyboard of a video the AI made)
// so the maker opens where it left off — scenes, script, voice, music — and
// Make replaces the old video instead of starting over. onPictures: new AI
// pictures made here go back to the composer's inbox list too.
function StoryboardMaker({ theme, isMobile, captures: given, caption, note, companyId, employeeId, brand, brandInfo, jobId, invoke, initial = null, onPictures = null, onClose, onDone }) {
  const [description, setDescription] = useState(initial?.description || caption || note || '')
  const [sb, setSb] = useState(initial?.sb || null)              // { headline, scenes, cta, why }
  const [planning, setPlanning] = useState(false)
  const [aspect, setAspect] = useState(initial?.aspect || 'vertical')
  const [rendering, setRendering] = useState(null)
  const [painting, setPainting] = useState(false)
  const [made, setMade] = useState([])            // AI pictures made from this screen
  const abortRef = useRef(null)
  const captures = useMemo(() => [...given, ...made.filter((m) => !given.some((g) => g.id === m.id))], [given, made])
  const byId = useMemo(() => Object.fromEntries(captures.map((c) => [c.id, c])), [captures])
  const norm = sb ? normalizeStoryboard(sb, captures) : null
  const snd = useSoundtrack({ invoke, brand, autoMood: sb?.mood || 'calm', initialMusic: initial?.music || 'none', initialVoiceOn: initial ? initial.voiceOn !== false : true, initialMusicGain: initial?.musicGain ?? 0.6, initialVoiceId: initial?.voiceId || null, initialScript: initial?.script || '', initialTrack: initial?.track || null, initialMusicPrompt: initial?.musicPrompt || '' })
  // Without a real composer the synth bed is the default; with one, music is a choice (Compose a track).
  useEffect(() => { if (!initial && snd.musicStatus && !snd.musicStatus.available && snd.music === 'none') snd.setMusic('auto') }, [snd.musicStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sb?.voiceover && !snd.script) snd.setScript(sb.voiceover) }, [sb]) // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (n) => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`

  const plan = async () => {
    setPlanning(true)
    const r = await invoke('marketing-draft', { mode: 'storyboard', capture_ids: captures.map((c) => c.id), description, brand: brand || '', max_seconds: 30 })
    setPlanning(false)
    if (!r.ok) { toast.error(r.error || 'Could not plan the video'); return }
    setSb(r)
  }
  // No photos? The AI paints two from the line, they join the inbox, then it plans.
  const paint = async () => {
    if (!description.trim()) { toast.error('Write a line about what the video should show first.'); return }
    setPainting(true)
    const r = await invoke('marketing-image', { description, brand: brand || '', count: 2, aspect: 'vertical' })
    setPainting(false)
    if (!r.ok) { toast.error(r.error || 'Could not make pictures'); return }
    const rows = r.captures || []
    setMade((xs) => [...xs, ...rows])
    onPictures?.(rows)
    toast.success(`Made ${rows.length} picture${rows.length === 1 ? '' : 's'}.`)
  }
  const setScene = (i, patch) => setSb((x) => ({ ...x, scenes: x.scenes.map((sc, j) => (j === i ? { ...sc, ...patch } : sc)) }))
  const move = (i, d) => setSb((x) => { const y = [...x.scenes]; const j = i + d; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return { ...x, scenes: y } })
  const drop = (i) => setSb((x) => ({ ...x, scenes: x.scenes.filter((_, j) => j !== i) }))

  const make = async () => {
    const ac = new AbortController(); abortRef.current = ac
    setRendering({ pct: 0, seconds: 0 })
    try {
      snd.stopPreview()
      setRendering({ pct: 0, seconds: 0, label: snd.needsRecording ? 'Recording the narrator…' : 'Mixing the soundtrack…' })
      const soundtrack = await snd.buildSoundtrack(norm.total)
      const out = await renderStoryboard({ storyboard: sb, captures, brand: { ...brandInfo, ...(sb.brand || {}) , logo_url: sb.brand?.logo_url || brandInfo.logo_url, color: sb.brand?.color || brandInfo.color }, aspect, soundtrack, onProgress: (pct, seconds) => setRendering({ pct: Math.round(pct * 100), seconds }), signal: ac.signal })
      setRendering({ pct: 100, seconds: out.duration, uploading: true })
      const storyboard = { description, sb, aspect, music: snd.music, musicGain: snd.musicGain, track: snd.music === 'track' && snd.track ? { id: snd.track.id, title: snd.track.title, url: snd.track.url, seconds: snd.track.seconds } : null, musicPrompt: snd.musicPrompt, voiceId: snd.voiceId, voiceOn: snd.voiceOn, script: snd.script, source_capture_ids: captures.map((c) => c.id), made_at: new Date().toISOString() }
      const row = await uploadCapture({ companyId, employeeId, jobId, file: out.file, note: `AI video: ${sb.headline || description.slice(0, 60)}`, source: 'generated', brand, storyboard })
      toast.success(`Made a ${Math.round(out.duration)}s video.`)
      onDone(row)
    } catch (err) {
      if (!/Cancelled/.test(String(err?.message))) toast.error(err?.message || 'Could not make the video')
      setRendering(null)
    }
  }

  const thumbFor = (id) => captureThumb(byId[id])
  const kindLabel = { compare: 'Before → after', photo: 'Photo', clip: 'Clip', card: 'Text card' }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center' }} onClick={() => !rendering && onClose()}>
      {rendering && <ScoutLoader overlay theme={theme} label={rendering.uploading ? 'Sending the video…' : rendering.label && rendering.pct === 0 ? rendering.label : `Making it · ${fmt(rendering.seconds)} of ${fmt(norm?.total || 0)}`} pct={rendering.uploading || (rendering.label && rendering.pct === 0) ? null : rendering.pct} sub={rendering.uploading ? null : 'It plays through once while it records. Keep this screen open.'} />}
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.bgCard, width: isMobile ? '100%' : 700, maxHeight: isMobile ? '100%' : '92vh', overflowY: 'auto', borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, background: theme.bgCard, zIndex: 1 }}>
          <Clapperboard size={18} color={MKT} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Make a video with AI</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{captures.length ? `From ${captures.length} photo${captures.length === 1 ? '' : 's'}/clip${captures.length === 1 ? '' : 's'} and your line.` : 'From your line alone: bold text cards in the brand colour.'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn(theme), padding: 8 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={sectionLabel(theme)}>What should it say?</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Hard evidence that lighting is everything. Same warehouse, before and after our LED retrofit." style={{ ...inputStyle(theme), minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={plan} disabled={planning || (!description.trim() && !captures.length)} style={primaryBtn(MKT)}><Sparkles size={15} /> {planning ? 'Directing…' : sb ? 'Plan it again' : 'Plan the video'}</button>
              {!captures.length && <button type="button" onClick={paint} disabled={painting || !description.trim()} title="No photos? The AI paints two from your line and they join the inbox" style={{ ...ghostBtn(theme), minHeight: 40 }}><ImageIcon size={15} /> {painting ? 'Painting…' : 'Make pictures first'}</button>}
              <span style={{ fontSize: 12, color: theme.textMuted }}>Two photos of the same spot become a before-and-after reveal.</span>
            </div>
          </div>
          {planning && <ScoutLoader theme={theme} label="Looking at the photos…" size={44} />}
          {painting && <ScoutLoader theme={theme} label="Painting two pictures…" size={44} sub="About twenty seconds each." />}
          {!captures.length && !painting && <div style={{ fontSize: 12, color: theme.textMuted }}>Nothing from the field yet. Write the line, then Make pictures first; or go back and add photos.</div>}

          {sb && norm && (
            <>
              {sb.why && <div style={{ fontSize: 12, color: theme.textSecondary, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px' }}><Sparkles size={12} /> {sb.why}</div>}
              <div>
                <div style={sectionLabel(theme)}>Frame</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(ASPECTS).map(([id, a]) => <button key={id} type="button" onClick={() => setAspect(id)} style={chip(theme, aspect === id)}>{a.label}</button>)}
                </div>
              </div>
              <SoundtrackPanel theme={theme} isMobile={isMobile} snd={snd} seconds={norm.total} moodLabel={MOODS[sb.mood || 'calm']?.label || 'Calm'} autoLabel={`Auto (${MOODS[sb.mood || 'calm']?.label || 'Calm'})`} scriptPlaceholder="What the narrator says. The AI wrote a first pass when it planned the video." />
              <div>
                <div style={sectionLabel(theme)}>Scenes · {fmt(norm.total)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sb.scenes.map((sc, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '64px minmax(0,1fr)' : '96px minmax(0,1fr) auto', gap: 10, alignItems: 'start', padding: 10, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}` }}>
                      <div style={{ position: 'relative' }}>
                        {sc.kind === 'card'
                          ? <div style={{ width: '100%', height: isMobile ? 64 : 72, borderRadius: 8, background: sb.brand?.color || brandInfo.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: 4, textAlign: 'center', overflow: 'hidden' }}>{sc.text?.slice(0, 40)}</div>
                          : sc.kind === 'compare'
                            ? <div style={{ display: 'flex', width: '100%', height: isMobile ? 64 : 72, borderRadius: 8, overflow: 'hidden' }}>{[sc.before, sc.after].map((id) => thumbFor(id) ? <img key={id} src={thumbFor(id)} alt="" style={{ width: '50%', height: '100%', objectFit: 'cover' }} /> : <div key={id} style={{ width: '50%', background: '#111' }} />)}</div>
                            : thumbFor(sc.capture) ? <img src={thumbFor(sc.capture)} alt="" style={{ width: '100%', height: isMobile ? 64 : 72, objectFit: 'cover', borderRadius: 8, display: 'block' }} /> : <div style={{ width: '100%', height: isMobile ? 64 : 72, borderRadius: 8, background: '#111' }} />}
                        <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: '2px 6px' }}>{i + 1}</div>
                      </div>
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11, color: theme.textMuted, display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{kindLabel[sc.kind]}{sc.kind === 'clip' ? ` ${fmt(sc.start)}–${fmt(sc.end)}` : ''}</span><span>{sc.seconds}s</span></div>
                        <input value={sc.text || ''} onChange={(e) => setScene(i, { text: e.target.value })} placeholder={sc.kind === 'card' ? 'Headline' : 'Headline over the picture (optional)'} style={{ ...inputStyle(theme), minHeight: 36, padding: '6px 10px', fontSize: 13 }} />
                        {sc.kind === 'card' && <input value={sc.sub || ''} onChange={(e) => setScene(i, { sub: e.target.value })} placeholder="Second line (optional)" style={{ ...inputStyle(theme), minHeight: 32, padding: '4px 10px', fontSize: 12 }} />}
                        {sc.kind !== 'clip' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.textMuted }}>Seconds
                            <input type="range" min={1.5} max={8} step={0.5} value={sc.seconds} onChange={(e) => setScene(i, { seconds: Number(e.target.value) })} style={{ flex: 1 }} />
                          </label>
                        )}
                        {isMobile && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowUp size={14} /></button>
                            <button type="button" onClick={() => move(i, 1)} disabled={i === sb.scenes.length - 1} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowDown size={14} /></button>
                            <button type="button" onClick={() => drop(i)} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30, marginLeft: 'auto' }}><X size={14} /></button>
                          </div>
                        )}
                      </div>
                      {!isMobile && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === sb.scenes.length - 1} style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><ArrowDown size={14} /></button>
                          <button type="button" onClick={() => drop(i)} title="Leave this scene out" style={{ ...ghostBtn(theme), padding: 6, minHeight: 30 }}><X size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '64px minmax(0,1fr)' : '96px minmax(0,1fr)', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, background: theme.bg, border: `1px dashed ${theme.border}` }}>
                    <div style={{ width: '100%', height: isMobile ? 64 : 72, borderRadius: 8, background: sb.brand?.color || brandInfo.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: 4, textAlign: 'center' }}>{sb.cta?.text?.slice(0, 40)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: theme.textMuted }}>Closing card · 3s · {brandInfo.name}</div>
                      <input value={sb.cta?.text || ''} onChange={(e) => setSb((x) => ({ ...x, cta: { ...(x.cta || {}), text: e.target.value } }))} placeholder="Call to action" style={{ ...inputStyle(theme), minHeight: 36, padding: '6px 10px', fontSize: 13 }} />
                      <input value={sb.cta?.sub || ''} onChange={(e) => setSb((x) => ({ ...x, cta: { ...(x.cta || {}), sub: e.target.value } }))} placeholder="Phone or website" style={{ ...inputStyle(theme), minHeight: 32, padding: '4px 10px', fontSize: 12 }} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${theme.border}`, position: 'sticky', bottom: 0, background: theme.bgCard, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: theme.textMuted, flex: 1 }}>{sb ? 'Renders in real time, then goes on the post.' : 'Plan first; every scene can be edited before it is made.'}</span>
          <button type="button" onClick={onClose} style={ghostBtn(theme)}>Cancel</button>
          <button type="button" onClick={make} disabled={!sb || !norm?.scenes.length || !!rendering} style={{ ...primaryBtn(MKT), opacity: sb && norm?.scenes.length ? 1 : 0.5 }}><Clapperboard size={15} /> Make the video</button>
        </div>
      </div>
    </div>
  )
}

// ── Text-in ──────────────────────────────────────────────────────────
// Techs text a photo to the company's Twilio number and it lands in the
// inbox (marketing-textin). Switching it on sets that number's SMS webhook
// through Twilio's API with the company's own credentials, from here, so
// nobody opens the Twilio console.
function TextInCard({ theme, isMobile, invoke, isManager }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    invoke('marketing-textin', { action: 'status' }).then((r) => { if (!cancelled) setSt(r?.ok ? r : { ok: false, error: r?.error }) })
    return () => { cancelled = true }
  }, [invoke])
  const enable = async () => {
    setBusy(true)
    const r = await invoke('marketing-textin', { action: 'enable' })
    setBusy(false)
    if (!r.ok) { toast.error(r.error || 'Could not switch on text-in'); return }
    toast.success(`Text-in is on. Techs text photos to ${r.number || 'the company number'}.`)
    setSt((s) => ({ ...(s || {}), ok: true, configured: true, enabled: true, number: r.number }))
  }
  if (!st) return null
  const on = st.configured && st.enabled
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 12, borderRadius: 10, background: on ? 'rgba(34,197,94,0.08)' : theme.bgCard, border: `1px solid ${on ? 'rgba(34,197,94,0.35)' : theme.border}`, flexWrap: 'wrap' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: on ? '#22c55e' : theme.border, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? <Check size={16} /> : <Camera size={15} color={theme.textMuted} />}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Text photos in{on && st.number ? `: ${st.number}` : ''}</div>
        <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.4 }}>
          {on
            ? 'Anyone on the team can text a photo and a line about the job to this number from the cell on their employee record. It lands here.'
            : !st.configured
              ? 'Needs the company Twilio number under Settings → Integrations (Account SID, Auth Token, From Number). Then switch it on here.'
              : 'Twilio is set up. Switch this on and techs can text photos straight to the inbox.'}
        </div>
      </div>
      {!on && st.configured && isManager && (
        <button type="button" onClick={enable} disabled={busy} style={primaryBtn(MKT)}>{busy ? 'Switching on…' : 'Switch on text-in'}</button>
      )}
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

// A tile for a video that has no poster (yet): the browser's own frame.
function VideoFrameTile({ src, size = 72, style = {} }) {
  return <video src={src ? `${src}#t=1` : undefined} preload="metadata" muted playsInline style={{ width: '100%', height: size, objectFit: 'cover', display: 'block', background: '#111', ...style }} />
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
