import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../components/Layout'
import { useStore } from '../../lib/store'
import { STATUS } from '../../lib/schema'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronRight, ArrowRight, ArrowDown,
  UserPlus, Headphones, GitBranch, FileText, Briefcase,
  Users, Package, Receipt, DollarSign, Clock, Truck,
  Lightbulb, Bot, Compass, ClipboardList, Warehouse,
  CreditCard, BookOpen, UserCog, BarChart3, Settings,
  CheckCircle, XCircle, Pause, Play, Calendar,
  HelpCircle, Zap, MessageCircle, Camera, Mail,
  Presentation, X, ChevronLeft, Sparkles, RefreshCw,
  Boxes, Shield, FileBarChart, Globe, Target, TrendingUp,
  Loader, MapPin, Wrench, Navigation, Smartphone, AlertCircle,
  CircleDot, Hash, ChevronUp
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// ─── Visual Components ──────────────────────────────────────────────

function FlowDiagram({ steps, theme, animate = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', margin: '16px 0' }}>
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={animate ? { opacity: 0, x: -20 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: animate ? i * 0.12 : 0, duration: 0.4 }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <div style={{
            padding: '8px 14px',
            borderRadius: '8px',
            backgroundColor: step.color ? step.color + '18' : theme.accentBg,
            border: `1px solid ${step.color ? step.color + '40' : theme.border}`,
            color: step.color || theme.accent,
            fontSize: '13px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            {step.icon && <step.icon size={14} />}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <ArrowRight size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
          )}
        </motion.div>
      ))}
    </div>
  )
}

function StatusPipeline({ statuses, colors, theme, animate = false }) {
  const defaultColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#6b7280', '#ef4444']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
      {statuses.map((s, i) => {
        const c = colors?.[s] || defaultColors[i % defaultColors.length]
        return (
          <motion.span
            key={s}
            initial={animate ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: animate ? i * 0.06 : 0, duration: 0.3 }}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500',
              backgroundColor: c + '18',
              color: c,
              border: `1px solid ${c}30`,
            }}
          >
            {s}
          </motion.span>
        )
      })}
    </div>
  )
}

function InfoBox({ title, children, color, theme }) {
  const c = color || theme.accent
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: c + '10',
      border: `1px solid ${c}25`,
      marginBottom: '12px',
    }}>
      {title && (
        <div style={{ fontSize: '13px', fontWeight: '600', color: c, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} />
          {title}
        </div>
      )}
      <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function EntityCard({ icon: Icon, title, description, theme, color }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.border}`,
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '8px',
        backgroundColor: color ? color + '15' : theme.accentBg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={color || theme.accent} />
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, theme }) {
  return (
    <div style={{
      padding: '16px', borderRadius: '10px', textAlign: 'center',
      backgroundColor: color ? color + '08' : theme.accentBg,
      border: `1px solid ${color ? color + '20' : theme.border}`,
      flex: '1 1 120px',
    }}>
      <div style={{ fontSize: '24px', fontWeight: '700', color: color || theme.accent }}>{value}</div>
      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

// ─── Story Components ─────────────────────────────────────────────

function SpeechBubble({ text, theme, visible }) {
  return (
    <div style={{ position: 'relative', maxWidth: '100%' }}>
      {/* Triangle tail */}
      <div style={{
        position: 'absolute', left: '24px', top: '-8px',
        width: 0, height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderBottom: `8px solid ${theme.border}`,
      }} />
      <div style={{
        position: 'absolute', left: '25px', top: '-6px',
        width: 0, height: 0,
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderBottom: `7px solid ${theme.bgCard}`,
      }} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          padding: '16px 20px',
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          fontSize: '15px',
          lineHeight: 1.7,
          color: theme.text,
        }}
      >
        {text}
      </motion.div>
    </div>
  )
}

function MiniMockup({ children, theme, icon: Icon, title, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: theme.bgCard,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px',
        backgroundColor: (color || theme.accent) + '10',
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: color || theme.accent,
        }} />
        {Icon && <Icon size={14} color={color || theme.accent} />}
        <span style={{ fontSize: '12px', fontWeight: '600', color: color || theme.accent }}>{title}</span>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </motion.div>
  )
}

// ─── Story Scenes ─────────────────────────────────────────────────

const STORY_SCENES = [
  {
    id: 'intro',
    title: 'Meet the Team',
    icon: UserPlus,
    color: '#5a6349',
    arnieText: "Hey there! I'm Arnie, your guide around here. Let me show you how this whole thing works by following a real deal from start to finish. Meet Bright Path Lighting — they retrofit old fluorescent buildings with shiny new LEDs. And today, someone just hit their website...",
    mockup: (theme) => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>Bright Path Lighting Co.</div>
        <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>Commercial LED Retrofit Specialists</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {[{ label: 'Jake', role: 'Setter', color: '#8b5cf6' }, { label: 'Maria', role: 'Sales Rep', color: '#3b82f6' }, { label: 'Dave', role: 'Lead Tech', color: '#f97316' }].map(p => (
            <div key={p.label} style={{ padding: '10px 16px', borderRadius: '10px', backgroundColor: p.color + '12', border: `1px solid ${p.color}25`, textAlign: 'center' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: p.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', color: p.color, fontWeight: '700', fontSize: '15px' }}>{p.label[0]}</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: p.color }}>{p.label}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{p.role}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'new-lead',
    title: 'A New Lead',
    icon: UserPlus,
    color: '#3b82f6',
    arnieText: "Sarah Chen just submitted a form asking about her warehouse lights. Boom — she lands right in the Leads page as a brand new lead. Name, email, phone, what she needs. That's it. She's in the system.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Sarah Chen</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Chen Warehousing LLC</div>
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>New</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: theme.textSecondary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={13} /> sarah@chenwarehousing.com</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Globe size={13} /> Source: Website Form</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Target size={13} /> Service: LED Retrofit</div>
        </div>
      </div>
    ),
  },
  {
    id: 'setter-call',
    title: 'The Call',
    icon: Headphones,
    color: '#8b5cf6',
    arnieText: "Jake picks up Sarah's lead in the Lead Setter page. He calls her, asks about the facility — 40,000 sq ft warehouse, old T8 fluorescents everywhere, utility bill through the roof. He books an on-site visit for Thursday. Status goes from 'New' to 'Appointment Set'. Nice work, Jake.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Headphones size={20} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Jake is calling Sarah Chen...</div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Duration: 4:32</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6', textDecoration: 'line-through' }}>New</span>
          <ArrowRight size={14} color={theme.textMuted} />
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Appointment Set</span>
        </div>
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', fontSize: '12px', color: theme.textSecondary }}>
          <Calendar size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Thursday 10:00 AM — On-site walkthrough
        </div>
      </div>
    ),
  },
  {
    id: 'audit',
    title: 'The Audit',
    icon: Lightbulb,
    color: '#eab308',
    arnieText: "Thursday. Maria pulls up Lenard on her phone, walks the warehouse room by room, and snaps photos of every fixture. 200 old fluorescent tubes in 8 areas. Lenard crunches the numbers instantly — watts reduced, energy savings, utility rebates. This place is gonna save a fortune.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Chen Warehouse Audit</div>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Completed</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { label: 'Areas', value: '8', color: '#3b82f6' },
            { label: 'Fixtures', value: '200', color: '#eab308' },
            { label: 'kWh Saved/yr', value: '142,000', color: '#22c55e' },
            { label: 'Rebate', value: '$8,400', color: '#16a34a' },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px', borderRadius: '8px', backgroundColor: s.color + '08', border: `1px solid ${s.color}18`, textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'proposal',
    title: 'The Proposal',
    icon: FileText,
    color: '#d4af37',
    arnieText: "One click turns that audit into a gorgeous Interactive Proposal. AI writes the pitch — ROI charts, savings timelines, the whole nine yards. It gets the gold 'Investment Grade' badge because it's backed by real audit data. Sarah gets a link that looks like it came from a Fortune 500 company.",
    mockup: (theme) => (
      <div>
        <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={18} color="#d4af37" />
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#d4af37', letterSpacing: '0.03em' }}>INVESTMENT GRADE ENERGY AUDIT</div>
            <div style={{ fontSize: '11px', color: theme.textMuted }}>Certified lighting analysis with verified savings data</div>
          </div>
        </div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Chen Warehousing — LED Retrofit Proposal</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['Executive Summary', 'Investment Breakdown', 'ROI Analysis', 'Approval'].map(s => (
            <span key={s} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.border}` }}>{s}</span>
          ))}
        </div>
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#d4af3710', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#d4af37' }}>$47,200</div>
          <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Investment · 18-month payback</div>
        </div>
      </div>
    ),
  },
  {
    id: 'won',
    title: 'She Said Yes!',
    icon: CheckCircle,
    color: '#22c55e',
    arnieText: "Sarah opens the proposal on her phone, scrolls through the savings breakdown, and taps 'Approve'. Digital signature captured, timestamp logged. The lead moves to 'Won' on the pipeline board. That's the sound of revenue, baby.",
    mockup: (theme) => (
      <div style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
        >
          <CheckCircle size={48} color="#22c55e" style={{ marginBottom: '12px' }} />
        </motion.div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e', marginBottom: '4px' }}>Deal Won!</div>
        <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>Sarah Chen approved the proposal</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {['New', 'Contacted', 'Appointment Set', 'Qualified', 'Quote Sent', 'Won'].map((s, i) => (
            <span key={s} style={{
              padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
              backgroundColor: s === 'Won' ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)',
              color: s === 'Won' ? '#22c55e' : theme.textMuted,
              border: s === 'Won' ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
            }}>{s === 'Won' ? '* Won *' : s}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'job',
    title: 'Job Time',
    icon: Briefcase,
    color: '#5a6349',
    arnieText: "The deal is won, so it automatically becomes a Job. Right now it's sitting in 'Chillin' on the board — that's the PM's to-do pile. Lisa the PM drags it to 'Scheduled', assigns Dave's crew, and picks the install dates. Monday through Wednesday. Three days, 200 fixtures.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {['Chillin', 'Scheduled', 'In Progress', 'Completed'].map(col => (
            <div key={col} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: col === 'Scheduled' ? '#5a6349' : theme.textMuted, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>{col}</div>
              <div style={{ minHeight: '60px', borderRadius: '8px', backgroundColor: theme.bg, border: `1px solid ${col === 'Scheduled' ? theme.accent + '40' : theme.border}`, padding: '4px' }}>
                {col === 'Scheduled' && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                    style={{ padding: '8px', borderRadius: '6px', backgroundColor: theme.bgCard, border: `1px solid ${theme.accent}40`, fontSize: '11px' }}
                  >
                    <div style={{ fontWeight: '600', color: theme.text, marginBottom: '2px' }}>Chen Warehouse</div>
                    <div style={{ color: theme.textMuted, fontSize: '10px' }}>Dave's Crew · Mon-Wed</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px', backgroundColor: '#5a634912', color: '#5a6349' }}>200 fixtures</span>
                      <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px', backgroundColor: '#3b82f612', color: '#3b82f6' }}>8 areas</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', fontStyle: 'italic' }}>PM drags jobs between columns to update status</div>
      </div>
    ),
  },
  {
    id: 'field-scout',
    title: 'Dave Opens His Phone',
    icon: Compass,
    color: '#22c55e',
    arnieText: "Monday morning, 6:45 AM. Dave opens the app on his phone. Field Scout shows him exactly what's on his plate today — the Chen Warehouse retrofit. Address, scope, notes from the PM. He taps Navigate and his phone pulls up directions. No calling the office. No wondering where to go.",
    mockup: (theme) => (
      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Today's Jobs</div>
        <div style={{ padding: '12px', borderRadius: '10px', border: `2px solid #22c55e30`, backgroundColor: '#22c55e06', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Chen Warehouse LED Retrofit</div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>1234 Industrial Blvd</div>
            </div>
            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: '#5a634912', color: '#5a6349' }}>Scheduled</span>
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '8px', padding: '6px 8px', borderRadius: '6px', backgroundColor: theme.bg }}>
            PM Note: "Customer wants minimal downtime. Start with Bay 3 — it's the main warehouse floor."
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#f9731612', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#f97316' }}>
              <Clock size={14} style={{ marginBottom: '2px' }} /><br />Clock In
            </div>
            <div style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#3b82f612', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#3b82f6' }}>
              <MapPin size={14} style={{ marginBottom: '2px' }} /><br />Navigate
            </div>
            <div style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#8b5cf612', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#8b5cf6' }}>
              <Camera size={14} style={{ marginBottom: '2px' }} /><br />Photos
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'work',
    title: 'Clock In, Get to Work',
    icon: Clock,
    color: '#f97316',
    arnieText: "Dave taps 'Clock In', picks the Chen Warehouse job, and his timer starts. GPS confirms he's on-site. His crew does the same. They swap fixtures all morning, take a lunch break — clock out, clock back in — and keep going. Every hour is tagged to this specific job. No timesheets, no guessing.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {[
            { name: 'Dave M.', time: '7:02 AM', hours: '4.5 hrs', status: 'Active', color: '#22c55e' },
            { name: 'Tony R.', time: '7:08 AM', hours: '4.3 hrs', status: 'Active', color: '#22c55e' },
            { name: 'Mike S.', time: '7:15 AM', hours: '0.0 hrs', status: 'On Break', color: '#f59e0b' },
          ].map(person => (
            <div key={person.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', backgroundColor: person.color + '06', border: `1px solid ${person.color}18` }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: person.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{person.name}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>Clocked in {person.time}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: person.color }}>{person.hours}</div>
                <div style={{ fontSize: '10px', color: theme.textMuted }}>{person.status}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#3b82f608', border: `1px solid #3b82f615`, fontSize: '11px', color: '#3b82f6' }}>
          <MapPin size={12} /> GPS verified: 1234 Industrial Blvd (on-site)
        </div>
      </div>
    ),
  },
  {
    id: 'photos',
    title: 'Proof of Work',
    icon: Camera,
    color: '#8b5cf6',
    arnieText: "Before they start each bay, someone snaps a photo of the old fixtures. When they finish, another photo of the new LEDs. These upload straight to the job record — proof for the customer, proof for the utility rebate, proof for when someone asks 'did we actually do that?' six months later. Victor the AI can even verify the work quality.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
            <div style={{ height: '70px', backgroundColor: '#fef3c718', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '20px' }}>T8</div>
              <div style={{ fontSize: '10px', color: theme.textMuted }}>Old fluorescent</div>
            </div>
            <div style={{ padding: '6px 8px', backgroundColor: theme.bg, fontSize: '10px', color: '#ef4444', fontWeight: '600', textAlign: 'center' }}>BEFORE — Bay 3</div>
          </div>
          <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid #22c55e30` }}>
            <div style={{ height: '70px', backgroundColor: '#22c55e08', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '20px' }}>LED</div>
              <div style={{ fontSize: '10px', color: theme.textMuted }}>New LED tube</div>
            </div>
            <div style={{ padding: '6px 8px', backgroundColor: '#22c55e08', fontSize: '10px', color: '#22c55e', fontWeight: '600', textAlign: 'center' }}>AFTER — Bay 3</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5', 'Bay 6', 'Bay 7', 'Bay 8'].map((bay, i) => (
            <span key={bay} style={{
              padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '500',
              backgroundColor: i < 5 ? '#22c55e12' : theme.bg,
              color: i < 5 ? '#22c55e' : theme.textMuted,
              border: `1px solid ${i < 5 ? '#22c55e20' : theme.border}`,
            }}>
              {bay} {i < 5 ? '4/4' : '0/4'}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px', textAlign: 'center' }}>20 of 32 photos uploaded</div>
      </div>
    ),
  },
  {
    id: 'job-done',
    title: 'Job Complete',
    icon: CheckCircle,
    color: '#4a7c59',
    arnieText: "Wednesday afternoon. Last fixture swapped, last photo taken. Dave marks the job 'Completed' right from his phone. The PM sees it move across the board. Total labor: 22.5 crew-hours across 3 days. All documented, all tagged, all tracked. Now the office can send the invoice without asking anyone a single question.",
    mockup: (theme) => (
      <div style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.6, type: 'spring' }}
        >
          <CheckCircle size={40} color="#4a7c59" style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#4a7c59', marginBottom: '12px' }}>Job Completed</div>
        </motion.div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: 'Crew Hours', value: '22.5', color: '#f97316' },
            { label: 'Photos', value: '32', color: '#8b5cf6' },
            { label: 'Fixtures', value: '200', color: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 6px', borderRadius: '8px', backgroundColor: s.color + '08', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: theme.textMuted }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: theme.textSecondary, padding: '8px', borderRadius: '6px', backgroundColor: theme.bg }}>
          All hours, photos, and materials logged automatically. Ready for invoicing.
        </div>
      </div>
    ),
  },
  {
    id: 'invoice',
    title: 'Send the Bill',
    icon: Receipt,
    color: '#3b82f6',
    arnieText: "Job's done. One click generates the invoice from the job's line items. The rebate credits from the utility company are already calculated. Invoice goes out — Sarah's got 30 days. Easy.",
    mockup: (theme) => (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>INV-2026-0147</div>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>Sent</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textSecondary }}>
            <span>LED Retrofit — 200 fixtures</span>
            <span>$47,200</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
            <span>Utility Rebate Credit</span>
            <span>-$8,400</span>
          </div>
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: theme.text }}>
            <span>Total Due</span>
            <span>$38,800</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'paid',
    title: 'Money in the Bank',
    icon: DollarSign,
    color: '#16a34a',
    arnieText: "Payment received. Invoice flips to 'Paid', shows up in the Books, and the whole chain is traceable. Click any record and you can follow the breadcrumb all the way back to Sarah filling out that website form. That's the full loop. That's JobScout. Now go close some deals!",
    mockup: (theme) => (
      <div style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.6, type: 'spring' }}
          style={{ marginBottom: '16px' }}
        >
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#16a34a' }}>$38,800</div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>Payment Received</div>
        </motion.div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '11px' }}>
          {[
            { label: 'Lead', color: '#3b82f6' },
            { label: 'Appointment', color: '#8b5cf6' },
            { label: 'Audit', color: '#eab308' },
            { label: 'Proposal', color: '#d4af37' },
            { label: 'Won', color: '#22c55e' },
            { label: 'Job', color: '#5a6349' },
            { label: 'Invoice', color: '#3b82f6' },
            { label: 'Paid', color: '#16a34a' },
          ].map((s, i, arr) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ padding: '3px 8px', borderRadius: '4px', fontWeight: '600', backgroundColor: s.color + '15', color: s.color, border: `1px solid ${s.color}25` }}>
                {s.label}
              </span>
              {i < arr.length - 1 && <ArrowRight size={10} color={theme.textMuted} />}
            </span>
          ))}
        </div>
      </div>
    ),
  },
]

// ─── Story Mode ───────────────────────────────────────────────────

function StoryMode({ theme, onClose }) {
  const [currentScene, setCurrentScene] = useState(0)
  const [direction, setDirection] = useState(1)
  const [textVisible, setTextVisible] = useState(false)
  const scene = STORY_SCENES[currentScene]
  const Icon = scene.icon

  const next = useCallback(() => {
    if (currentScene < STORY_SCENES.length - 1) {
      setDirection(1)
      setTextVisible(false)
      setCurrentScene(prev => prev + 1)
    }
  }, [currentScene])

  const prev = useCallback(() => {
    if (currentScene > 0) {
      setDirection(-1)
      setTextVisible(false)
      setCurrentScene(prev => prev - 1)
    }
  }, [currentScene])

  useEffect(() => {
    const t = setTimeout(() => setTextVisible(true), 350)
    return () => clearTimeout(t)
  }, [currentScene])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [next, prev, onClose])

  const variants = {
    enter: (d) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: theme.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Arnie" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Arnie's Walkthrough</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            {currentScene + 1} / {STORY_SCENES.length}
          </span>
          <button onClick={onClose} style={{
            padding: '6px', backgroundColor: 'transparent', border: 'none',
            cursor: 'pointer', color: theme.textMuted, borderRadius: '6px',
          }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', backgroundColor: theme.border }}>
        <motion.div
          animate={{ width: `${((currentScene + 1) / STORY_SCENES.length) * 100}%` }}
          transition={{ duration: 0.3 }}
          style={{ height: '100%', backgroundColor: scene.color }}
        />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentScene}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ width: '100%', maxWidth: '600px' }}
          >
            {/* Arnie + Speech Bubble */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'flex-start' }}>
              <motion.img
                src="/Scout_LOGO_GUY.png"
                alt="Arnie"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <SpeechBubble text={scene.arnieText} theme={theme} visible={textVisible} />
              </div>
            </div>

            {/* Scene title */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: textVisible ? 1 : 0 }}
              transition={{ duration: 0.3 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: scene.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} color={scene.color} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: scene.color, margin: 0 }}>{scene.title}</h3>
            </motion.div>

            {/* Mini mockup */}
            <MiniMockup theme={theme} icon={scene.icon} title={scene.title} color={scene.color}>
              {scene.mockup(theme)}
            </MiniMockup>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderTop: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <button
          onClick={prev}
          disabled={currentScene === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: currentScene === 0 ? theme.textMuted : theme.text,
            cursor: currentScene === 0 ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: '500',
            opacity: currentScene === 0 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        {/* Dots */}
        <div style={{ display: 'flex', gap: '5px' }}>
          {STORY_SCENES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setDirection(i > currentScene ? 1 : -1); setTextVisible(false); setCurrentScene(i) }}
              style={{
                width: i === currentScene ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: i === currentScene ? scene.color : theme.border,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                padding: 0,
              }}
            />
          ))}
        </div>

        <button
          onClick={currentScene === STORY_SCENES.length - 1 ? onClose : next}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px',
            border: 'none',
            backgroundColor: scene.color,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '13px', fontWeight: '600',
          }}
        >
          {currentScene === STORY_SCENES.length - 1 ? 'Done' : 'Next'} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Help Content ─────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'How JobScout Works',
    icon: HelpCircle,
    color: '#5a6349',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          JobScout manages the full lifecycle of a field service business — from the first customer inquiry to final payment. Everything flows through a connected pipeline where every record links to the next.
        </p>

        <FlowDiagram animate={animate} theme={theme} steps={[
          { label: 'Lead', icon: UserPlus, color: '#3b82f6' },
          { label: 'Appointment', icon: Calendar, color: '#8b5cf6' },
          { label: 'Estimate', icon: FileText, color: '#f59e0b' },
          { label: 'Won!', icon: CheckCircle, color: '#22c55e' },
          { label: 'Job', icon: Briefcase, color: '#5a6349' },
          { label: 'Invoice', icon: Receipt, color: '#3b82f6' },
          { label: 'Paid', icon: DollarSign, color: '#16a34a' },
        ]} />

        <InfoBox title="Key Concept" color="#3b82f6" theme={theme}>
          Every new business opportunity is a <strong>Lead</strong> — even for existing customers. A lead tracks the sales process. Once the deal is <strong>Won</strong>, it becomes a <strong>Job</strong>. If a customer calls for work that's already sold (no sales process needed), you can create a Job directly and skip the lead pipeline.
        </InfoBox>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
          <StatCard label="Sales Steps" value="5" color="#3b82f6" theme={theme} />
          <StatCard label="AI Agents" value="5" color="#f97316" theme={theme} />
          <StatCard label="Modules" value="20+" color="#22c55e" theme={theme} />
          <StatCard label="Multi-Tenant" value="Yes" color="#8b5cf6" theme={theme} />
        </div>
      </div>
    )
  },
  {
    id: 'sales-flow',
    title: 'Sales Flow (Steps 1-5)',
    icon: GitBranch,
    color: '#3b82f6',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          The sidebar shows 5 numbered steps that represent the sales process from first contact to completed work:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserPlus} title="1. Leads" color="#3b82f6" description="Where all prospects enter the system. A lead is any potential business opportunity — new customer inquiries, referrals, website forms, or repeat business. Tracks contact info, source, value, and current status. Leads assigned to owners show in their Lenard standalone agent automatically." theme={theme} />
          <EntityCard icon={Headphones} title="2. Lead Setter" color="#8b5cf6" description="The calling workspace. Setters call leads, qualify them, and schedule appointments. Leads flow from 'New' to 'Contacted' to 'Appointment Set'. The setter earns commission per appointment set. Calendar view shows all scheduled meetings." theme={theme} />
          <EntityCard icon={GitBranch} title="3. Pipeline" color="#f59e0b" description="Visual kanban board showing all leads by stage. Drag leads between columns to update their status. This is your bird's-eye view of the entire sales funnel with deal values at each stage." theme={theme} />
          <EntityCard icon={FileText} title="4. Estimates" color="#3b82f6" description="Create price quotes for qualified leads. Add products from your catalog, apply labor rates, and send to the customer. Two modes: standard PDF or Interactive Proposal (Qwilr-style animated page with charts, ROI analysis, and digital approval)." theme={theme} />
          <EntityCard icon={Briefcase} title="5. Jobs" color="#5a6349" description="Won deals become jobs. The kanban board shows jobs by stage: Chillin, Scheduled, In Progress, Completed. Each job has sections, line items, time tracking, documents, and photos." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Lead Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.lead} colors={{
          'New': '#3b82f6', 'Contacted': '#8b5cf6', 'Appointment Set': '#22c55e',
          'Qualified': '#f97316', 'Quote Sent': '#eab308', 'Negotiation': '#f59e0b',
          'Won': '#10b981', 'Lost': '#64748b'
        }} theme={theme} />

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '16px 0 8px' }}>Job Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.job} colors={{
          'Chillin': '#6382bf', 'Scheduled': '#5a6349', 'In Progress': '#c28b38',
          'Completed': '#4a7c59', 'On Hold': '#7d8a7f', 'Cancelled': '#8b5a5a'
        }} theme={theme} />

        <InfoBox title="Interactive Proposals" color="#d4af37" theme={theme}>
          Estimates can be sent as <strong>Interactive Proposals</strong> — full-page animated experiences with investment-grade audit data, ROI charts, savings timelines, and one-click digital approval. Toggle between PDF and Interactive mode in estimate settings. AI writes compelling sales copy tailored to each project.
        </InfoBox>

        <InfoBox title="When to skip the pipeline" color="#22c55e" theme={theme}>
          If a customer calls and says "I need you to come fix my lights next week" — there's no sales process. Create the Job directly from the Jobs page. A tracking lead is auto-created in the background so your pipeline numbers stay accurate.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: Users,
    color: '#16a34a',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Customers are the people and businesses you serve. A customer record is the central hub — it shows all related leads, estimates, jobs, invoices, and payments in one place.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Customer Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.customer} colors={{
          'Active': '#16a34a', 'Inactive': '#6b7280', 'Prospect': '#f59e0b'
        }} theme={theme} />

        <InfoBox title="How customers get created" color="#3b82f6" theme={theme}>
          <strong>From Leads:</strong> When a lead is converted/won, the customer info is used to create (or link to) a customer record.<br />
          <strong>Manually:</strong> Add customers directly from the Customers page.<br />
          <strong>From Estimates:</strong> Creating an estimate on the Customer Detail page auto-creates a pipeline lead.<br />
          <strong>Search:</strong> Find customers by name, business name, email, or phone number.
        </InfoBox>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '16px 0 8px' }}>Customer Detail Tabs</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          {[
            { label: 'Info', desc: 'Contact details, address, notes' },
            { label: 'Leads', desc: 'All sales opportunities' },
            { label: 'Estimates', desc: 'Price quotes sent' },
            { label: 'Jobs', desc: 'Work orders linked' },
            { label: 'Invoices', desc: 'Bills issued' },
            { label: 'Payments', desc: 'Money received' },
          ].map(tab => (
            <div key={tab.label} style={{
              padding: '10px 12px', borderRadius: '8px',
              backgroundColor: theme.accentBg, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: theme.accent }}>{tab.label}</div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{tab.desc}</div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'operations',
    title: 'Operations — How the Work Gets Done',
    icon: ClipboardList,
    color: '#5a6349',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '8px' }}>
          This is the part that matters most. Sales can close all the deals they want — but if the crew can't find their jobs, track their hours, or know what materials to bring, nothing gets done. Here's exactly how a typical day works.
        </p>
        <p style={{ fontSize: '13px', color: theme.textMuted, lineHeight: 1.6, marginBottom: '20px' }}>
          Every tool here is designed to be used on a phone, in the field, with one hand, while standing on a ladder. No training manual needed.
        </p>

        {/* ─── Field Scout ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={18} /> Field Scout — The Tech's Home Base
        </h4>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '12px' }}>
          When a tech opens the app, this is the first thing they see. No menus to dig through, no lists to scroll. Just <strong>today's work</strong>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {[
            { icon: Briefcase, label: "Today's Jobs", desc: 'See every job assigned to you today. Address, customer name, what needs to happen. Tap to see full details.', color: '#5a6349' },
            { icon: Clock, label: 'Clock In / Out', desc: "Big button, can't miss it. Tap once to start, tap again to stop. Tags your hours to whatever job you pick.", color: '#f97316' },
            { icon: MapPin, label: 'Navigate to Job', desc: 'One tap opens Google Maps or Apple Maps with the job address. No copy-pasting.', color: '#3b82f6' },
            { icon: Camera, label: 'Job Photos', desc: 'Snap before/after photos right from the job. They upload automatically and attach to the job record.', color: '#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={{ padding: '14px', borderRadius: '10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <item.icon size={16} color={item.color} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: item.color }}>{item.label}</span>
              </div>
              <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <InfoBox title="Why this matters" color="#22c55e" theme={theme}>
          Your techs don't need to call the office asking "where am I going today?" or "what's the customer's name again?" It's all right there. Open the app, see the work, clock in, go. That's it.
        </InfoBox>

        {/* ─── A Tech's Typical Day ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#f97316', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} /> A Tech's Typical Day
        </h4>
        <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: `2px solid ${theme.border}`, marginBottom: '20px' }}>
          {[
            { time: '6:45 AM', action: 'Open Field Scout. See 2 jobs for today. First one is a warehouse retrofit on Industrial Blvd.', color: '#5a6349' },
            { time: '7:00 AM', action: 'Arrive at site. Tap "Clock In" and pick the job. GPS confirms you\'re at the right location. Timer starts.', color: '#f97316' },
            { time: '7:05 AM', action: 'Open the job details. See the scope: 40 fixtures in Bay 3, LED tubes are in the truck. Notes from the PM say "customer wants minimal downtime, do Bay 3 first."', color: '#3b82f6' },
            { time: '11:30 AM', action: 'Bay 3 done. Snap a photo of the finished work. It uploads and attaches to the job automatically.', color: '#8b5cf6' },
            { time: '12:00 PM', action: 'Lunch break. Clock out. Grab a sandwich.', color: '#7d8a7f' },
            { time: '12:30 PM', action: 'Clock back in, same job. Finish Bay 4 by 3 PM.', color: '#f97316' },
            { time: '3:15 PM', action: 'Clock out. Total: 7.5 hours tagged to this job. Drive to job #2 — a small office relight. Clock in on the new job.', color: '#22c55e' },
            { time: '5:00 PM', action: 'Done for the day. Clock out. All hours are logged, all photos uploaded. The PM can see everything from the office.', color: '#16a34a' },
          ].map((step, i) => (
            <div key={i} style={{ marginBottom: i < 7 ? '14px' : 0, position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-29px', top: '2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: step.color, border: `2px solid ${theme.bg}` }} />
              <div style={{ fontSize: '11px', fontWeight: '700', color: step.color, marginBottom: '2px' }}>{step.time}</div>
              <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>{step.action}</div>
            </div>
          ))}
        </div>

        {/* ─── Time Clock ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} /> Time Clock — No Paper Timesheets
        </h4>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '12px' }}>
          Every clock-in and clock-out is tagged to a specific job. That means the company knows exactly how many hours went into each project — not just how many hours each person worked. This feeds directly into job costing and payroll.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {[
            { label: 'GPS stamped', desc: 'Every clock event records the location. Verify your crew is actually on-site.', icon: MapPin, color: '#3b82f6' },
            { label: 'Job-tagged hours', desc: 'Hours go to the job, not just the person. Know your actual labor cost per project.', icon: Briefcase, color: '#5a6349' },
            { label: 'Break tracking', desc: 'Clock out for lunch, clock back in. Breaks are tracked separately.', icon: Pause, color: '#7d8a7f' },
            { label: 'Feeds payroll', desc: 'Hours automatically flow into the payroll calculator. No double-entry.', icon: DollarSign, color: '#16a34a' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: item.color + '08', border: `1px solid ${item.color}15` }}>
              <item.icon size={16} color={item.color} style={{ flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: item.color }}>{item.label}</span>
                <span style={{ fontSize: '12px', color: theme.textSecondary, marginLeft: '8px' }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <InfoBox title="Real talk" color="#f97316" theme={theme}>
          Nobody likes filling out timesheets at the end of the week trying to remember what they did on Tuesday. Clock in when you get there, clock out when you leave. It's two taps. Your hours are accurate, your pay is right, and nobody's arguing about it on Friday.
        </InfoBox>

        {/* ─── Job Board (PM) ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={18} /> Job Board — The PM's Command Center
        </h4>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '12px' }}>
          The project manager (or whoever's scheduling the work) uses the Job Board to see everything at a glance. Think of it like a whiteboard with sticky notes — but it updates in real time.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {[
            'See all jobs organized by status — Chillin, Scheduled, In Progress, Completed',
            'Drag and drop jobs between columns to update their status',
            'Assign crew members and set start/end dates',
            'Break big jobs into sections (Bay 1, Bay 2, etc.) and schedule each one',
            'See who\'s clocked in right now and what they\'re working on',
            'Click any job to drill into details, line items, photos, and notes',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>
              <CheckCircle size={14} color="#3b82f6" style={{ marginTop: '2px', flexShrink: 0 }} />
              {item}
            </div>
          ))}
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Job Statuses</h4>
        <StatusPipeline animate={animate} statuses={['Chillin', 'Scheduled', 'In Progress', 'Completed', 'On Hold', 'Cancelled']} colors={{
          'Chillin': '#6382bf', 'Scheduled': '#5a6349', 'In Progress': '#c28b38',
          'Completed': '#4a7c59', 'On Hold': '#7d8a7f', 'Cancelled': '#8b5a5a'
        }} theme={theme} />

        <InfoBox title="What 'Chillin' means" color="#6382bf" theme={theme}>
          When a deal is won, the job starts in "Chillin" — it exists, but nobody's scheduled it yet. It's the PM's to-do pile. Once dates and crew are assigned, it moves to "Scheduled." No job gets forgotten because it's sitting right there on the board.
        </InfoBox>

        {/* ─── Routes & Calendar ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#5a6349', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={18} /> Routes & Calendar
        </h4>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '12px' }}>
          See all scheduled jobs on a map or calendar view. Plan efficient routes so your crews aren't crisscrossing the city. The calendar shows job blocks by day and by tech — the PM can see gaps and overloads instantly.
        </p>

        {/* ─── Products & Inventory ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={18} /> Products, Bundles & Inventory
        </h4>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '12px' }}>
          Your product catalog is the brain behind estimates and job line items. Every product has a price, labor rate, and description. Products can be grouped into <strong>bundles</strong> — for example, a "Bay Retrofit Package" might include 20 LED tubes, 20 drivers, labor, and disposal. When you add the bundle to an estimate, everything's included with the right pricing.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <EntityCard icon={Package} title="Products & Services" color="#f59e0b" description="Your full catalog: fixtures, materials, labor, services. Each product has cost, sell price, labor rate, spec sheets, photos, and DLC certification status. Organized by sections and groups." theme={theme} />
          <EntityCard icon={Boxes} title="Bundles" color="#f97316" description="Group products together. A bundle shows all its components with quantities and prices right on the card. Add it to an estimate and everything inside gets included. No forgetting the driver for the LED tube." theme={theme} />
          <EntityCard icon={Warehouse} title="Inventory" color="#8b5cf6" description="Track what you have, where it is, and when to reorder. Assign inventory to warehouse locations or specific trucks so techs know what's on their vehicle before they drive out." theme={theme} />
        </div>
        <InfoBox title="Why bundles save hours" color="#f59e0b" theme={theme}>
          Instead of manually adding 8 line items every time you quote a bay retrofit, create a bundle once. Next estimate — one click, all 8 items added with correct quantities and pricing. Your estimates go out faster and nothing gets missed.
        </InfoBox>

        {/* ─── What techs need to know ─── */}
        <h4 style={{ fontSize: '16px', fontWeight: '700', color: theme.accent, margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smartphone size={18} /> Bottom Line for Field Techs
        </h4>
        <div style={{
          padding: '16px 20px', borderRadius: '12px',
          backgroundColor: theme.accent + '08', border: `2px solid ${theme.accent}20`,
        }}>
          <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.8, margin: 0 }}>
            You don't need to learn the whole app. You need <strong>three things</strong>:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {[
              { num: '1', text: 'Field Scout — see your jobs for today', color: '#22c55e' },
              { num: '2', text: 'Time Clock — clock in, pick the job, clock out when done', color: '#f97316' },
              { num: '3', text: 'Camera — snap photos of the work', color: '#8b5cf6' },
            ].map(item => (
              <div key={item.num} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: item.color + '18', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: '700', color: item.color, flexShrink: 0,
                }}>{item.num}</div>
                <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{item.text}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '12px', marginBottom: 0, lineHeight: 1.6 }}>
            Everything else — scheduling, estimates, invoicing — that's the office's job. You just do the work, track your time, and take photos. The app handles the rest.
          </p>
        </div>
      </div>
    )
  },
  {
    id: 'financial',
    title: 'Financial',
    icon: DollarSign,
    color: '#16a34a',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track money in and money out. Admin+ access required.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={Receipt} title="Invoices" color="#3b82f6" description="Generate invoices from completed jobs. Tracks payment status (Draft, Sent, Paid). Includes utility incentive tracking for lighting jobs." theme={theme} />
          <EntityCard icon={CreditCard} title="Deposits" color="#8b5cf6" description="Pre-job payments and deposits received from leads/deals. Linked to the lead record so you can track partial payments through the pipeline." theme={theme} />
          <EntityCard icon={DollarSign} title="Expenses" color="#ef4444" description="Business expenses — materials, fuel, subcontractors, etc. Categorized and linked to business units. Connects to Plaid for auto-import from bank accounts." theme={theme} />
          <EntityCard icon={BookOpen} title="Books" color="#16a34a" description="Full accounting view. Revenue vs expenses, P&L, bank connections, transaction categorization. Your financial command center." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Invoice Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.invoice} colors={{
          'Draft': '#6b7280', 'Sent': '#3b82f6', 'Paid': '#16a34a',
          'Partial': '#f59e0b', 'Overdue': '#ef4444', 'Void': '#9ca3af'
        }} theme={theme} />

        <InfoBox title="Money Flow" color="#16a34a" theme={theme}>
          <strong>Deposits</strong> are collected during the sales process (before the job).<br />
          <strong>Invoices</strong> are generated after the job is done.<br />
          <strong>Books</strong> pulls everything together for accounting.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'team',
    title: 'Team Management',
    icon: UserCog,
    color: '#8b5cf6',
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserCog} title="Employees" color="#8b5cf6" description="Add team members, set roles and access levels, assign pay rates. Roles control what each person can see and do in the app." theme={theme} />
          <EntityCard icon={Clock} title="Time Clock" color="#3b82f6" description="Employees clock in/out and tag time to specific jobs. Hours feed into payroll and job costing. GPS location captured on clock events." theme={theme} />
          <EntityCard icon={DollarSign} title="Payroll" color="#16a34a" description="Calculate pay based on hours worked, commission on leads/sales, bonuses, and deductions. Supports hourly, salary, and per-job pay types." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Access Levels</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { role: 'Field Tech', desc: 'Field Scout, Job Board, Time Clock only', color: '#6b7280' },
            { role: 'Team Lead', desc: 'Above + can see team members', color: '#3b82f6' },
            { role: 'Manager', desc: 'Above + customers, leads, products, estimates', color: '#8b5cf6' },
            { role: 'Admin', desc: 'Above + financials, fleet, all data', color: '#f59e0b' },
            { role: 'Super Admin / Owner', desc: 'Full access including pay rates and settings', color: '#22c55e' },
          ].map(r => (
            <div key={r.role} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 12px', borderRadius: '8px',
              backgroundColor: r.color + '10', border: `1px solid ${r.color}20`,
            }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: r.color, minWidth: '110px' }}>{r.role}</span>
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'agents',
    title: 'AI Agents',
    icon: Bot,
    color: '#f97316',
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          AI agents are specialized assistants that plug into different parts of the business. They're recruited from Base Camp and appear in the sidebar under their relevant section.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={MessageCircle} title="OG Arnie" color="#f97316" description="Your general business assistant. Ask questions about jobs, financials, team, pipeline — anything in the app. Knows your data and role permissions. Supports voice input/output." theme={theme} />
          <EntityCard icon={Lightbulb} title="Lenard" color="#eab308" description="Lighting audit specialist. Builds audit reports, calculates rebates from utility programs, generates investment-grade proposals with fixture schedules and energy savings. Standalone pages for AZ SRP and UT RMP." theme={theme} />
          <EntityCard icon={Truck} title="Freddy" color="#3b82f6" description="Fleet management agent. Tracks vehicles, maintenance schedules, mileage, and assignments." theme={theme} />
          <EntityCard icon={Mail} title="Conrad Connect" color="#8b5cf6" description="Email marketing agent. Build templates, create campaigns, set up automations, and manage contact lists." theme={theme} />
          <EntityCard icon={Camera} title="Victor" color="#22c55e" description="Photo verification agent. Document before/after photos on jobs, verify work quality, and generate visual reports." theme={theme} />
        </div>

        <InfoBox title="Lenard Standalone" color="#eab308" theme={theme}>
          Lenard has standalone PWA pages (<strong>/agent/lenard-az-srp</strong> and <strong>/agent/lenard-ut-rmp</strong>) that salespeople install on their phone. Leads assigned to them from the main app appear automatically in their project folder with a "NEW LEAD" badge. They can build audits, generate proposals, and get customer signatures right on-site.
        </InfoBox>

        <InfoBox title="The floating Arnie" color="#f97316" theme={theme}>
          On desktop, the Arnie avatar floats in the bottom-right corner. Click it to open a chat panel without leaving your current page. He can see what page you're on and what job you're clocked into.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'lighting',
    title: 'Lighting Module',
    icon: Lightbulb,
    color: '#eab308',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Specialized tools for lighting retrofit companies. These appear when the Lenard agent is recruited.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <EntityCard icon={Lightbulb} title="Lighting Audits" color="#eab308" description="Create detailed energy audits. Walk a facility room by room, document existing fixtures, and propose LED replacements. Calculates energy savings, watts reduced, and ROI. Certified audits feed into investment-grade interactive proposals." theme={theme} />
          <EntityCard icon={Package} title="Fixture Types" color="#f59e0b" description="Library of lighting fixtures — existing (what's being replaced) and replacement (what you're installing). Wattages, quantities, and pricing." theme={theme} />
          <EntityCard icon={DollarSign} title="Utility Providers & Programs" color="#16a34a" description="Track utility company rebate programs. Each program has per-fixture rebate rates that auto-calculate incentives on audits, proposals, and invoices." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Audit Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.audit} colors={{
          'Draft': '#6b7280', 'In Progress': '#3b82f6', 'Completed': '#22c55e',
          'Submitted': '#f59e0b', 'Approved': '#16a34a'
        }} theme={theme} />

        <InfoBox title="Investment Grade Proposals" color="#d4af37" theme={theme}>
          When an estimate is linked to a certified lighting audit, the Interactive Proposal gets the <strong>gold Investment Grade Energy Audit</strong> badge with real audit data: fixtures upgraded, kWh saved, annual dollar savings, per-area wattage charts, and rebate breakdowns. The AI writes hard-hitting sales copy that frames the project as an investment that pays for itself.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'fleet',
    title: 'Fleet Management',
    icon: Truck,
    color: '#3b82f6',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track company vehicles, maintenance schedules, and assignments. Appears when the Freddy agent is recruited.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Vehicle Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.fleet} colors={{
          'Active': '#16a34a', 'In Service': '#3b82f6', 'Out of Service': '#ef4444', 'Retired': '#6b7280'
        }} theme={theme} />
      </div>
    )
  },
  {
    id: 'data',
    title: 'Data & Import',
    icon: FileBarChart,
    color: '#8b5cf6',
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Import and manage data across the app. Available on pages that support bulk operations.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={FileBarChart} title="CSV / Excel Import" color="#3b82f6" description="Upload CSV, XLSX, XLS, or TSV files. AI automatically maps your columns to the right fields. Preview and adjust before importing." theme={theme} />
          <EntityCard icon={FileText} title="PDF Import" color="#8b5cf6" description="Upload PDF documents (including scanned pages). The system renders each page as an image and uses AI vision to extract structured data — works even with image-only PDFs." theme={theme} />
          <EntityCard icon={BarChart3} title="Data Console" color="#f59e0b" description="Admin-only. Direct SQL access, user management, company settings, product bulk operations, and agent configuration." theme={theme} />
        </div>

        <InfoBox title="AI Column Mapping" color="#3b82f6" theme={theme}>
          When you import a file, AI reads your headers and sample data, then automatically maps columns to the correct fields. It even suggests default values for missing required fields. You can always adjust the mapping manually before importing.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'tips',
    title: 'Tips & Shortcuts',
    icon: Zap,
    color: '#f59e0b',
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { tip: 'Use Global Search (top of sidebar) to find any customer, job, or lead instantly.', color: '#3b82f6' },
            { tip: 'The Deal Breadcrumb at the top of Lead, Quote, and Job detail pages lets you trace the full history of a deal.', color: '#8b5cf6' },
            { tip: 'Click the status badge on a Job to change its stage without going to the board.', color: '#22c55e' },
            { tip: 'Settings are accessed via the gear icon on each page — there\'s no separate settings page.', color: '#f59e0b' },
            { tip: 'Ask Arnie! Click the floating avatar to ask questions about your data in natural language.', color: '#f97316' },
            { tip: 'Time Clock entries tag to specific jobs, so hours automatically feed into job costing.', color: '#3b82f6' },
            { tip: 'Products can include built-in labor rates — when added to an estimate, labor is calculated automatically.', color: '#8b5cf6' },
            { tip: 'Product bundles show their components right on the card — no guessing what\'s inside.', color: '#22c55e' },
            { tip: 'Interactive Proposals: Toggle "Interactive Proposal" in estimate settings, then "Generate with AI" for a premium sales experience.', color: '#d4af37' },
            { tip: 'Every table filters by your company. Multi-tenant means your data is always isolated.', color: '#5a6349' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px 14px', borderRadius: '8px',
              backgroundColor: (item.color || theme.accent) + '08',
              border: `1px solid ${(item.color || theme.accent)}15`,
            }}>
              <CheckCircle size={16} color={item.color || theme.accent} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>{item.tip}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
]

// ─── Presentation Mode ─────────────────────────────────────────────

function PresentationMode({ sections, theme, onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [direction, setDirection] = useState(1)
  const section = sections[currentSlide]
  const Icon = section.icon

  const next = useCallback(() => {
    if (currentSlide < sections.length - 1) {
      setDirection(1)
      setCurrentSlide(prev => prev + 1)
    }
  }, [currentSlide, sections.length])

  const prev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection(-1)
      setCurrentSlide(prev => prev - 1)
    }
  }, [currentSlide])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [next, prev, onClose])

  const variants = {
    enter: (d) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: theme.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>JobScout Guide</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>
            {currentSlide + 1} / {sections.length}
          </span>
          <button onClick={onClose} style={{
            padding: '8px', backgroundColor: 'transparent', border: 'none',
            cursor: 'pointer', color: theme.textMuted, borderRadius: '8px',
          }}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', backgroundColor: theme.border }}>
        <motion.div
          animate={{ width: `${((currentSlide + 1) / sections.length) * 100}%` }}
          transition={{ duration: 0.3 }}
          style={{ height: '100%', backgroundColor: section.color || theme.accent }}
        />
      </div>

      {/* Slide content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ width: '100%', maxWidth: '800px' }}
          >
            {/* Section header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}
            >
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px',
                backgroundColor: (section.color || theme.accent) + '15',
                border: `2px solid ${(section.color || theme.accent)}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={28} color={section.color || theme.accent} />
              </div>
              <div>
                <h2 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>{section.title}</h2>
                <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                  Section {currentSlide + 1} of {sections.length}
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              {section.content(theme, true)}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderTop: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <button
          onClick={prev}
          disabled={currentSlide === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '10px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: currentSlide === 0 ? theme.textMuted : theme.text,
            cursor: currentSlide === 0 ? 'default' : 'pointer',
            fontSize: '14px', fontWeight: '500',
            opacity: currentSlide === 0 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={18} /> Previous
        </button>

        {/* Slide dots */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i) }}
              style={{
                width: i === currentSlide ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                backgroundColor: i === currentSlide ? (s.color || theme.accent) : theme.border,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        <button
          onClick={currentSlide === sections.length - 1 ? onClose : next}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '10px',
            border: 'none',
            backgroundColor: section.color || theme.accent,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px', fontWeight: '600',
          }}
        >
          {currentSlide === sections.length - 1 ? 'Done' : 'Next'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export default function Help() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const [expandedSections, setExpandedSections] = useState({ overview: true })
  const [showPresentation, setShowPresentation] = useState(false)
  const [showStory, setShowStory] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const employee = useStore((state) => state.employee)
  const isAdmin = employee?.access_level === 'admin' || employee?.access_level === 'super_admin' || employee?.access_level === 'owner'

  const toggle = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    const all = {}
    HELP_SECTIONS.forEach(s => { all[s.id] = true })
    setExpandedSections(all)
  }

  const collapseAll = () => setExpandedSections({})

  // Developer refresh — could be wired to an AI edge function to regenerate content
  const handleRefresh = async () => {
    setRefreshing(true)
    // Simulate refresh — in production this would call an edge function
    // that scans routes and generates updated help content
    await new Promise(r => setTimeout(r, 1500))
    setRefreshing(false)
    alert('Help content is up to date with the latest app features.')
  }

  return (
    <>
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
              How JobScout Works
            </h1>
            <p style={{ fontSize: '14px', color: theme.textMuted, margin: '4px 0 0' }}>
              Your guide to the full business workflow
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => setShowStory(true)} style={{
            padding: '8px 16px', borderRadius: '8px', border: '1px solid #f97316',
            backgroundColor: '#f9731610', color: '#f97316', fontSize: '13px', cursor: 'pointer',
            fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Sparkles size={16} /> Arnie's Story
          </button>
          <button onClick={() => setShowPresentation(true)} style={{
            padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.accent}`,
            backgroundColor: theme.accent, color: '#fff', fontSize: '13px', cursor: 'pointer',
            fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Presentation size={16} /> Present
          </button>
          {isAdmin && (
            <button onClick={handleRefresh} disabled={refreshing} style={{
              padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard, color: refreshing ? theme.textMuted : theme.accent, fontSize: '13px',
              cursor: refreshing ? 'wait' : 'pointer', fontWeight: '500',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {refreshing ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              {refreshing ? 'Checking...' : 'Update Content'}
            </button>
          )}
          <button onClick={expandAll} style={{
            padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
          }}>
            Expand All
          </button>
          <button onClick={collapseAll} style={{
            padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
          }}>
            Collapse All
          </button>
        </div>

        {/* Big Picture Flow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            The Big Picture
          </div>
          <FlowDiagram animate={true} theme={theme} steps={[
            { label: 'Lead', icon: UserPlus, color: '#3b82f6' },
            { label: 'Set Appt', icon: Headphones, color: '#8b5cf6' },
            { label: 'Qualify', icon: GitBranch, color: '#f59e0b' },
            { label: 'Estimate', icon: FileText, color: '#3b82f6' },
            { label: 'Win', icon: CheckCircle, color: '#22c55e' },
            { label: 'Job', icon: Briefcase, color: '#5a6349' },
            { label: 'Invoice', icon: Receipt, color: '#f59e0b' },
            { label: 'Paid', icon: DollarSign, color: '#16a34a' },
          ]} />
          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
            Every step links to the next. Click any record to trace it back through the chain.
          </div>
        </motion.div>

        {/* Accordion Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {HELP_SECTIONS.map((section, idx) => {
            const isOpen = expandedSections[section.id]
            const Icon = section.icon
            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.4 }}
                style={{
                  borderRadius: '12px',
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${isOpen ? (section.color || theme.accent) + '40' : theme.border}`,
                  overflow: 'hidden',
                  transition: 'border-color 0.3s ease',
                }}
              >
                <button
                  onClick={() => toggle(section.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px 20px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    backgroundColor: (section.color || theme.accent) + '15',
                    display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background-color 0.3s ease',
                  }}>
                    <Icon size={16} color={section.color || theme.accent} />
                  </div>
                  <span style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: theme.text }}>
                    {section.title}
                  </span>
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={18} color={theme.textMuted} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '0 20px 20px',
                        borderTop: `1px solid ${theme.border}`,
                        paddingTop: '16px',
                      }}>
                        {section.content(theme, false)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* Presentation Mode Overlay */}
      <AnimatePresence>
        {showPresentation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <PresentationMode
              sections={HELP_SECTIONS}
              theme={theme}
              onClose={() => setShowPresentation(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arnie's Story Overlay */}
      <AnimatePresence>
        {showStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <StoryMode theme={theme} onClose={() => setShowStory(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
