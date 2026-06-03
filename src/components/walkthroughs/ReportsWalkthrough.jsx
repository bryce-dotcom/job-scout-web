// Reports walkthrough — KPI dashboards.

import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3, TrendingUp, DollarSign, Users, Mail, Search,
  ArrowUp, ArrowDown, LayoutDashboard,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import { T, ZachShell, Chip } from './zach/ZachShell'
import card from '../../lib/featureKnowledge/reports.js'

export default function ReportsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Owner dashboards that tell the truth." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro, card)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const title = scene === 'sales' ? 'Reports · Sales' :
                scene === 'profit' ? 'Reports · Profitability' :
                scene === 'cash' ? 'Reports · Cash Flow' :
                scene === 'schedule' ? 'Reports · Schedule Email' :
                'Reports'
  return (
    <ZachShell title={title} subtitle="Owner dashboards · real numbers" actionLabel="Customize" actionIcon={LayoutDashboard}>
      {scene === 'open' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { name: 'Sales',         icon: TrendingUp, color: T.accent,      desc: 'Pipeline · win rate · per rep' },
            { name: 'Profitability', icon: DollarSign, color: T.successDark, desc: 'Margin by crew, job type, month' },
            { name: 'Cash Flow',     icon: BarChart3,  color: T.warning,     desc: 'AR aging · AP · fuel trend' },
            { name: 'Team',          icon: Users,      color: T.purple,      desc: 'Utilization · overtime · payroll' },
          ].map((d, i) => (
            <motion.div key={d.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} style={{ padding: 14, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <d.icon size={18} style={{ color: d.color }} />
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{d.name}</div>
              </div>
              <div style={{ fontSize: 10, color: T.textMuted }}>{d.desc}</div>
            </motion.div>
          ))}
        </div>
      )}

      {scene === 'sales' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Stat label="Pipeline" value="$284k" delta="+18%" up icon={DollarSign} />
          <Stat label="Win rate" value="42%" delta="+4pp"  up icon={TrendingUp} />
          <Stat label="Avg deal" value="$8,420" delta="-3%" icon={DollarSign} />
          <div style={{ gridColumn: 'span 3', padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Pipeline by stage</div>
            {[
              { stage: 'New',            n: 12, $: 88, color: '#3b82f6' },
              { stage: 'Contacted',      n: 8,  $: 64, color: '#8b5cf6' },
              { stage: 'Appointment Set', n: 6,  $: 52, color: '#10b981' },
              { stage: 'Quote Sent',     n: 4,  $: 48, color: '#f59e0b' },
              { stage: 'Won',            n: 3,  $: 32, color: '#22c55e' },
            ].map((row, i) => (
              <motion.div key={row.stage} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px 50px', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 11 }}>
                <div style={{ color: T.text, fontWeight: 600 }}>{row.stage}</div>
                <div style={{ height: 8, background: T.bg, borderRadius: 99 }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(row.$ / 88) * 100}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }} style={{ height: '100%', background: row.color, borderRadius: 99 }} />
                </div>
                <div style={{ color: T.text, fontWeight: 700, textAlign: 'right' }}>${row.$}k</div>
                <div style={{ color: T.textMuted, textAlign: 'right' }}>{row.n}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {scene === 'profit' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Gross margin · by crew · 30 days</div>
          {[
            { crew: 'Cole',   margin: 38, color: T.successDark, jobs: 14 },
            { crew: 'Marcus', margin: 31, color: T.successDark, jobs: 11 },
            { crew: 'Priya',  margin: 22, color: T.warning,     jobs: 8 },
            { crew: 'Alayda', margin: 12, color: T.danger,      jobs: 5 },
          ].map((row, i) => (
            <motion.div key={row.crew} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.12 }} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 60px', gap: 10, padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8, marginBottom: 5, alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{row.crew}</div>
              <div style={{ height: 10, background: T.bg, borderRadius: 99 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${row.margin * 2}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }} style={{ height: '100%', background: row.color, borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: row.color, textAlign: 'right' }}>{row.margin}%</div>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'right' }}>{row.jobs} jobs</div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 8, padding: 8, background: T.warningBg, border: `1px solid ${T.warning}`, borderRadius: 6, fontSize: 11, color: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ArrowDown size={12} style={{ color: T.warning }} />
            Alayda's margin dropped 14pp this month · materials overrun on 2 jobs
          </motion.div>
        </div>
      )}

      {scene === 'cash' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <Stat label="AR aging > 30d" value="$24,840" delta="+8%" icon={DollarSign} />
            <Stat label="AP outstanding" value="$8,420" delta="-12%" up icon={DollarSign} />
            <Stat label="Cash on hand" value="$42,118" delta="+18%" up icon={TrendingUp} />
          </div>
          <div style={{ padding: 12, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 9 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Fuel spend · last 12 weeks</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: 3, height: 60 }}>
              {[28, 32, 30, 38, 34, 36, 32, 40, 38, 46, 52, 58].map((v, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${(v / 60) * 100}%` }} transition={{ delay: i * 0.04 }} style={{ flex: 1, background: i > 9 ? T.danger : T.accent, borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ fontSize: 10, color: T.danger, marginTop: 4, fontWeight: 600 }}>↑ trending up · Truck 12 spike on fuel chart</div>
          </div>
        </div>
      )}

      {scene === 'schedule' && (
        <div style={{ background: T.bgCard, border: `1.5px solid ${T.accent}`, borderRadius: 11, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Mail size={18} style={{ color: T.accent }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Email scheduled</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ScheduleRow label="Sales summary"    cadence="Mon 6am"  email="owner@hhh.services" />
            <ScheduleRow label="Profitability"   cadence="Mon 6am"  email="owner@hhh.services" />
            <ScheduleRow label="AR aging"        cadence="Fri 4pm"  email="bookkeeper@hhh.services" />
            <ScheduleRow label="Team utilization" cadence="Mon 6am" email="owner@hhh.services" />
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ marginTop: 10, padding: 8, background: T.successBg, borderRadius: 6, fontSize: 11, color: T.successDark, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Mail size={12} /> 4 reports queued · arrive before the Monday huddle
          </motion.div>
        </div>
      )}
    </ZachShell>
  )
}

function Stat({ label, value, delta, up, icon: Icon }) {
  return (
    <div style={{ padding: 10, background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        {Icon && <Icon size={11} style={{ color: T.textMuted }} />}
        <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{value}</div>
      {delta && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3, fontSize: 10, color: up ? T.successDark : T.danger, fontWeight: 700 }}>
          {up ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
          {delta}
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ label, cadence, email }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: 8, padding: 8, background: T.bg, borderRadius: 6, fontSize: 11 }}>
      <div style={{ color: T.text, fontWeight: 700 }}>{label}</div>
      <Chip>{cadence}</Chip>
      <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 10, textAlign: 'right' }}>{email}</div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const m = {
    open:     '1. Every dashboard you need · sales, profit, cash, team',
    sales:    '2. Sales dashboard · pipeline by stage · win rate',
    profit:   '3. Profitability · margin per crew · spot the bleeders',
    cash:     '4. Cash flow · AR aging · fuel trend',
    schedule: '5. Schedule weekly email · owner inbox before huddle',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Works out of the box'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
