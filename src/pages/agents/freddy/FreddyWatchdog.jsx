import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { ExternalLink, AlertTriangle, RefreshCw, Info } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

// Deep-link straight to the device list. Watchdog bounces unauthenticated
// requests to /signin?next=... and honours the next param afterwards, so a
// signed-out user lands on the right screen once they log in.
const WATCHDOG_URL = 'https://app.motowatchdog.com/signin?next=%2Fdashboard%2Fdevices'
const WATCHDOG_ORIGIN = 'https://app.motowatchdog.com'

/**
 * The Moto Watchdog app, embedded.
 *
 * Their app sets no X-Frame-Options and no CSP frame-ancestors, so framing
 * is permitted. It's a separate login from JobScout's — this is their app in
 * a window, not a JobScout screen.
 *
 * What this is NOT: a replacement for the GPS sync. Nothing in here can feed
 * driver scorecards, cost-per-mile, or the job/vehicle correlation, because
 * a cross-origin frame is opaque to us by design — we can't read a pixel of
 * it. Freddy's own screens still run off the mirrored data. This tab is for
 * the times someone wants the vendor's full UI without leaving JobScout.
 *
 * Browser caveat worth knowing: Safari blocks third-party storage outright,
 * and Chrome partitions it. In Chrome/Edge the embedded login sticks; in
 * Safari it may refuse to hold a session at all. Hence the always-visible
 * "open in a new tab" escape hatch rather than a hidden fallback.
 */
export default function FreddyWatchdog() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const iframeRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // A frame the browser refuses to render fires no error event — it just sits
  // there blank forever. Treat "still hasn't loaded after a while" as blocked
  // so the user gets the escape hatch instead of an empty rectangle.
  useEffect(() => {
    const timer = setTimeout(() => setBlocked(true), 12000)
    return () => clearTimeout(timer)
  }, [reloadKey])

  const handleLoad = () => {
    setLoaded(true)
    setBlocked(false)
  }

  const reload = () => {
    setLoaded(false)
    setBlocked(false)
    setReloadKey(k => k + 1)
  }

  const openExternally = () => {
    window.open(`${WATCHDOG_ORIGIN}/dashboard/devices`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      padding: isMobile ? '12px' : '16px', gap: '12px',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: isMobile ? '17px' : '20px', fontWeight: '700',
            color: theme.text, margin: 0,
          }}>
            Moto Watchdog
          </h1>
          <p style={{ fontSize: '12.5px', color: theme.textMuted, margin: '2px 0 0' }}>
            Their app, running here. Signs in separately from JobScout.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button
            onClick={reload}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', minHeight: '44px',
              background: theme.bgCard, color: theme.textSecondary,
              border: `1px solid ${theme.border}`, borderRadius: '8px',
              cursor: 'pointer', fontWeight: '600', fontSize: '13px',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={15} />
            Reload
          </button>
          <button
            onClick={openExternally}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', minHeight: '44px',
              background: theme.accentBg, color: theme.accent,
              border: `1px solid ${theme.accent}`, borderRadius: '8px',
              cursor: 'pointer', fontWeight: '600', fontSize: '13px',
              fontFamily: 'inherit',
            }}
          >
            <ExternalLink size={15} />
            New tab
          </button>
        </div>
      </div>

      {blocked && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '10px 12px', borderRadius: '8px', flexShrink: 0,
          background: 'rgba(234,179,8,0.09)', color: '#a16207', fontSize: '13px',
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Your browser is blocking the embedded view — Safari and private windows
            usually do. Use <strong>New tab</strong> instead; everything else in Freddy
            keeps working normally.
          </span>
        </div>
      )}

      {/* The frame itself. minHeight:0 on both this and the flex parent is
          what lets it actually fill the remaining height instead of
          overflowing the page. */}
      <div style={{
        position: 'relative', flex: 1, minHeight: isMobile ? '460px' : 0,
        borderRadius: '12px', overflow: 'hidden',
        border: `1px solid ${theme.border}`, background: theme.bgCard,
        boxShadow: theme.shadow,
      }}>
        {!loaded && !blocked && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', color: theme.textMuted, fontSize: '13px',
            background: theme.bgCard, zIndex: 1,
          }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading Moto Watchdog...
          </div>
        )}

        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={WATCHDOG_URL}
          title="Moto Watchdog"
          onLoad={handleLoad}
          // Enough to run their app and let it sign in, without granting it
          // top-level navigation of the JobScout tab.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
          referrerPolicy="no-referrer-when-downgrade"
          allow="geolocation 'none'; camera 'none'; microphone 'none'"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0,
        fontSize: '12px', color: theme.textMuted, lineHeight: 1.5,
      }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          This is Moto Watchdog's own app — JobScout can't read anything inside it.
          Freddy's tracking, trips, and driver reports come from the account you
          connect under Settings.
        </span>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
