// Shared walkthrough runner.
//
// Encapsulates the timing, audio-probe, narration, and phase logic that
// every walkthrough needs. A walkthrough using this hook only has to:
//   1. Read its knowledge card (gets scenes + setup + narration)
//   2. Render a <Stage scene={sceneKey} sceneElapsed={...} /> for the
//      marketing reel visuals
//   3. Render SetupChecklist / SetupIntro / DonePanel via the helpers
//      already in this folder
//
// Inputs:
//   card           — knowledge card object (id, marketing, setup)
//   onSceneChange  — optional callback when sceneKey changes
//
// Returns everything the walkthrough needs to render itself.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNarration, probeWalkthroughAudio, resetNarrationCache } from './useNarration'
import { getNarrationForCard } from '../../lib/featureKnowledge'

const AUDIO_TAIL_MS = 600  // breathing room after audio ends

export function useWalkthroughRunner(card) {
  const narration = useMemo(() => getNarrationForCard(card), [card])
  const NARRATION = narration?.lines || {}

  // Base durations + all scene keys (used for audio probe).
  const BASE_SCENES = useMemo(
    () => (card.marketing?.scenes || []).map(s => ({ id: s.id, dur: s.baseDur || 4000 })),
    [card],
  )
  const BASE_SETUP_INTRO_MS = card.setup?.introBaseDur || 1200
  const BASE_SETUP_STEP_DUR = useMemo(
    () => (card.setup?.steps || []).map(s => s.baseDur || 4500),
    [card],
  )
  const ALL_SCENE_KEYS = useMemo(
    () => [
      ...BASE_SCENES.map(s => s.id),
      'setup-intro',
      ...BASE_SETUP_STEP_DUR.map((_, i) => `setup-${i}`),
    ],
    [BASE_SCENES, BASE_SETUP_STEP_DUR],
  )

  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const [audioDurations, setAudioDurations] = useState({})
  const timerRef = useRef(null)
  const startedAt = useRef(Date.now())

  // Probe MP3 durations once on mount.
  useEffect(() => {
    let cancelled = false
    probeWalkthroughAudio(card.id, ALL_SCENE_KEYS).then((map) => {
      if (!cancelled) setAudioDurations(map)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  // Effective durations + totals — recomputed when audio lands.
  const { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs } = useMemo(() => {
    const ext = (key, base) => {
      const audio = audioDurations[key]
      return audio ? Math.max(base, audio + AUDIO_TAIL_MS) : base
    }
    const scenes = BASE_SCENES.map(s => ({ ...s, dur: ext(s.id, s.dur) }))
    const setupIntroMs = ext('setup-intro', BASE_SETUP_INTRO_MS)
    const setupStepDur = BASE_SETUP_STEP_DUR.map((d, i) => ext(`setup-${i}`, d))
    const totalMarketingMs = scenes.reduce((s, x) => s + x.dur, 0)
    const totalSetupMs = setupIntroMs + setupStepDur.reduce((s, x) => s + x, 0)
    return {
      scenes, setupIntroMs, setupStepDur, totalMarketingMs,
      totalMs: totalMarketingMs + totalSetupMs,
    }
  }, [audioDurations, BASE_SCENES, BASE_SETUP_INTRO_MS, BASE_SETUP_STEP_DUR])

  // RAF-driven elapsed tracker.
  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now() - elapsed
    const tick = () => {
      const now = Date.now() - startedAt.current
      if (now >= totalMs) {
        setElapsed(totalMs)
        setRunning(false)
        return
      }
      setElapsed(now)
      timerRef.current = requestAnimationFrame(tick)
    }
    timerRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, totalMs])

  const position = useMemo(
    () => timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs }),
    [elapsed, scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs],
  )

  useNarration({
    walkthroughId: card.id,
    scene: position.sceneKey,
    script: NARRATION,
    enabled: voiceOn,
  })

  const replay = () => {
    resetNarrationCache()
    setElapsed(0)
    setRunning(true)
  }

  return {
    // Position
    phase: position.phase,
    sceneKey: position.sceneKey,
    sceneElapsed: position.sceneElapsed,
    setupIdx: position.setupIdx,
    setupShowingIntro: position.setupShowingIntro,
    // Progress
    elapsed,
    totalMs,
    totalMarketingMs,
    // Voice
    voiceOn,
    setVoiceOn,
    // Controls
    replay,
    running,
  }
}

function timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs }) {
  if (elapsed >= totalMs) {
    return {
      phase: 'done',
      sceneKey: null,
      setupIdx: setupStepDur.length - 1,
      setupShowingIntro: false,
      sceneElapsed: 0,
    }
  }
  if (elapsed < totalMarketingMs) {
    let acc = 0
    for (let i = 0; i < scenes.length; i++) {
      const start = acc
      acc += scenes[i].dur
      if (elapsed < acc) {
        return {
          phase: 'marketing',
          sceneKey: scenes[i].id,
          setupIdx: 0,
          setupShowingIntro: false,
          sceneElapsed: elapsed - start,
        }
      }
    }
  }
  const setupElapsed = elapsed - totalMarketingMs
  if (setupElapsed < setupIntroMs) {
    return {
      phase: 'setup',
      sceneKey: 'setup-intro',
      setupIdx: 0,
      setupShowingIntro: true,
      sceneElapsed: setupElapsed,
    }
  }
  let acc = setupIntroMs
  for (let i = 0; i < setupStepDur.length; i++) {
    const start = acc
    acc += setupStepDur[i]
    if (setupElapsed < acc) {
      return {
        phase: 'setup',
        sceneKey: `setup-${i}`,
        setupIdx: i,
        setupShowingIntro: false,
        sceneElapsed: setupElapsed - start,
      }
    }
  }
  return {
    phase: 'setup',
    sceneKey: `setup-${setupStepDur.length - 1}`,
    setupIdx: setupStepDur.length - 1,
    setupShowingIntro: false,
    sceneElapsed: 0,
  }
}
