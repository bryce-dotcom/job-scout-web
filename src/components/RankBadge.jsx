import { Shield, Star, Award, Gem, Crown } from 'lucide-react'

/**
 * Scout-themed rank badge for employee skill levels.
 *
 * Each rank has a color and icon that maps to the scouting progression.
 * If the skill_level string doesn't match a known rank, falls back to
 * a generic badge using the accent color.
 *
 * Props:
 *   rank    - string (the employee's skill_level value)
 *   weight  - number (optional, shown as ×N subscript)
 *   size    - 'sm' | 'md' (default 'sm')
 *   theme   - theme object for fallback colors
 */

const RANK_CONFIG = {
  'Scout':        { color: '#2d6a4f', bg: 'rgba(45,106,79,0.12)', icon: Shield },
  'Tenderfoot':   { color: '#52796f', bg: 'rgba(82,121,111,0.12)', icon: Shield },
  'Second Class': { color: '#b08d57', bg: 'rgba(176,141,87,0.12)', icon: Star },
  'First Class':  { color: '#8d99ae', bg: 'rgba(141,153,174,0.14)', icon: Star },
  'Star':         { color: '#d4a017', bg: 'rgba(212,160,23,0.12)', icon: Star },
  'Life':         { color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', icon: Award },
  'Eagle':        { color: '#b91c1c', bg: 'linear-gradient(135deg, rgba(185,28,28,0.12) 0%, rgba(212,160,23,0.10) 100%)', icon: Crown },
}

export const SCOUT_RANKS = [
  { name: 'Scout', weight: 1 },
  { name: 'Tenderfoot', weight: 1.5 },
  { name: 'Second Class', weight: 2 },
  { name: 'First Class', weight: 2.5 },
  { name: 'Star', weight: 3 },
  { name: 'Life', weight: 4 },
  { name: 'Eagle', weight: 5 },
]

export default function RankBadge({ rank, weight, size = 'sm', theme }) {
  if (!rank) return null

  const config = RANK_CONFIG[rank] || {
    color: theme?.accent || '#5a6349',
    bg: theme?.accentBg || 'rgba(90,99,73,0.12)',
    icon: Shield,
  }

  const Icon = config.icon
  const isSm = size === 'sm'
  const iconSize = isSm ? 12 : 14
  const fontSize = isSm ? '11px' : '12px'
  const pad = isSm ? '2px 8px' : '4px 10px'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: isSm ? 4 : 5,
      padding: pad,
      borderRadius: 999,
      background: config.bg,
      border: `1px solid ${config.color}25`,
      color: config.color,
      fontSize,
      fontWeight: 700,
      letterSpacing: 0.3,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={iconSize} />
      {rank}
      {weight != null && weight !== 1 && (
        <span style={{ fontSize: isSm ? '9px' : '10px', opacity: 0.7, fontWeight: 600 }}>
          ×{weight}
        </span>
      )}
    </span>
  )
}
