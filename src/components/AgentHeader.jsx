// Agent workspace chrome — a header and its navigation.
//
// Rebuilt around the phone, because that is where this gets used. Freddy in
// particular is opened standing next to a machine, one-handed, outdoors.
//
// What was wrong with the old one, all of it worse on a small screen:
//
//   - eight tabs in an overflow-x-auto strip, with nothing to indicate that
//     four of them were off the right edge. Anything past "Costs" may as well
//     not have existed on a phone.
//   - navigation at the very top, which is the hardest place on a large phone
//     for a thumb to reach.
//   - a header spending ~100px of an 844px screen on an avatar, a tagline and
//     two status badges, none of which are why anyone opened the page.
//   - Tailwind classes, against this codebase's rule of inline styles with
//     theme tokens — so it ignored the theme and stayed dark on a light app.
//
// Now: on a phone the primary destinations live in a fixed bottom bar within
// thumb reach, the rest behind More, and the header shrinks to one line. On a
// laptop it stays a tab row, because a mouse does not care about reach and the
// horizontal space is free.

import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useIsMobile } from '../hooks/useIsMobile'
import { useTheme } from './Layout'
import * as Icons from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// How many destinations sit in the bottom bar before the rest go behind More.
// Four plus More is the most that stays comfortably tappable at 390px; five
// makes every target narrower than a thumb.
const PRIMARY_ON_MOBILE = 4

export const MOBILE_TABBAR_HEIGHT = 64

export default function AgentHeader({ slug, tabs = [] }) {
  const { getAgent, getCompanyAgent } = useStore()
  const isMobile = useIsMobile()
  const themeCtx = useTheme?.()
  const theme = themeCtx?.theme || themeCtx || defaultTheme
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const scrollerRef = useRef(null)

  const agent = getAgent(slug)
  const companyAgent = getCompanyAgent(slug)

  // Close the sheet on navigation, or it lingers over the page just opened.
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  if (!agent) return null

  const AgentIcon = Icons[agent.icon] || Icons.Bot
  const displayName = companyAgent?.custom_name || agent.full_name

  // Tabs may declare themselves primary; otherwise the first few win. Order in
  // the array is the author's priority order either way.
  const declared = tabs.filter(t => t.primary)
  const primary = (declared.length ? declared : tabs).slice(0, PRIMARY_ON_MOBILE)
  const overflow = tabs.filter(t => !primary.includes(t))
  const overflowActive = overflow.some(t => location.pathname === t.path)

  // ---------------------------------------------------------------
  // Phone
  // ---------------------------------------------------------------
  if (isMobile) {
    return (
      <>
        {/* One line. The agent's name earns its place; the tagline and the
            trade-category badge do not, on a screen this size. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          background: theme.bgCard, borderBottom: `1px solid ${theme.border}`,
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: theme.accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AgentIcon size={17} style={{ color: theme.accent }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
          {/* A dot, not a badge. "Active" is reassurance, not information. */}
          <span title="Active" style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        </div>

        {/* Content clearance so the last row of any page isn't trapped under
            the bar. Rendered as a spacer rather than padding on a wrapper the
            pages don't share. */}
        <div style={{ height: MOBILE_TABBAR_HEIGHT + 12 }} aria-hidden="true" />

        {moreOpen && (
          <>
            <div
              onClick={() => setMoreOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }}
            />
            <div style={{
              position: 'fixed', left: 0, right: 0,
              bottom: `calc(${MOBILE_TABBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
              background: theme.bgCard, borderTop: `1px solid ${theme.border}`,
              borderRadius: '16px 16px 0 0', zIndex: 61, padding: '8px 8px 12px',
              boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
            }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.border, margin: '6px auto 10px' }} />
              {overflow.map(tab => {
                const TabIcon = Icons[tab.icon] || Icons.Circle
                return (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    end={tab.end}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 12,
                      minHeight: 52, padding: '0 14px', borderRadius: 10,
                      textDecoration: 'none', fontSize: 15, fontWeight: 600,
                      color: isActive ? theme.accent : theme.textSecondary,
                      background: isActive ? theme.accentBg : 'transparent',
                    })}
                  >
                    <TabIcon size={19} />
                    {tab.label}
                  </NavLink>
                )
              })}
            </div>
          </>
        )}

        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 62,
          height: `calc(${MOBILE_TABBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: theme.bgCard, borderTop: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'stretch',
        }}>
          {primary.map(tab => {
            const TabIcon = Icons[tab.icon] || Icons.Circle
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                style={({ isActive }) => ({
                  flex: 1, minWidth: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3, textDecoration: 'none',
                  color: isActive ? theme.accent : theme.textMuted,
                  fontSize: 10, fontWeight: 600,
                })}
              >
                {({ isActive }) => (
                  <>
                    <TabIcon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
                    <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tab.label}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}

          {overflow.length > 0 && (
            <button
              onClick={() => setMoreOpen(v => !v)}
              aria-expanded={moreOpen}
              style={{
                flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                // Lit when a hidden tab is the current page, so the bar never
                // shows nothing selected while you are standing on a page.
                color: (moreOpen || overflowActive) ? theme.accent : theme.textMuted,
              }}
            >
              <Icons.MoreHorizontal size={21} strokeWidth={(moreOpen || overflowActive) ? 2.4 : 1.9} />
              <span>More</span>
            </button>
          )}
        </nav>
      </>
    )
  }

  // ---------------------------------------------------------------
  // Laptop
  // ---------------------------------------------------------------
  return (
    <div style={{ background: theme.bgCard, borderBottom: `1px solid ${theme.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: theme.accentBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <AgentIcon size={23} style={{ color: theme.accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: theme.text }}>{displayName}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: theme.textMuted }}>{agent.tagline}</p>
        </div>
        <span style={{
          padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: 'rgba(34,197,94,0.14)', color: '#15803d',
        }}>Active</span>
        <span style={{
          padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: theme.bg, color: theme.textMuted, border: `1px solid ${theme.border}`,
        }}>{agent.trade_category}</span>
      </div>

      {tabs.length > 0 && (
        <div ref={scrollerRef} style={{ display: 'flex', gap: 4, padding: '0 24px', overflowX: 'auto' }}>
          {tabs.map(tab => {
            const TabIcon = Icons[tab.icon] || Icons.Circle
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 14px', whiteSpace: 'nowrap',
                  fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
                  color: isActive ? theme.accent : theme.textMuted,
                  borderBottom: `2px solid ${isActive ? theme.accent : 'transparent'}`,
                })}
              >
                <TabIcon size={16} />
                {tab.label}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}
