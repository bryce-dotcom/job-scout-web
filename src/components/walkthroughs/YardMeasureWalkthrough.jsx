// Yard Measure walkthrough — realistic UI version (mirrors the actual
// /quote/:slug public landing page at near-pixel fidelity).
//
// This walkthrough is now built on the shared useWalkthroughRunner +
// WalkthroughChrome infrastructure. It serves as the worked example
// for the knowledge-card-driven pattern: read the card, render a
// scene-driven Stage component, the runner + chrome handle the rest.

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, MapPin, Loader, Check, Calculator, Mail, Globe, DollarSign,
  Share2,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/yard-measure.js'

// Public quote page uses the JobScout earthy-green theme.
const T = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgInput: '#f7f5ef',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentLight: '#7a8567',
  success: '#22c55e',
  successDark: '#15803d',
  successBg: 'rgba(34,197,94,0.10)',
}

const TYPED_ADDRESS = '1457 N 110 W, Orem UT 84057'
const COMPANY_NAME = 'HHH Services'

// ─── Main ───────────────────────────────────────────────────────────────
export default function YardMeasureWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  const captionText = computeCaption(phase, sceneKey, setupIdx, setupShowingIntro, card)

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingBottom: '56.25%', // 16:9
      background: `linear-gradient(135deg, ${T.bg} 0%, #ece6d4 100%)`,
      overflow: 'hidden',
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
            <DonePanel
              key="done"
              onReplay={replay}
              subtitle="Share your quote URL and watch leads roll in."
            />
          )}
        </AnimatePresence>
      </div>

      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={captionText} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage — switches between QuotePage and Delivered split-view ────────
function Stage({ scene, sceneElapsed }) {
  // Address scene: form with typewriter
  // Zoom: form + satellite preview appearing
  // Trace: satellite is large; polygon animates
  // Quote: result card replaces form
  // Delivered: email + Lead Setter split view

  if (scene === 'delivered') {
    return <DeliveredScene />
  }

  return <QuotePageMock scene={scene} sceneElapsed={sceneElapsed} />
}

// ─── Main quote page mock (mirrors ZachInstantQuote.jsx) ────────────────
function QuotePageMock({ scene, sceneElapsed }) {
  // Typewriter
  const typedLen = scene === 'address'
    ? Math.min(TYPED_ADDRESS.length, Math.floor(sceneElapsed / 60))
    : TYPED_ADDRESS.length
  const typed = TYPED_ADDRESS.slice(0, typedLen)
  const typingDone = typedLen >= TYPED_ADDRESS.length

  const showSatellite = scene === 'zoom' || scene === 'trace'
  const showResult = scene === 'quote'
  const isSearching = scene === 'zoom' && sceneElapsed < 1500

  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, overflow: 'hidden' }}>
      <div style={{
        maxWidth: 600, margin: '0 auto',
        height: '100%',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 8,
            background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles size={20} style={{ color: '#fff' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>
              {showResult ? COMPANY_NAME : 'Get an instant lawn-care quote'}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              Powered by Zach the Yard Yeti — satellite-AI estimate in seconds.
            </div>
          </div>
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          {showResult ? (
            <ResultCard key="result" />
          ) : (
            <FormCard
              key="form"
              typed={typed}
              typingDone={typingDone}
              showSatellite={showSatellite}
              isSearching={isSearching}
              isTracing={scene === 'trace'}
              traceElapsed={scene === 'trace' ? sceneElapsed : 0}
              addressActive={scene === 'address'}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Form card (address input + satellite + button) ─────────────────────
function FormCard({ typed, typingDone, showSatellite, isSearching, isTracing, traceElapsed, addressActive }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35 }}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: 18,
        boxShadow: '0 1px 3px rgba(44,53,48,0.06)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Address field */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 5 }}>
        Property address
      </label>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <MapPin size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
        <div style={{
          width: '100%',
          padding: '10px 12px 10px 32px',
          border: `1.5px solid ${addressActive ? T.accent : T.border}`,
          borderRadius: 9,
          background: T.bgInput,
          fontSize: 13,
          color: T.text,
          boxSizing: 'border-box',
          minHeight: 16,
          fontFamily: 'inherit',
        }}>
          {typed.length === 0 && addressActive ? (
            <span style={{ color: T.textMuted, fontStyle: 'italic' }}>Start typing your address…</span>
          ) : (
            <>
              {typed}
              {addressActive && !typingDone && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  style={{ display: 'inline-block', width: 1.5, height: 12, backgroundColor: T.accent, marginLeft: 2, transform: 'translateY(2px)' }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Satellite preview */}
      <AnimatePresence>
        {showSatellite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              marginBottom: 12,
              borderRadius: 9,
              overflow: 'hidden',
              border: `1px solid ${T.border}`,
              position: 'relative',
            }}
          >
            <SatelliteTile traced={isTracing} traceElapsed={traceElapsed} />
            {isTracing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                style={{
                  position: 'absolute', bottom: 8, left: 8,
                  padding: '5px 9px',
                  background: 'rgba(34,197,94,0.95)',
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <Sparkles size={12} />
                <CounterText to={2850} elapsed={traceElapsed} /> sq ft measured
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <motion.button
        animate={typingDone && !isSearching && !isTracing ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={{ repeat: typingDone && !isSearching && !isTracing ? Infinity : 0, duration: 1.4 }}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '12px 16px',
          background: T.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 9,
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {isSearching || isTracing ? (
          <>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Zach is measuring your yard…
          </>
        ) : (
          <>
            <Calculator size={16} />
            Get my instant quote
          </>
        )}
      </motion.button>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8, textAlign: 'center' }}>
        No obligation. We'll only use your contact info to follow up.
      </div>
    </motion.div>
  )
}

// ─── Result card (price card after quote) ───────────────────────────────
function ResultCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: 18,
        boxShadow: '0 1px 3px rgba(44,53,48,0.06)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* Success banner */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        style={{
          display: 'flex', gap: 8, padding: 10,
          background: T.successBg,
          border: `1px solid ${T.success}`,
          borderRadius: 9,
          marginBottom: 14,
        }}
      >
        <Check size={16} style={{ color: T.successDark, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: T.successDark, fontWeight: 600 }}>
          Your quote is ready! We've also sent it to the {COMPANY_NAME} team.
        </div>
      </motion.div>

      {/* Satellite preview (smaller, with trace overlay still visible) */}
      <div style={{
        marginBottom: 10,
        borderRadius: 9,
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
        maxHeight: 120,
      }}>
        <SatelliteTile traced={true} traceElapsed={2400} small />
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
        {TYPED_ADDRESS}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Stat label="Measured turf" value="2,850 sqft" hint="93% confidence" delay={0.3} />
        <Stat label="Per visit"      value="$42.00"    hint="38 min"        delay={0.45} />
        <Stat label="Mows / season"  value="26"        hint="$1,092 total"  delay={0.6} />
      </div>

      {/* Big total card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.75, duration: 0.35 }}
        style={{
          padding: 14,
          background: T.accent,
          color: '#fff',
          borderRadius: 11,
        }}
      >
        <div style={{ fontSize: 10, opacity: 0.8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
          Annual program total
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          $1,612.00
        </div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>
          Includes weekly mowing + 6-round treatment program.
        </div>
      </motion.div>
    </motion.div>
  )
}

function Stat({ label, value, hint, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      style={{
        flex: 1,
        minWidth: 100,
        padding: 10,
        background: T.bgInput,
        border: `1px solid ${T.border}`,
        borderRadius: 9,
      }}
    >
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 2 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
          {hint}
        </div>
      )}
    </motion.div>
  )
}

// ─── Counter helper ─────────────────────────────────────────────────────
function CounterText({ to, elapsed, durMs = 2200 }) {
  const t = Math.min(1, elapsed / durMs)
  const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
  const val = Math.round(to * eased)
  return val.toLocaleString()
}

// ─── Satellite tile — hand-drawn aerial styled like Google Maps ─────────
function SatelliteTile({ traced, traceElapsed = 0, small }) {
  // Lot polygon — drawn at higher zoom; mostly grass with a house pad,
  // driveway, and trees. Matches the look-and-feel of the previous
  // version but framed inside a Maps-style tile (controls + scale bar).
  const grassPoints = '60,80 280,40 440,90 510,210 480,340 380,400 220,420 100,360 40,240'
  const houseBox = { x: 200, y: 160, w: 140, h: 100 }

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: small ? '16/8' : '16/9', background: '#c4a878' }}>
      <svg viewBox="0 0 600 450" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
        {/* Dirt frame texture */}
        <defs>
          <pattern id="dirt" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="#b09866" strokeWidth="0.5" opacity="0.4" />
          </pattern>
          <pattern id="grass" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.8" fill="#5a7e3f" opacity="0.35" />
          </pattern>
        </defs>
        <rect width="600" height="450" fill="url(#dirt)" />
        {/* Neighbor lot strips for realism */}
        <rect x="0" y="0" width="600" height="14" fill="#a89060" />
        <rect x="0" y="436" width="600" height="14" fill="#a89060" />
        {/* Lawn */}
        <polygon points={grassPoints} fill="#7ea65a" />
        <polygon points={grassPoints} fill="url(#grass)" />
        {/* House */}
        <rect x={houseBox.x} y={houseBox.y} width={houseBox.w} height={houseBox.h} fill="#d8d2c1" stroke="#a89c80" strokeWidth="1" />
        <polygon points={`${houseBox.x},${houseBox.y} ${houseBox.x + houseBox.w/2},${houseBox.y - 30} ${houseBox.x + houseBox.w},${houseBox.y}`} fill="#7a4d3a" />
        <rect x={houseBox.x + houseBox.w/2 - 11} y={houseBox.y + houseBox.h - 32} width="22" height="32" fill="#5d3e2a" />
        {/* Driveway */}
        <polygon points={`${houseBox.x + houseBox.w/2 - 12},${houseBox.y + houseBox.h} ${houseBox.x + houseBox.w/2 + 12},${houseBox.y + houseBox.h} ${houseBox.x + houseBox.w/2 + 28},450 ${houseBox.x + houseBox.w/2 - 28},450`} fill="#8b8a85" />
        {/* Trees */}
        <circle cx="110" cy="160" r="22" fill="#4a6b3a" opacity="0.85" />
        <circle cx="120" cy="150" r="14" fill="#7ea65a" opacity="0.6" />
        <circle cx="450" cy="155" r="28" fill="#4a6b3a" opacity="0.85" />
        <circle cx="460" cy="145" r="18" fill="#7ea65a" opacity="0.6" />
        <circle cx="420" cy="360" r="20" fill="#4a6b3a" opacity="0.85" />

        {/* AI-traced polygon — animated dasharray */}
        {traced && (
          <motion.polygon
            points={grassPoints}
            fill="none"
            stroke="#22c55e"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeDasharray="1600"
            initial={{ strokeDashoffset: 1600 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 2.4, ease: 'easeInOut' }}
            style={{ filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.5))' }}
          />
        )}
      </svg>

      {/* Map-tile-style chrome overlays */}
      <div style={{
        position: 'absolute', top: 6, left: 6,
        padding: '3px 7px', borderRadius: 4,
        background: 'rgba(255,255,255,0.92)',
        fontSize: 9, fontWeight: 600, color: '#3c4043',
        letterSpacing: '0.04em',
      }}>
        Satellite
      </div>
      <div style={{
        position: 'absolute', bottom: 6, right: 6,
        padding: '2px 6px',
        background: 'rgba(255,255,255,0.85)',
        borderRadius: 3,
        fontSize: 8, color: '#666',
      }}>
        Map data ©2026 Google
      </div>

      {/* Sparkles particles during trace */}
      {traced && traceElapsed > 200 && (
        <>
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }}
              transition={{ duration: 1.4, delay: 0.4 + i * 0.25, repeat: Infinity, repeatDelay: 1.2 }}
              style={{
                position: 'absolute',
                top: `${30 + (i * 12)}%`,
                left: `${30 + (i * 8)}%`,
                pointerEvents: 'none',
              }}
            >
              <Sparkles size={11} style={{ color: '#ffd84d', filter: 'drop-shadow(0 0 4px rgba(255,216,77,0.6))' }} />
            </motion.div>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Delivered scene — email + Lead Setter split ────────────────────────
function DeliveredScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex', gap: 14 }}>
      {/* Email preview */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          flex: 1,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
      >
        {/* Email client header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${T.border}`,
          background: T.bg,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: T.textMuted,
        }}>
          <Mail size={14} style={{ color: T.accent }} />
          <span style={{ fontWeight: 700, color: T.text }}>Inbox</span>
          <span style={{ marginLeft: 'auto' }}>just now</span>
        </div>

        {/* Email row */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
            }}>
              Z
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                {COMPANY_NAME} — Zach the Yard Yeti
              </div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                quotes@hhh.services
              </div>
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 4 }}>
            Your instant lawn-care quote — $1,612 / season
          </div>

          {/* Email body card */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{
              marginTop: 6,
              padding: 12,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              background: T.bg,
            }}
          >
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>
              {TYPED_ADDRESS}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <MiniStat label="Turf"     value="2,850 sqft" />
              <MiniStat label="Per mow"  value="$42" />
              <MiniStat label="Annual"   value="$1,612" />
            </div>
            <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>
              Includes weekly mowing + 6-round treatment program. We'll be in touch shortly to schedule your first visit.
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Lead Setter board — lead arrives */}
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        style={{
          width: '42%',
          maxWidth: 320,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${T.border}`,
          background: T.bg,
          fontSize: 11, fontWeight: 700, color: T.text,
        }}>
          Lead Setter
        </div>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New
          </div>
          <motion.div
            initial={{ opacity: 0, x: -8, background: 'rgba(34,197,94,0.3)' }}
            animate={{ opacity: 1, x: 0, background: '#fff' }}
            transition={{ delay: 0.8, duration: 0.5 }}
            style={{
              padding: 10,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Sparkles size={11} style={{ color: T.accent }} />
              <div style={{ fontSize: 9, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                From Yard Measure
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              Sarah Chen
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>
              {TYPED_ADDRESS}
            </div>
            <div style={{
              marginTop: 6,
              display: 'inline-block',
              padding: '2px 7px',
              background: T.successBg,
              borderRadius: 99,
              fontSize: 9, fontWeight: 700,
              color: T.successDark,
            }}>
              $1,612 quote sent
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div style={{ flex: 1, padding: '6px 8px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6 }}>
      <div style={{ fontSize: 8, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{value}</div>
    </div>
  )
}

// ─── Captions ───────────────────────────────────────────────────────────
function computeCaption(phase, sceneKey, setupIdx, setupShowingIntro, card) {
  const marketingCaptions = {
    address:   '1. Prospect enters their address on your public quote page',
    zoom:      '2. Satellite imagery loads at the property',
    trace:     '3. AI traces the turf and measures it to the square foot',
    quote:     '4. Instant per-mow + annual quote with full breakdown',
    delivered: '5. Quote emailed · lead lands in your pipeline',
  }
  if (phase === 'marketing') return marketingCaptions[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'Now — how to set it up'
  if (phase === 'setup') {
    const step = card.setup.steps[setupIdx]
    return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${step?.title || ''}`
  }
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}

// CSS keyframe used by the Loader spinner.
if (typeof document !== 'undefined' && !document.getElementById('yard-measure-walkthrough-css')) {
  const s = document.createElement('style')
  s.id = 'yard-measure-walkthrough-css'
  s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
  document.head.appendChild(s)
}
