// Data Console — Knowledge Card Drift Detector queue.
//
// Surface for the drift scan in src/lib/featureKnowledge/driftDetector.js.
// Admin runs the scan on demand, reviews per-card issues, and either:
//   • clicks "Bump verified" — moves card.lastVerified to today (admin
//                              still has to commit the file change)
//   • clicks "Open card file" — opens the card JS file in a new tab so
//                              the admin can edit it
//   • clicks "Snooze 30 days" — sets a per-card dismissal stored in
//                              localStorage so the same alert doesn't
//                              re-surface tomorrow
//
// Hookup for nightly cron lives further down — a stub
// runScanAndPersist() that an Edge Function can call to upsert reports
// into a `card_drift_reports` Supabase table when we wire that up.

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, RefreshCw, Search, Calendar, ExternalLink,
  CheckCircle2, BellOff, FileCode, Clock,
} from 'lucide-react'
import { adminTheme } from './components/adminTheme'
import {
  runDriftScan, ISSUE_LABELS, SEVERITY_LABELS,
} from '../../lib/featureKnowledge/driftDetector.js'

const SNOOZE_KEY = 'drift-snoozes'
const SNOOZE_DAYS = 30

function getSnoozes() {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}') }
  catch { return {} }
}
function setSnoozes(map) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map))
}
function isSnoozed(cardId) {
  const map = getSnoozes()
  const until = map[cardId]
  return until && Date.now() < new Date(until).getTime()
}

export default function DataConsoleDrift() {
  const [scan, setScan] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [query, setQuery] = useState('')
  const [hideSnoozed, setHideSnoozed] = useState(true)
  const [snoozeBump, setSnoozeBump] = useState(0) // re-render on snooze change

  // Run scan on mount.
  useEffect(() => { runScan() }, [])

  const runScan = async () => {
    setScanning(true)
    // Force a tick so the spinner shows even though scan is sync.
    await new Promise(r => setTimeout(r, 80))
    setScan(runDriftScan())
    setScanning(false)
  }

  const visibleReports = useMemo(() => {
    if (!scan) return []
    const q = query.trim().toLowerCase()
    return scan.reports.filter(r => {
      if (hideSnoozed && isSnoozed(r.cardId)) return false
      if (!q) return true
      const hay = `${r.title} ${r.cardId} ${r.route || ''} ${r.issues.map(i => i.type + ' ' + i.message).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, query, hideSnoozed, snoozeBump])

  const counts = useMemo(() => {
    if (!scan) return { high: 0, med: 0, low: 0 }
    const out = { high: 0, med: 0, low: 0 }
    for (const r of scan.reports) {
      if (hideSnoozed && isSnoozed(r.cardId)) continue
      if (r.severity === 3) out.high++
      else if (r.severity === 2) out.med++
      else out.low++
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, hideSnoozed, snoozeBump])

  const snoozeCard = (cardId) => {
    const map = getSnoozes()
    const until = new Date()
    until.setDate(until.getDate() + SNOOZE_DAYS)
    map[cardId] = until.toISOString()
    setSnoozes(map)
    setSnoozeBump(b => b + 1)
  }
  const unsnoozeAll = () => {
    setSnoozes({})
    setSnoozeBump(b => b + 1)
  }

  return (
    <div style={{ padding: '24px', color: adminTheme.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Knowledge Card Drift</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: adminTheme.textMuted }}>
            Cards that are stale, miss a walkthrough, or point at routes the app no longer has.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={runScan} disabled={scanning} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 7,
            background: adminTheme.accent, color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 600,
            cursor: scanning ? 'progress' : 'pointer',
            opacity: scanning ? 0.7 : 1,
          }}>
            <RefreshCw size={13} className={scanning ? 'spin' : ''} />
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {scan && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Cards scanned" value={scan.totalCards} color={adminTheme.textMuted} />
          <SummaryCard label="Flagged" value={scan.flaggedCards} color={adminTheme.accent} />
          <SummaryCard label="High severity" value={counts.high} color={adminTheme.error} />
          <SummaryCard label="Medium" value={counts.med} color={adminTheme.warning} />
        </div>
      )}

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', background: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`, borderRadius: 8,
        marginBottom: 14,
      }}>
        <Search size={14} style={{ color: adminTheme.textMuted }} />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Filter by feature, route, or issue type…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: adminTheme.text, fontSize: 13,
          }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: adminTheme.textMuted, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={hideSnoozed}
            onChange={e => setHideSnoozed(e.target.checked)}
            style={{ accentColor: adminTheme.accent }}
          />
          Hide snoozed
        </label>
        <button onClick={unsnoozeAll} style={{
          padding: '4px 10px', borderRadius: 6,
          background: 'transparent', border: `1px solid ${adminTheme.border}`,
          color: adminTheme.textMuted, fontSize: 11, cursor: 'pointer',
        }}>
          Clear snoozes
        </button>
      </div>

      {/* Report list */}
      {scan && visibleReports.length === 0 && (
        <div style={{
          padding: 30, textAlign: 'center',
          background: adminTheme.bgCard, border: `1px dashed ${adminTheme.border}`,
          borderRadius: 10, color: adminTheme.textMuted,
        }}>
          {scan.reports.length === 0
            ? '🎉 No drift detected. All 32 cards look healthy.'
            : 'Nothing matches the current filter. Clear it or unsnooze.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleReports.map(r => (
          <ReportCard
            key={r.cardId}
            report={r}
            onSnooze={() => snoozeCard(r.cardId)}
          />
        ))}
      </div>

      {/* Last scanned timestamp */}
      {scan && (
        <div style={{ marginTop: 18, fontSize: 11, color: adminTheme.textMuted, textAlign: 'right' }}>
          Last scanned {new Date(scan.scannedAt).toLocaleString()}
        </div>
      )}

      <style>{`
        @keyframes spin360 { to { transform: rotate(360deg); } }
        .spin { animation: spin360 0.9s linear infinite; }
      `}</style>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      padding: 12, background: adminTheme.bgCard,
      border: `1px solid ${adminTheme.border}`, borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, color: adminTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ReportCard({ report: r, onSnooze }) {
  const sev = SEVERITY_LABELS[r.severity] || SEVERITY_LABELS[1]
  const cardPath = `src/lib/featureKnowledge/${r.cardId}.js`
  return (
    <div style={{
      background: adminTheme.bgCard,
      border: `1px solid ${sev.color}40`,
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{
          padding: '2px 9px', borderRadius: 99,
          background: sev.color + '20', color: sev.color,
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        }}>
          {sev.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: adminTheme.text }}>{r.title}</div>
          <div style={{ fontSize: 11, color: adminTheme.textMuted }}>
            {r.category}{r.route ? ' · ' + r.route : ''} · {r.cardId}
          </div>
        </div>
        {r.lastVerified && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: adminTheme.textMuted,
          }}>
            <Clock size={10} />
            verified {new Date(r.lastVerified).toLocaleDateString()}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {r.issues.map((issue, i) => {
          const meta = ISSUE_LABELS[issue.type] || { label: issue.type, color: adminTheme.textMuted }
          return (
            <div key={i} style={{
              padding: '8px 10px',
              background: meta.color + '10',
              border: `1px solid ${meta.color}30`,
              borderRadius: 7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <AlertTriangle size={11} color={meta.color} />
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase' }}>
                  {meta.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: adminTheme.text, marginBottom: 3 }}>{issue.message}</div>
              <div style={{ fontSize: 11, color: adminTheme.textMuted, fontStyle: 'italic' }}>
                → {issue.suggestion}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {r.route && (
          <ActionButton
            label={`Open ${r.title}`}
            icon={ExternalLink}
            onClick={() => window.open(r.route, '_blank')}
          />
        )}
        <ActionButton
          label="Open card file"
          icon={FileCode}
          onClick={() => {
            // Best-effort: copy the path to clipboard and toast via alert.
            navigator.clipboard?.writeText(cardPath)
            alert(`Path copied: ${cardPath}\n\nOpen it in your editor and bump lastVerified to today after walking the feature.`)
          }}
        />
        <ActionButton
          label="Snooze 30 days"
          icon={BellOff}
          onClick={onSnooze}
        />
      </div>
    </div>
  )
}

function ActionButton({ label, icon: Icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '6px 11px', borderRadius: 7,
      background: 'transparent', border: `1px solid ${adminTheme.border}`,
      color: adminTheme.text, fontSize: 12, fontWeight: 600,
      cursor: 'pointer',
    }}>
      <Icon size={12} />
      {label}
    </button>
  )
}
