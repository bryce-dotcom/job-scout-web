// The bottom bar, on phones only.
//
// Four destinations plus More, at thumb height. Before this, every one of the
// forty-odd pages sat behind a hamburger in the TOP-RIGHT corner — the hardest
// place to reach on a phone held in one hand, which is how 16 of HHH's 24
// active people use this app: outdoors, in gloves, on a ladder.
//
// Which four is lib/navTabs. This only draws them, and it draws nothing the
// person is not allowed to open, because the routes handed to it are the ones
// Layout already decided to render.

import { NavLink } from 'react-router-dom'
import { Menu, Sparkles } from 'lucide-react'
import { tabLabel } from '../lib/navTabs'

export default function BottomTabs({ items, onMore, moreActive, theme, onArnie, arnieName = 'Arnie' }) {
  if (!items?.length) return null

  const cell = (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '3px',
    // 56px of bar + the home-indicator inset. Below ~44px a thumb misses.
    minHeight: '56px',
    padding: '6px 2px 4px',
    textDecoration: 'none',
    color: active ? theme.accent : theme.textMuted,
    backgroundColor: active ? theme.accentBg : 'transparent',
    borderRadius: '10px',
    // Equal widths that can SHRINK. flex:1 alone leaves basis at auto, so a
    // long label widens its own tab and pushes the bar past the screen.
    flex: '1 1 0',
    minWidth: 0,
  })

  const text = {
    fontSize: '10.5px', fontWeight: 600, lineHeight: 1.1,
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }

  return (
    <nav
      className="md:hidden"
      aria-label="Main"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 48,
        backgroundColor: theme.bgCard,
        borderTop: `1px solid ${theme.border}`,
        // Clear of the iPhone home indicator, zero on everything else.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 12px rgba(44,53,48,0.08)',
        // Flex, not grid: Layout's responsive CSS sets
        // `.md:hidden { display: flex !important }` on mobile, which would
        // win over an inline grid and collapse the columns.
        display: 'flex',
        alignItems: 'stretch',
        gap: '2px',
        padding: '4px 4px 0',
      }}
    >
      {/* Arnie sits in the MIDDLE of the row, not at an end: it is the one
          slot that is not a page, and the middle is where the thumb rests. */}
      {items.slice(0, Math.ceil(items.length / 2)).map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => cell(isActive && !moreActive)}
          >
            {Icon && <Icon size={21} />}
            <span style={text}>{tabLabel(item)}</span>
          </NavLink>
        )
      })}

      <button
        type="button"
        onClick={onArnie}
        aria-label={`Ask ${arnieName}`}
        style={{ ...cell(false), border: 'none', cursor: 'pointer', font: 'inherit', color: theme.accent }}
      >
        <Sparkles size={21} />
        <span style={text}>{arnieName}</span>
      </button>

      {items.slice(Math.ceil(items.length / 2)).map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => cell(isActive && !moreActive)}
          >
            {Icon && <Icon size={21} />}
            <span style={text}>{tabLabel(item)}</span>
          </NavLink>
        )
      })}

      {/* More opens the drawer that already exists, with everything in it. */}
      <button
        type="button"
        onClick={onMore}
        aria-label="More"
        style={{ ...cell(moreActive), border: 'none', cursor: 'pointer', font: 'inherit' }}
      >
        <Menu size={21} />
        <span style={text}>More</span>
      </button>
    </nav>
  )
}
