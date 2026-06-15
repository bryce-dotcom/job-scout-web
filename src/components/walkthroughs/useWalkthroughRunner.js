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
import { useNarration, resetNarrationCache, playAudioNow } from './useNarration'
import { getNarrationForCard } from '../../lib/featureKnowledge'
import { audioUrlFor } from '../../lib/walkthroughScripts'

const AUDIO_TAIL_MS = 800  // breathing room after audio ends
const PRELOAD_TIMEOUT_MS = 6000  // give up preloading after 6s

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

  // Dev-only: sessionStorage key lets QA freeze the walkthrough at a specific
  // elapsed (ms) for clean screenshots. Set via browser console then reload.
  const _ssElapsed = typeof window !== 'undefined' && import.meta.env.DEV
    ? sessionStorage.getItem('__dev_walkthrough_elapsed')
    : null
  const _staticMs = _ssElapsed != null ? parseInt(_ssElapsed, 10) : null

  const [elapsed, setElapsed] = useState(_staticMs ?? 0)
  const [running, setRunning] = useState(_staticMs == null)
  const [voiceOn, _setVoiceOn] = useState(true)
  const [audioDurations, setAudioDurations] = useState({})
  const [audioElements, setAudioElements] = useState({})
  const voiceOnRef = useRef(true)
  const audioElementsRef = useRef({})
  const positionRef = useRef(null)
  // Start the runner immediately; the audio-preload effect below extends
  // scene durations once (and if) audio lands — avoids a stall on walkthroughs
  // that have no MP3 files yet.
  const [audioReady, setAudioReady] = useState(true)
  const timerRef = useRef(null)
  const startedAt = useRef(Date.now())

  // Preload every MP3 on mount AND wait for canplaythrough before
  // letting the runner tick. Two-bird fix:
  //   1. play() is near-instant when a scene starts → no start lag
  //   2. We get accurate durations from the loaded element to size scenes
  // Side effect: the modal pauses ~200–500ms before the first scene
  // visual starts. Worth it for sync'd audio.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const loadAudio = (key, url) => new Promise((resolve) => {
      const audio = new Audio()
      audio.preload = 'auto'
      let done = false
      const settle = (val) => {
        if (done) return
        done = true
        audio.removeEventListener('canplaythrough', onReady)
        audio.removeEventListener('error', onErr)
        resolve(val)
      }
      const onReady = () => settle({ key, audio, duration: isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null })
      const onErr   = () => settle({ key, audio: null, duration: null })
      audio.addEventListener('canplaythrough', onReady)
      audio.addEventListener('error', onErr)
      setTimeout(() => settle({ key, audio: null, duration: null }), PRELOAD_TIMEOUT_MS)
      audio.src = url
      // Trigger the network fetch (some browsers need this).
      audio.load()
    })

    // Guard against SPA servers (e.g. Vite dev) returning index.html with
    // 200/text-html for missing MP3s — the Audio element never fires 'error'
    // for HTML content, so the runner would stall until the 6 s timeout per
    // file. A HEAD request lets us bail immediately when the file isn't real.
    const loadOne = (key) => {
      const url = audioUrlFor(card.id, key)
      if (!url) return Promise.resolve({ key, audio: null, duration: null })
      return fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(res => {
          const ct = res.headers.get('content-type') || ''
          if (!res.ok || ct.includes('html')) return { key, audio: null, duration: null }
          return loadAudio(key, url)
        })
        .catch(() => ({ key, audio: null, duration: null }))
    }

    Promise.all(ALL_SCENE_KEYS.map(loadOne)).then((results) => {
      if (cancelled) return
      const durations = {}
      const elements  = {}
      for (const r of results) {
        if (r.duration) durations[r.key] = r.duration
        if (r.audio)    elements[r.key]  = r.audio
      }
      setAudioDurations(durations)
      setAudioElements(elements)
      setAudioReady(true)
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

  // Interval-driven elapsed tracker. Uses setInterval (not rAF) so it
  // continues advancing even when the tab is backgrounded or hidden.
  useEffect(() => {
    if (!running) return
    if (!audioReady) return
    startedAt.current = Date.now() - elapsed
    timerRef.current = setInterval(() => {
      const now = Date.now() - startedAt.current
      if (now >= totalMs) {
        setElapsed(totalMs)
        setRunning(false)
        clearInterval(timerRef.current)
        return
      }
      setElapsed(now)
    }, 16)
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, totalMs, audioReady])

  const position = useMemo(
    () => timelinePosition(elapsed, { scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs }),
    [elapsed, scenes, setupIntroMs, setupStepDur, totalMarketingMs, totalMs],
  )

  // Keep refs in sync during render so the gesture handler below always
  // reads the latest values without closing over stale state.
  voiceOnRef.current = voiceOn
  audioElementsRef.current = audioElements
  positionRef.current = position

  // Enhanced setter: when enabling voice, call playAudioNow synchronously
  // while still on the iOS gesture stack so autoplay is permitted.
  const setVoiceOn = (valueOrUpdater) => {
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(voiceOnRef.current) : valueOrUpdater
    if (next && !voiceOnRef.current) {
      const key = positionRef.current?.sceneKey
      playAudioNow(audioElementsRef.current?.[key])
    }
    _setVoiceOn(next)
  }

  useNarration({
    walkthroughId: card.id,
    scene: position.sceneKey,
    script: NARRATION,
    enabled: voiceOn,
    preloadedAudio: audioElements,
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
