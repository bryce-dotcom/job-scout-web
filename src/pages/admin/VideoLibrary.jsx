import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../components/Layout'
import { useIsMobile } from '../../hooks/useIsMobile'
import * as Icons from 'lucide-react'
import {
  PlayCircle, Search, ArrowRight, Sparkles, X as XIcon,
  Film, Trophy, CheckCircle2
} from 'lucide-react'
import { FEATURE_CATALOG, getAllReplacedTools } from '../../lib/featureCatalog'
import { getWalkthrough } from '../../components/walkthroughs'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentHover: '#4a5239', accentBg: 'rgba(90,99,73,0.12)',
}

export default function VideoLibrary() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeReplaces, setActiveReplaces] = useState(null) // filter by tool we replace
  const [playing, setPlaying] = useState(null) // video object being viewed

  const replacedTools = useMemo(() => getAllReplacedTools(FEATURE_CATALOG), [])

  // Filter features by search + category + "replaces"
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase()
    return FEATURE_CATALOG
      .filter(cat => activeCategory === 'all' || cat.category === activeCategory)
      .map(cat => ({
        ...cat,
        features: (cat.features || []).filter(f => {
          if (q) {
            const hay = `${f.name} ${f.summary} ${(f.replaces || []).join(' ')} ${(f.highlights || []).join(' ')}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          if (activeReplaces && !(f.replaces || []).includes(activeReplaces)) return false
          return true
        }),
      }))
      .filter(cat => cat.features.length > 0)
  }, [search, activeCategory, activeReplaces])

  const totalFeatures = useMemo(
    () => FEATURE_CATALOG.reduce((sum, c) => sum + (c.features?.length || 0), 0),
    []
  )

  // Deep-link support: /admin/videos#walkthrough=<id> auto-opens the
  // matching feature's modal on mount. Used from the Help page's
  // Feature Reference section so "Watch walkthrough" lands directly
  // on the video instead of dropping the user in a 32-item grid.
  useEffect(() => {
    const openFromHash = () => {
      const m = (window.location.hash || '').match(/walkthrough=([^&]+)/)
      if (!m) return
      const wantId = decodeURIComponent(m[1])
      for (const cat of FEATURE_CATALOG) {
        for (const feature of (cat.features || [])) {
          if (feature.walkthrough === wantId) {
            setPlaying(feature)
            return
          }
        }
      }
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Film size={isMobile ? 22 : 26} style={{ color: theme.accent }} />
          <h1 style={{ margin: 0, fontSize: isMobile ? '22px' : '28px', fontWeight: 700, color: theme.text }}>
            Video Library
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: isMobile ? '14px' : '15px', color: theme.textSecondary, maxWidth: '680px' }}>
          Walkthroughs for every Job Scout feature — and a side-by-side of the
          tools each one replaces. One subscription, no stitched-together stack.
        </p>
      </div>

      {/* Hero stat strip */}
      <HeroStrip theme={theme} totalFeatures={totalFeatures} replacedTools={replacedTools} />

      {/* What it replaces — pill cloud */}
      {replacedTools.length > 0 && (
        <ReplacesCloud
          theme={theme}
          replacedTools={replacedTools}
          activeReplaces={activeReplaces}
          onPick={(t) => setActiveReplaces(activeReplaces === t ? null : t)}
        />
      )}

      {/* Search + category tabs */}
      <FilterBar
        theme={theme}
        isMobile={isMobile}
        search={search}
        onSearch={setSearch}
        activeCategory={activeCategory}
        onCategory={setActiveCategory}
        activeReplaces={activeReplaces}
        onClearReplaces={() => setActiveReplaces(null)}
      />

      {/* Catalog */}
      {filteredCategories.length === 0 ? (
        <EmptyState theme={theme} hasCatalog={totalFeatures > 0} />
      ) : (
        filteredCategories.map(cat => (
          <CategorySection
            key={cat.category}
            theme={theme}
            isMobile={isMobile}
            category={cat}
            onWatch={setPlaying}
            onOpenRoute={(route) => route && navigate(route)}
          />
        ))
      )}

      {/* Video player modal */}
      {playing && (
        <VideoModal video={playing} theme={theme} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}

// ─── Hero strip ─────────────────────────────────────────────────────────
function HeroStrip({ theme, totalFeatures, replacedTools }) {
  return (
    <div style={{
      padding: '20px 24px',
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: '14px',
      marginBottom: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: '20px',
    }}>
      <StatBlock theme={theme} icon={Sparkles} label="Features in Job Scout" value={totalFeatures} accent={theme.accent} />
      <StatBlock theme={theme} icon={Trophy}   label="Market tools replaced"  value={replacedTools.length} accent="#a855f7" />
      <StatBlock theme={theme} icon={CheckCircle2} label="One subscription"    value="1"  accent="#22c55e" subtitle="vs 12+ tools stitched" />
    </div>
  )
}

function StatBlock({ theme, icon: Icon, label, value, accent, subtitle }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Icon size={16} style={{ color: accent }} />
        <span style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: theme.text, lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{subtitle}</div>}
    </div>
  )
}

// ─── Replaces cloud ─────────────────────────────────────────────────────
function ReplacesCloud({ theme, replacedTools, activeReplaces, onPick }) {
  return (
    <div style={{
      padding: '16px 20px',
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: '14px',
      marginBottom: '20px',
    }}>
      <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '10px' }}>
        Job Scout replaces…
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {replacedTools.map(([tool, count]) => {
          const active = activeReplaces === tool
          return (
            <button
              key={tool}
              onClick={() => onPick(tool)}
              style={{
                padding: '6px 12px',
                backgroundColor: active ? theme.accent : theme.bg,
                color: active ? '#fff' : theme.textSecondary,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ textDecoration: active ? 'none' : 'line-through', textDecorationColor: '#ef4444', textDecorationThickness: '1.5px' }}>
                {tool}
              </span>
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '999px',
                backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.accentBg,
                color: active ? '#fff' : theme.accent,
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Filter bar ─────────────────────────────────────────────────────────
function FilterBar({ theme, isMobile, search, onSearch, activeCategory, onCategory, activeReplaces, onClearReplaces }) {
  const categories = ['all', ...FEATURE_CATALOG.map(c => c.category)]
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: '12px',
      marginBottom: '20px',
      alignItems: isMobile ? 'stretch' : 'center',
    }}>
      <div style={{ position: 'relative', flex: isMobile ? 'none' : '0 0 320px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search features, tools, AI agents…"
          style={{
            width: '100%',
            padding: '10px 14px 10px 38px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            fontSize: '14px',
            color: theme.text,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, overflowX: 'auto' }}>
        {categories.map(c => {
          const active = activeCategory === c
          return (
            <button
              key={c}
              onClick={() => onCategory(c)}
              style={{
                padding: '8px 14px',
                backgroundColor: active ? theme.accent : theme.bgCard,
                color: active ? '#fff' : theme.textSecondary,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c === 'all' ? 'All categories' : c}
            </button>
          )
        })}
      </div>
      {activeReplaces && (
        <button
          onClick={onClearReplaces}
          style={{
            padding: '8px 12px',
            backgroundColor: theme.accentBg,
            color: theme.accent,
            border: `1px solid ${theme.accent}40`,
            borderRadius: '8px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
          }}
        >
          Replacing: {activeReplaces} <XIcon size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Category section ───────────────────────────────────────────────────
function CategorySection({ theme, isMobile, category, onWatch, onOpenRoute }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: theme.text }}>
          {category.category}
        </h2>
        {category.summary && (
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: theme.textMuted }}>
            {category.summary}
          </p>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '14px',
      }}>
        {category.features.map(f => (
          <FeatureCard
            key={f.name}
            theme={theme}
            feature={f}
            onWatch={() => (f.video_url || f.walkthrough) && onWatch(f)}
            onOpenRoute={() => onOpenRoute(f.route)}
          />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ theme, feature, onWatch, onOpenRoute }) {
  const Icon = Icons[feature.icon] || Icons.Sparkles
  const isComingSoon = feature.status === 'coming_soon'
  const isBeta = feature.status === 'beta'
  // A feature counts as "playable" if it has a recorded video URL OR an
  // in-app animated walkthrough registered in components/walkthroughs.
  const hasVideo = !!feature.video_url || !!feature.walkthrough

  return (
    <div style={{
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Video thumb / icon panel */}
      <div
        onClick={hasVideo ? onWatch : undefined}
        style={{
          position: 'relative',
          height: '120px',
          background: hasVideo
            ? `linear-gradient(135deg, ${theme.accent}, ${theme.accentHover})`
            : `linear-gradient(135deg, ${theme.bg}, ${theme.bgCardHover || '#eef2eb'})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: hasVideo ? 'pointer' : 'default',
        }}
      >
        <Icon size={44} style={{ color: hasVideo ? '#fff' : theme.accent, opacity: hasVideo ? 0.95 : 0.6 }} />
        {hasVideo && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <PlayCircle size={48} style={{ color: '#fff', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }} />
          </div>
        )}
        {(isComingSoon || isBeta) && (
          <span style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            padding: '3px 8px',
            backgroundColor: isComingSoon ? 'rgba(168,85,247,0.95)' : 'rgba(234,179,8,0.95)',
            color: '#fff',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {isComingSoon ? 'Coming Soon' : 'Beta'}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '6px', fontWeight: 600, color: theme.text, fontSize: '15px' }}>
          {feature.name}
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: theme.textSecondary, lineHeight: 1.45 }}>
          {feature.summary}
        </p>

        {feature.highlights?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
            {feature.highlights.map(h => (
              <span key={h} style={{
                padding: '2px 8px',
                backgroundColor: theme.bg,
                color: theme.textSecondary,
                borderRadius: '4px',
                fontSize: '11px',
                border: `1px solid ${theme.border}`,
              }}>
                {h}
              </span>
            ))}
          </div>
        )}

        {feature.replaces?.length > 0 && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px dashed ${theme.border}` }}>
            <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '4px' }}>
              Replaces
            </div>
            <div style={{ fontSize: '12px', color: theme.text }}>
              {feature.replaces.map((r, i) => (
                <span key={r}>
                  <span style={{ textDecoration: 'line-through', textDecorationColor: '#ef4444', textDecorationThickness: '1.5px' }}>{r}</span>
                  {i < feature.replaces.length - 1 ? <span style={{ color: theme.textMuted }}> · </span> : null}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {hasVideo && (
            <button
              onClick={onWatch}
              style={{
                padding: '6px 12px',
                backgroundColor: theme.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <PlayCircle size={13} /> Watch
            </button>
          )}
          {feature.route && !isComingSoon && (
            <button
              onClick={onOpenRoute}
              style={{
                padding: '6px 10px',
                backgroundColor: 'transparent',
                color: theme.accent,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              Open <ArrowRight size={12} />
            </button>
          )}
          {!hasVideo && !isComingSoon && (
            <span style={{ fontSize: '11px', color: theme.textMuted, fontStyle: 'italic' }}>
              Video coming soon
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Video modal ────────────────────────────────────────────────────────
function VideoModal({ video, theme, onClose }) {
  // Two render modes:
  //   1. In-app walkthrough — Framer Motion animation registered in
  //      components/walkthroughs/. Picked when feature.walkthrough is set.
  //   2. Embedded video — Loom / YouTube / Vimeo URL normalized to an
  //      autoplay embed. Falls back to the raw URL.
  const Walkthrough = getWalkthrough(video.walkthrough)

  const embedSrc = useMemo(() => {
    if (Walkthrough) return null
    const u = video.video_url
    if (!u) return ''
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
    if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`
    m = u.match(/loom\.com\/(?:share|embed)\/([\w-]+)/)
    if (m) return `https://www.loom.com/embed/${m[1]}?autoplay=1`
    m = u.match(/vimeo\.com\/(\d+)/)
    if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1`
    return u
  }, [video.video_url, Walkthrough])

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '92%', maxWidth: '960px',
        backgroundColor: theme.bgCard,
        borderRadius: '14px',
        border: `1px solid ${theme.border}`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        zIndex: 1001,
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, color: theme.text, fontSize: '15px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {video.name}
              {Walkthrough && (
                <span style={{
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: theme.accentBg,
                  color: theme.accent,
                  borderRadius: 999,
                }}>
                  Live demo
                </span>
              )}
            </div>
            {video.summary && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{video.summary}</div>}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              background: 'transparent',
              border: 'none',
              color: theme.textMuted,
              cursor: 'pointer',
              display: 'inline-flex',
            }}
          >
            <XIcon size={20} />
          </button>
        </div>
        {Walkthrough ? (
          <Walkthrough />
        ) : (
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, backgroundColor: '#000' }}>
            <iframe
              src={embedSrc}
              title={video.name}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────
function EmptyState({ theme, hasCatalog }) {
  return (
    <div style={{
      padding: '40px 24px',
      textAlign: 'center',
      backgroundColor: theme.bgCard,
      border: `1px dashed ${theme.border}`,
      borderRadius: '14px',
      color: theme.textMuted,
    }}>
      <Film size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
      <p style={{ margin: 0, fontSize: '14px' }}>
        {hasCatalog
          ? 'No features match your filters.'
          : 'Feature catalog is still being compiled. Check back in a sec.'}
      </p>
    </div>
  )
}
