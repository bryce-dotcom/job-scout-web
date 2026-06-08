// Document Rules walkthrough — rebuilt to Prospect Scout standard.
// Source: src/lib/featureKnowledge/document-rules.js (route: /document-rules)
// Auto-attach W-9, COI, MSDS, warranty to quotes by trigger rules.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { FileStack, Plus, CheckCircle, Zap, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/document-rules.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_RULES = [
  { id: 1, trigger: 'customer.business_name is set',      doc: 'W-9 Contractor Form',      active: true  },
  { id: 2, trigger: 'job.service_type = "LED Retrofit"',  doc: 'LED Warranty Certificate', active: true  },
  { id: 3, trigger: 'job.site_requires_coi = true',       doc: 'Certificate of Insurance',  active: true  },
  { id: 4, trigger: 'quote includes Chemical line',        doc: 'MSDS Safety Sheet',        active: false },
  { id: 5, trigger: 'quote.total > $10,000',              doc: 'Scope of Work Agreement',  active: true  },
]

export default function DocumentRulesWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Right documents, every time." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showModal = scene === 'rule'
  const showFire = scene === 'fire'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <FileStack size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Document Rules</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Rule
        </button>
      </div>

      {/* Auto-fired alert (fire scene) */}
      {showFire && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '9px', padding: '10px 12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Zap size={12} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#15803d' }}>3 documents auto-attached to EST-041</span>
          </div>
          <div style={{ fontSize: '10px', color: '#166534' }}>W-9 · LED Warranty Certificate · Scope of Work Agreement</div>
        </motion.div>
      )}

      {/* Rules list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {MOCK_RULES.map((rule, i) => (
          <motion.div key={rule.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px', opacity: rule.active ? 1 : 0.55 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>{rule.doc}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                {/* Toggle */}
                <div style={{ width: '28px', height: '16px', borderRadius: '8px', backgroundColor: rule.active ? T.accent : '#d1d5db', position: 'relative', cursor: 'pointer' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: rule.active ? '14px' : '2px', transition: 'left 0.2s' }} />
                </div>
              </div>
            </div>
            <div style={{ fontSize: '9px', color: T.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={9} style={{ color: rule.active ? T.accent : T.textMuted }} />
              When: <span style={{ color: rule.active ? T.textSecondary : T.textMuted }}>{rule.trigger}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Rule modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Document Rule</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Trigger Condition', 'customer.business_name is set'], ['Document to Attach', 'W-9 Contractor Form']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save Rule</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:  '1 · Document Rules — trigger + document pairs with active/inactive toggle',
    rule:  '2 · Add Rule — set the trigger condition + which document to attach',
    fire:  '3 · Rule fires when quote matches — W-9 + Warranty + Scope auto-attached instantly',
    tog:   '4 · Toggle a rule off to pause it — trigger condition stays saved',
    audit: '5 · Every document attached is logged with the rule that triggered it',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Document Rules work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
