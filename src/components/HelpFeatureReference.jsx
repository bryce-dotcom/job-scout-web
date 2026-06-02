// Feature Reference — auto-generated Help section.
//
// Renders every Knowledge Card in src/lib/featureKnowledge/ as a
// per-feature accordion grouped by category. The cards are the single
// source of truth that also drive the walkthroughs and Arnie, so
// editing a card updates Help, walkthroughs, and the agent in one go.
//
// Drop-in: <HelpFeatureReference theme={theme} onOpenVideo={(walkthroughId) => ...} />
//
// onOpenVideo is optional — pass it to wire each card's "Watch
// walkthrough" button to the Video Library modal. If omitted, the
// button links via window.location to /support#walkthrough=<id>.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import {
  ChevronDown, ExternalLink, PlayCircle, Search, AlertTriangle,
  Lightbulb, ListChecks, HelpCircle,
} from 'lucide-react'
import { KNOWLEDGE_CARDS_LIST } from '../lib/featureKnowledge/index.js'

// Resolve a lucide icon name (as stored in card.icon) to its component.
function resolveIcon(name, fallback = Icons.Sparkles) {
  if (!name) return fallback
  return Icons[name] || fallback
}

// Group cards by category so the Help page reads like a manual:
// Sales & CRM → Project & Job Management → Lighting & Energy → ...
function groupByCategory(cards) {
  const byCat = new Map()
  for (const c of cards) {
    const k = c.category || 'Other'
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k).push(c)
  }
  // Sort cards alphabetically inside each category — predictable scan.
  for (const arr of byCat.values()) {
    arr.sort((a, b) => a.title.localeCompare(b.title))
  }
  // Preserve a sensible category order matching the Video Library.
  const ORDER = [
    'Sales & CRM',
    'Project & Job Management',
    'Lighting & Energy',
    'Books & Accounting',
    'Payroll, HR & Onboarding',
    'Lawn Care',
    'Operations',
    'Other',
  ]
  return ORDER
    .map(name => ({ name, cards: byCat.get(name) || [] }))
    .filter(g => g.cards.length > 0)
    .concat(
      // Any category we didn't anticipate goes at the end.
      [...byCat.keys()]
        .filter(k => !ORDER.includes(k))
        .map(k => ({ name: k, cards: byCat.get(k) }))
    )
}

export default function HelpFeatureReference({ theme, onOpenVideo }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groupByCategory(KNOWLEDGE_CARDS_LIST)

    // Light, predictable search across title + summary + replaces +
    // setup steps + faqs. Not a fuzzy match — substring is enough here
    // and avoids relevance-ranking surprises.
    const hit = (card) => {
      const hay = [
        card.title,
        card.summary,
        ...(card.replaces || []),
        ...(card.highlights || []),
        card.setup?.overview,
        ...(card.setup?.steps || []).flatMap(s => [s.title, s.body]),
        ...(card.agentKnowledge?.gotchas || []),
        ...(card.agentKnowledge?.faqs || []).flatMap(f => [f.q, f.a]),
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    }
    return groupByCategory(KNOWLEDGE_CARDS_LIST.filter(hit))
  }, [query])

  const totalCards = useMemo(
    () => groups.reduce((n, g) => n + g.cards.length, 0),
    [groups],
  )

  return (
    <div>
      {/* Lead-in copy */}
      <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.6, marginBottom: '12px' }}>
        Every feature in JobScout has a knowledge card — setup steps, gotchas, FAQs, and a video walkthrough. Search or browse by category below.
      </p>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: 9,
        marginBottom: 16,
      }}>
        <Search size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search features, setup steps, gotchas…"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: theme.text,
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{
            border: 'none', background: 'transparent', color: theme.textMuted,
            fontSize: 11, cursor: 'pointer', padding: '2px 6px',
          }}>clear</button>
        )}
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {totalCards} {totalCards === 1 ? 'feature' : 'features'}
        </span>
      </div>

      {totalCards === 0 && (
        <div style={{
          padding: 22, textAlign: 'center',
          color: theme.textMuted, fontSize: 13,
          background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 10,
        }}>
          No features match "{query}". Try a different word.
        </div>
      )}

      {/* Categories */}
      {groups.map(group => (
        <div key={group.name} style={{ marginBottom: 18 }}>
          <h3 style={{
            fontSize: 12, fontWeight: 700, color: theme.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            margin: '0 0 8px 4px',
          }}>
            {group.name}
            <span style={{ marginLeft: 6, color: theme.textMuted, fontWeight: 500 }}>· {group.cards.length}</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.cards.map(card => (
              <CardAccordion
                key={card.id}
                card={card}
                theme={theme}
                open={openId === card.id}
                onToggle={() => setOpenId(prev => prev === card.id ? null : card.id)}
                onOpenVideo={onOpenVideo}
                onOpenRoute={(route) => route && navigate(route)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CardAccordion({ card, theme, open, onToggle, onOpenVideo, onOpenRoute }) {
  const Icon = resolveIcon(card.icon)
  const accent = theme.accent

  return (
    <div style={{
      borderRadius: 10,
      backgroundColor: theme.bgCard,
      border: `1px solid ${open ? accent + '40' : theme.border}`,
      overflow: 'hidden',
      transition: 'border-color 0.25s ease',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          backgroundColor: accent + '15',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={15} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{card.title}</div>
          <div style={{
            fontSize: 12, color: theme.textMuted, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {card.summary}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} color={theme.textMuted} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 14px 14px',
              borderTop: `1px solid ${theme.border}`,
              paddingTop: 12,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <CardBody card={card} theme={theme} />
              <CardActions
                card={card}
                theme={theme}
                onOpenVideo={onOpenVideo}
                onOpenRoute={onOpenRoute}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CardBody({ card, theme }) {
  return (
    <>
      {/* Replaces + highlights chips */}
      {(card.replaces?.length || card.highlights?.length) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {card.replaces?.length > 0 && (
            <ChipRow label="Replaces" items={card.replaces} color="#8b5cf6" theme={theme} />
          )}
          {card.highlights?.length > 0 && (
            <ChipRow label="Highlights" items={card.highlights} color={theme.accent} theme={theme} />
          )}
        </div>
      )}

      {/* Setup steps */}
      {card.setup?.steps?.length > 0 && (
        <Section
          icon={ListChecks}
          title={`Set it up — ${card.setup.steps.length} steps`}
          color={theme.accent}
          theme={theme}
        >
          {card.setup.overview && (
            <p style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.6, margin: '0 0 10px' }}>
              {card.setup.overview}
            </p>
          )}
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {card.setup.steps.map((step, i) => {
              const StepIcon = resolveIcon(step.icon, Lightbulb)
              return (
                <li key={i} style={{
                  display: 'flex', gap: 10,
                  padding: '8px 10px',
                  background: theme.bg, borderRadius: 7,
                  border: `1px solid ${theme.border}`,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: theme.accent + '15', color: theme.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <StepIcon size={12} color={theme.textMuted} />
                      <strong style={{ fontSize: 12, color: theme.text }}>{step.title}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
                      {step.body}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </Section>
      )}

      {/* What it is / how it works */}
      {(card.agentKnowledge?.whatItIs || card.agentKnowledge?.howItWorks) && (
        <Section
          icon={HelpCircle}
          title="Under the hood"
          color="#8b5cf6"
          theme={theme}
        >
          {card.agentKnowledge.whatItIs && (
            <p style={{ fontSize: 12, color: theme.text, lineHeight: 1.6, margin: '0 0 8px' }}>
              {card.agentKnowledge.whatItIs}
            </p>
          )}
          {card.agentKnowledge.howItWorks && (
            <p style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.55, margin: 0, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
              {card.agentKnowledge.howItWorks}
            </p>
          )}
        </Section>
      )}

      {/* Gotchas — warning callouts */}
      {card.agentKnowledge?.gotchas?.length > 0 && (
        <Section
          icon={AlertTriangle}
          title="Gotchas"
          color="#eab308"
          theme={theme}
        >
          <ul style={{ margin: 0, paddingLeft: 16, color: theme.text, fontSize: 12, lineHeight: 1.6 }}>
            {card.agentKnowledge.gotchas.map((g, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{g}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* FAQs */}
      {card.agentKnowledge?.faqs?.length > 0 && (
        <Section
          icon={HelpCircle}
          title="FAQ"
          color="#3b82f6"
          theme={theme}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {card.agentKnowledge.faqs.map((f, i) => (
              <div key={i} style={{
                padding: '8px 10px',
                background: theme.bg, borderRadius: 7,
                border: `1px solid ${theme.border}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, marginBottom: 3 }}>
                  {f.q}
                </div>
                <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.55 }}>
                  {f.a}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* lastVerified freshness chip — small, end-of-card */}
      {card.lastVerified && (
        <FreshnessChip lastVerified={card.lastVerified} freshUntil={card.freshUntil || 90} theme={theme} />
      )}
    </>
  )
}

function CardActions({ card, theme, onOpenVideo, onOpenRoute }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <button
        onClick={() => {
          if (onOpenVideo) {
            onOpenVideo(card.id)
            return
          }
          // Deep-link to the Video Library, which reads the hash on
          // mount + hashchange and auto-opens the matching modal.
          window.location.href = `/admin/videos#walkthrough=${card.id}`
        }}
        style={{
          padding: '7px 12px',
          background: theme.accent, color: '#fff',
          border: 'none', borderRadius: 7,
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}
      >
        <PlayCircle size={13} /> Watch walkthrough
      </button>
      {card.route && (
        <button
          onClick={() => onOpenRoute(card.route)}
          style={{
            padding: '7px 12px',
            background: 'transparent', color: theme.text,
            border: `1px solid ${theme.border}`, borderRadius: 7,
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <ExternalLink size={12} /> Open {card.title}
        </button>
      )}
    </div>
  )
}

function ChipRow({ label, items, color, theme }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', marginRight: 4 }}>
        {label}
      </span>
      {items.map((s, i) => (
        <span key={i} style={{
          padding: '2px 8px', borderRadius: 99,
          background: color + '15', color,
          fontSize: 10, fontWeight: 600,
          border: `1px solid ${color}30`,
        }}>
          {s}
        </span>
      ))}
    </div>
  )
}

function Section({ icon: Icon, title, color, theme, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function FreshnessChip({ lastVerified, freshUntil, theme }) {
  const verified = new Date(lastVerified)
  const ageMs = Date.now() - verified.getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  const stale = ageDays > (freshUntil || 90)
  const color = stale ? '#eab308' : theme.textMuted
  const formatted = verified.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      alignSelf: 'flex-start',
      padding: '3px 8px', borderRadius: 99,
      background: stale ? '#eab30815' : theme.bg,
      border: `1px solid ${stale ? '#eab30830' : theme.border}`,
      fontSize: 10, color, fontWeight: 600,
    }}>
      {stale && <AlertTriangle size={10} />}
      Verified {formatted}
      {stale && ` · may be stale (${ageDays}d)`}
    </div>
  )
}
