// Employees walkthrough.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Palette, DollarSign, BadgeCheck, AlertCircle,
  Send, Calendar,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/employees.js'

const ROSTER = [
  { name: 'Cole Westbrook', role: 'Lead Tech',  rate: 38, hours: 8, color: '#22c55e', status: 'active' },
  { name: 'Marcus Reeves',  role: 'Lead Tech',  rate: 32, hours: 8, color: '#3b82f6', status: 'active' },
  { name: 'Priya Anand',    role: 'Lead Tech',  rate: 36, hours: 8, color: '#a855f7', status: 'active' },
  { name: 'Alayda Reyes',   role: 'Setter',     rate: 22, hours: 6, color: '#f59e0b', status: 'active' },
  { name: 'Sarah Chen',     role: 'Sales Rep',  rate: 28, hours: 8, color: '#ec4899', status: 'active' },
  { name: 'David Okafor',   role: 'Admin',      rate: 30, hours: 8, color: '#6366f1', status: 'active' },
  { name: 'Tony Romero',    role: 'Tech',       rate: 24, hours: 8, color: '#14b8a6', status: 'active' },
  { name: 'Mike Sloan',     role: 'Tech',       rate: 24, hours: 8, color: '#ef4444', status: 'inactive' },
]

export default function EmployeesWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Set the roster once. Maintenance is light." />}
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
    <ZachShell title="Employees · 8 on roster" subtitle="Admin directory · pay rates · certifications" actionLabel="New Hire" actionIcon={UserPlus} actionHighlight={scene === 'invite'}>
      {scene === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ROSTER.filter(r => r.status === 'active').slice(0, 6).map((r, i) => (
            <motion.div key={r.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 70px 60px 60px', gap: 10, alignItems: 'center', padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {r.name[0]}
              </div>
              <div>
                <div style={{ color: T.text, fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted }}>{r.role}</div>
              </div>
              <div style={{ color: T.text, fontWeight: 600 }}>${r.rate}/hr</div>
              <div style={{ color: T.textMuted, fontSize: 10 }}>{r.hours}h allotted</div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: r.color }} />
              <Chip color={T.successDark} bg={T.successBg}>active</Chip>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'detail' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>C</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Cole Westbrook</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>Lead Tech · hired Mar 14, 2024</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Palette size={10} style={{ color: T.textMuted }} />
                <span style={{ fontSize: 9, color: T.textMuted }}>calendar color: green</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <Field label="Hourly"      value="$38.00" />
            <Field label="Allotted hrs" value="8 / day" />
            <Field label="Setter rate" value="—" />
            <Field label="Rep rate"    value="—" />
          </div>
        </div>
      )}

      {scene === 'pay' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Pay rates · drives payroll</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ROSTER.filter(r => r.status === 'active').slice(0, 6).map((r, i) => (
              <motion.div key={r.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 80px 80px', gap: 10, alignItems: 'center', padding: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 11 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: r.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{r.name[0]}</div>
                <div style={{ color: T.text, fontWeight: 700 }}>{r.name}</div>
                <Chip>{r.role}</Chip>
                <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${r.rate}/hr</div>
                <div style={{ color: T.textMuted, textAlign: 'right', fontSize: 10 }}>${(r.rate * r.hours * 80).toLocaleString()}/mo</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {scene === 'certs' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Certifications · expirations tracked</div>
          {[
            { who: 'Cole',   cert: 'Electrical license',  expires: '2026-08-31', days: 90,  color: T.warning,     status: 'renewing' },
            { who: 'Marcus', cert: 'EPA 608',              expires: '2027-04-12', days: 320, color: T.successDark, status: 'valid' },
            { who: 'Priya',  cert: 'OSHA 30',              expires: '2026-12-04', days: 184, color: T.successDark, status: 'valid' },
            { who: 'Cole',   cert: 'Lift certification',  expires: '2026-06-20', days: 17,  color: T.danger,      status: 'expiring' },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 100px 80px', gap: 10, padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 7, marginBottom: 5, alignItems: 'center', fontSize: 11 }}>
              <BadgeCheck size={16} style={{ color: c.color }} />
              <div style={{ color: T.text, fontWeight: 700 }}>{c.who}</div>
              <div style={{ color: T.text }}>{c.cert}</div>
              <div style={{ color: T.textMuted, fontSize: 10 }}>{c.expires}</div>
              <Chip color={c.color} bg={c.color + '20'}>{c.days}d {c.status === 'expiring' ? 'left!' : ''}</Chip>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.12)', border: `1px solid ${T.danger}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={12} style={{ color: T.danger }} />
            Cole's lift cert expires in 17d · renewal task auto-fired
          </motion.div>
        </div>
      )}

      {scene === 'invite' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 18, maxWidth: 380 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <UserPlus size={20} style={{ color: T.accent }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Send Onboarding Link</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <FormField label="Name" value="Brandon Mitchell" />
              <FormField label="Role" value="Tech" />
              <FormField label="Phone" value="(801) 555-0410" />
              <FormField label="Email" value="brandon@hhh.services" />
            </div>
            <motion.button animate={{ scale: [0.95, 1] }} style={{ marginTop: 10, padding: '10px 14px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
              <Send size={13} /> Send magic link
            </motion.button>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.successBg, borderRadius: 6, fontSize: 11, color: T.successDark, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Calendar size={12} /> Link valid 14 days · self-serve W-4 + I-9 + deposit
            </motion.div>
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function Field({ label, value }) {
  return (
    <div style={{ padding: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: T.text, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function FormField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, color: T.text }}>{value}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    list:   '1. Staff roster · roles, rates, calendar colors',
    detail: '2. Per employee · hourly, allotted hrs, overrides',
    pay:    '3. Pay rates · drives payroll math',
    certs:  '4. Certifications · expirations auto-flagged',
    invite: '5. New hire? Send magic link · phone-first self-serve',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Set roster once · maintenance is light'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
