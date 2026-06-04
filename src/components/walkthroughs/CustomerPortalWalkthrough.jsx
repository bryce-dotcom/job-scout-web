// Customer Portal walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/CustomerPortal.jsx
// Public /portal/:token page — no login. Mobile-first.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, CreditCard, Globe, Lock, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/customer-portal.js'

// ─── Theme — matches CustomerPortal.jsx inline theme object ───────────────
const T = {
  bg:         '#f7f5ef',
  bgCard:     '#ffffff',
  border:     '#d6cdb8',
  text:       '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:  '#7d8a7f',
  accent:     '#5a6349',
  accentBg:   'rgba(90,99,73,0.12)',
  success:    '#4a7c59',
  successBg:  'rgba(74,124,89,0.12)',
}

// Mock estimate line items (matching quote_lines shape)
const LINE_ITEMS = [
  { item_name: '48" LED Strip Fixture (Type A)',  quantity: 24, unit_price: 350,  line_total: 8400 },
  { item_name: 'LED Driver — 100W',               quantity: 24, unit_price: 100,  line_total: 2400 },
  { item_name: 'Installation Labor',              quantity: 40, unit_price: 342.5,line_total: 13700 },
]
const ESTIMATE_TOTAL = LINE_ITEMS.reduce((s, l) => s + l.line_total, 0) // 24500

// ─── Root ──────────────────────────────────────────────────────────────────
export default function CustomerPortalWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: T.bg, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Customer portal is live." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage ─────────────────────────────────────────────────────────────────
function Stage({ scene }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text,
      backgroundColor: '#e8e4dc',
    }}>
      {/* Mock phone browser bar */}
      <BrowserBar />
      {/* Portal content scrolled in a white-bg phone "screen" */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '8px 12px', position: 'relative' }}>
        <PortalView scene={scene} />
      </div>
    </div>
  )
}

// ─── Browser bar ──────────────────────────────────────────────────────────
function BrowserBar() {
  return (
    <div style={{
      backgroundColor: '#2c2c2e', padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {['#ff5f57','#febc2e','#28c840'].map(c => (
          <div key={c} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: c }} />
        ))}
      </div>
      <div style={{ flex: 1, backgroundColor: '#3a3a3c', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Lock size={10} style={{ color: '#30d158', flexShrink: 0 }} />
        <span style={{ fontSize: '10px', color: '#ebebf5', fontFamily: 'monospace' }}>
          job-scout.app/portal/kx4m9a…
        </span>
      </div>
    </div>
  )
}

// ─── Portal view (mobile-width card stack) ────────────────────────────────
function PortalView({ scene }) {
  const showApproveModal = scene === 'sign'
  const showPayButton = scene === 'invoice' || scene === 'pay'
  const showSuccess = scene === 'pay'
  const isInvoice = scene === 'invoice' || scene === 'pay'

  return (
    <div style={{
      width: '100%', maxWidth: '380px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      overflowY: 'auto', position: 'relative',
    }}>
      {/* Payment success banner — lines 340-350 */}
      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            backgroundColor: T.successBg, border: `1px solid ${T.success}`,
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px' }}>
            <CheckCircle2 size={18} style={{ color: T.success, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '600', color: T.success, fontSize: '12px' }}>Payment Successful</div>
              <div style={{ color: T.textSecondary, fontSize: '10px', marginTop: '2px' }}>Thank you! Your payment has been received.</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Header card — lines 366-391 */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, overflow: 'hidden' }}
      >
        {/* 4px accent stripe at top */}
        <div style={{ height: '4px', backgroundColor: T.accent }} />
        <div style={{ padding: '14px 18px', textAlign: 'center' }}>
          {/* Company "logo" placeholder */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={14} style={{ color: T.accent }} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Acme Solar</span>
          </div>
          <div style={{ display: 'inline-block', backgroundColor: T.accentBg, padding: '4px 14px', borderRadius: '18px', marginBottom: isInvoice ? '8px' : showSuccess ? '8px' : '0' }}>
            <span style={{ color: T.accent, fontSize: '12px', fontWeight: '600' }}>
              {isInvoice ? 'Invoice INV-047' : 'Estimate EST-041'}
            </span>
          </div>
          {/* Approved / Paid badge */}
          {(scene === 'sign' || scene === 'approved') && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ padding: '3px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', backgroundColor: T.successBg, color: T.success }}>
                Approved
              </span>
            </div>
          )}
          {showSuccess && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ padding: '3px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', backgroundColor: T.successBg, color: T.success }}>
                Paid
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Customer info card — lines 394-411 */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '14px 18px' }}
      >
        <div style={{ fontSize: '10px', fontWeight: '600', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          {isInvoice ? 'Billed To' : 'Prepared For'}
        </div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Northbridge Logistics</div>
        <div style={{ fontSize: '11px', color: T.textSecondary, marginTop: '2px' }}>Marcus Okafor</div>
        <div style={{ fontSize: '11px', color: T.textSecondary }}>1440 S Temple, Salt Lake City, UT 84115</div>
        <div style={{ fontSize: '11px', color: T.textSecondary }}>marcus@northbridge.co</div>
      </motion.div>

      {/* Line items (estimate only) — lines 424-503 */}
      {!isInvoice && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '14px 18px' }}
        >
          <div style={{ fontSize: '11px', fontWeight: '600', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Line Items</div>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {LINE_ITEMS.map((li, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '9px 0', borderBottom: `1px solid ${T.border}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: T.text, marginBottom: '2px' }}>{li.item_name}</div>
                  <div style={{ fontSize: '10px', color: T.textMuted }}>
                    {li.quantity} × ${li.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, marginLeft: '12px', whiteSpace: 'nowrap' }}>
                  ${li.line_total.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Total</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: T.accent }}>${ESTIMATE_TOTAL.toLocaleString()}</span>
          </div>
        </motion.div>
      )}

      {/* Invoice details (invoice only) — lines 505-540 */}
      {isInvoice && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          style={{ backgroundColor: T.bgCard, borderRadius: '10px', border: `1px solid ${T.border}`, padding: '14px 18px' }}
        >
          <div style={{ fontSize: '11px', fontWeight: '600', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Invoice Details</div>
          {[
            { label: 'Subtotal', value: '$24,500.00' },
            { label: 'Previously Paid', value: '−$0.00' },
            { label: 'Balance Due', value: '$24,500.00', bold: true },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: T.textMuted }}>{row.label}</span>
              <span style={{ fontSize: row.bold ? '14px' : '12px', fontWeight: row.bold ? '700' : '500', color: row.bold ? T.text : T.textSecondary }}>
                {row.value}
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Approve button (estimate, not yet signed) */}
      {!isInvoice && scene !== 'sign' && scene !== 'approved' && (
        <motion.button
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
            backgroundColor: T.accent, color: '#fff', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer',
          }}
        >
          Review & Approve
        </motion.button>
      )}

      {/* Pay button (invoice) */}
      {showPayButton && !showSuccess && (
        <motion.button
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          style={{
            width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
            backgroundColor: '#16a34a', color: '#fff', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <CreditCard size={15} />
          Pay $24,500.00
        </motion.button>
      )}

      {/* Approve modal — lines 352-365 area, plus signature */}
      {showApproveModal && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            backgroundColor: 'rgba(0,0,0,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{
            backgroundColor: T.bgCard, borderRadius: '12px',
            border: `1px solid ${T.border}`, width: '100%', maxWidth: '340px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Review & Approve</span>
              <X size={14} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Your Name</label>
                <div style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '6px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>
                  Marcus Okafor
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '4px' }}>Signature</label>
                {/* Mock signature canvas */}
                <div style={{
                  height: '60px', border: `1px solid ${T.border}`, borderRadius: '6px',
                  backgroundColor: T.bg, display: 'flex', alignItems: 'center',
                  paddingLeft: '10px',
                }}>
                  {/* Simulated handwriting */}
                  <svg width="140" height="40" viewBox="0 0 140 40">
                    <path d="M10 30 Q20 8 35 28 Q50 45 65 20 Q75 8 90 25 Q105 40 120 18" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <div style={{ fontSize: '9px', color: T.textMuted, lineHeight: 1.5 }}>
                By approving you agree to the scope of work. This signature is recorded with your IP address, browser, and a document fingerprint.
              </div>
              <button style={{ padding: '9px', border: 'none', borderRadius: '8px', backgroundColor: T.accent, color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Confirm Approval
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    send:      '1 · job-scout.app/portal/:token — no login, no app, just the link',
    open:      '2 · Customer sees company header, estimate number, line items + total',
    sign:      '3 · Review & Approve → signature modal records IP, UA, doc fingerprint',
    invoice:   '4 · Invoice view — balance due + one-click Stripe Pay button',
    pay:       '5 · Payment Successful banner · invoice marked Paid',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How the portal works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
