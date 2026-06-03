// Document Rules & Packages walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  FileStack, FileText, Filter, PenLine, Archive, CheckCircle2,
  AlertCircle, ArrowRight,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/document-rules.js'

export default function DocumentRulesWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, setupIdx, setupShowingIntro, elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist"><SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} /></CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Never forget the COI again." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <ZachShell title="Document Rules" subtitle="Auto-attach docs to quotes by trigger" actionLabel="New Rule" actionIcon={Filter}>
      {scene === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { name: 'B2B requires W-9',         trigger: 'customer.type = Commercial', pkg: 'W-9 Package',          color: T.purple },
            { name: 'Lighting needs warranty',  trigger: 'service_type = Lighting',     pkg: 'Lighting Retrofit',    color: T.accent },
            { name: 'School districts need COI', trigger: 'customer.requires_coi = true', pkg: 'Insurance Certs',    color: T.warning },
          ].map((r, i) => (
            <motion.div key={r.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Filter size={14} style={{ color: r.color }} />
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text, flex: 1 }}>{r.name}</div>
                <Chip color={T.successDark} bg={T.successBg}>active</Chip>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 20px 1fr', gap: 8, alignItems: 'center', fontSize: 11 }}>
                <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>when</div>
                <div style={{ color: T.text, fontFamily: 'monospace', fontSize: 10 }}>{r.trigger}</div>
                <ArrowRight size={12} style={{ color: T.textMuted }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <FileStack size={11} style={{ color: r.color }} />
                  <span style={{ color: T.text, fontWeight: 700 }}>{r.pkg}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'trigger' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9, padding: 14, maxWidth: 220 }}>
            <Chip>New quote</Chip>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: T.text }}>EST-2160 · Highland HS</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>customer.type = School District</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>customer.requires_coi = true</div>
          </motion.div>
          <motion.div animate={{ x: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
            <ArrowRight size={28} style={{ color: T.accent }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} style={{ background: T.bgCard, border: `1.5px solid ${T.warning}`, borderRadius: 9, padding: 14, maxWidth: 250 }}>
            <Chip color={T.warning} bg={T.warningBg}>Rule fired · COI attached</Chip>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <DocPill name="Certificate of Insurance.pdf" />
              <DocPill name="Workers Comp Cert.pdf" />
            </div>
          </motion.div>
        </div>
      )}

      {scene === 'package' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <FileStack size={18} style={{ color: T.accent }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Package · Lighting Retrofit</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>4 docs · one attach</div>
            </div>
          </div>
          {[
            { name: 'DLC Spec Sheet · 4ft LED',   type: 'PDF · 280 KB' },
            { name: '5-Year Limited Warranty',     type: 'PDF · 120 KB' },
            { name: 'Install Instructions',         type: 'PDF · 1.2 MB' },
            { name: 'RMP Rebate Form',              type: 'PDF · 80 KB' },
          ].map((d, i) => (
            <motion.div key={d.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px', gap: 10, padding: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 5, alignItems: 'center' }}>
              <div style={{ width: 30, height: 30, borderRadius: 6, background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={13} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{d.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'right' }}>{d.type}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'track' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Signature tracking · EST-2147</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { name: 'DLC Spec Sheet',         signed: true,  who: 'Sarah · May 28 10:14am' },
              { name: 'Warranty Acknowledge',   signed: true,  who: 'Sarah · May 28 10:14am' },
              { name: 'Install Authorization',  signed: true,  who: 'Sarah · May 28 10:14am' },
              { name: 'RMP Rebate Authorization', signed: false, who: 'Waiting · sent 5/28' },
            ].map((d, i) => (
              <motion.div key={d.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 130px', gap: 8, padding: 8, background: T.bgCard, border: `1.5px solid ${d.signed ? T.successDark : T.warning}`, borderRadius: 6, alignItems: 'center', fontSize: 11 }}>
                {d.signed
                  ? <CheckCircle2 size={18} style={{ color: T.successDark }} />
                  : <AlertCircle  size={18} style={{ color: T.warning }} />}
                <div>
                  <div style={{ color: T.text, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 9, color: T.textMuted }}>{d.who}</div>
                </div>
                <Chip color={d.signed ? T.successDark : T.warning} bg={d.signed ? T.successBg : T.warningBg}>{d.signed ? 'signed' : 'pending'}</Chip>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.warningBg, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={12} style={{ color: T.warning }} />
            3 / 4 signed · auto-nudge sent to Sarah for the last one
          </motion.div>
        </div>
      )}

      {scene === 'vault' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Archive size={18} style={{ color: T.purple }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Signed Documents Vault</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Auditable · searchable · year-end-ready</div>
            </div>
            <Chip color={T.purple} bg={T.purpleBg}>1,248 docs</Chip>
          </div>
          {[
            { name: 'Northbridge · Install Auth',   signed: 'May 28 2026', ip: '24.116.x.x' },
            { name: 'Solera · Warranty Ack',         signed: 'May 27 2026', ip: '70.182.x.x' },
            { name: 'Cypress · COI Cert',            signed: 'May 24 2026', ip: '70.18.x.x' },
            { name: 'Granite · DLC Spec Ack',        signed: 'May 22 2026', ip: '24.108.x.x' },
          ].map((d, i) => (
            <motion.div key={d.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px 110px', gap: 8, padding: '6px 8px', borderBottom: `1px dashed ${T.border}`, fontSize: 10, alignItems: 'center' }}>
              <PenLine size={11} style={{ color: T.successDark }} />
              <div style={{ color: T.text, fontWeight: 600 }}>{d.name}</div>
              <div style={{ color: T.textMuted }}>{d.signed}</div>
              <div style={{ color: T.textMuted, fontFamily: 'monospace', textAlign: 'right' }}>{d.ip}</div>
            </motion.div>
          ))}
        </div>
      )}
    </ZachShell>
  )
}

function DocPill({ name }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: T.bg, borderRadius: 99, fontSize: 10, color: T.text }}>
      <FileText size={10} style={{ color: T.warning }} />
      {name}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    rules:   '1. Three rules · B2B, lighting, COI · always-on',
    trigger: '2. New school-district quote → COI auto-attached',
    package: '3. One package · 4 docs · DLC + warranty + install + rebate',
    track:   '4. Per-doc signature tracking · 3 of 4 signed',
    vault:   '5. Signed docs vault · auditable · IP + timestamp logged',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Build rules · packages · forget paperwork'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
