// useNarration — plays the spoken narration for the current scene.
//
// Two playback paths:
//   1. Pre-generated MP3 at /audio/walkthroughs/<id>/<scene>.mp3
//      Generated offline via scripts/generate-walkthrough-audio.cjs
//      using ElevenLabs. This is the production path — natural voice,
//      consistent across browsers, no autoplay quirks.
//   2. Web Speech API (TTS) — fallback when no MP3 exists. Free, but
//      voice quality varies wildly by OS/browser.
//
// The hook tries the MP3 first via a HEAD probe. If the file exists,
// it plays the <audio>. If not, it falls back to speechSynthesis.

import { useEffect, useRef } from 'react'
import { audioUrlFor } from '../../lib/walkthroughScripts'

let cachedVoice = null
let voicesLoadedPromise = null

// HEAD-probe cache so we only check each MP3 URL once per session.
const audioAvailableCache = new Map() // url -> Promise<boolean>
function probeAudio(url) {
  if (audioAvailableCache.has(url)) return audioAvailableCache.get(url)
  const p = fetch(url, { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false)
  audioAvailableCache.set(url, p)
  return p
}

function loadVoices() {
  if (voicesLoadedPromise) return voicesLoadedPromise
  voicesLoadedPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve([])
    const existing = window.speechSynthesis.getVoices()
    if (existing.length) return resolve(existing)
    const handler = () => {
      const v = window.speechSynthesis.getVoices()
      if (v.length) {
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        resolve(v)
      }
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 1000)
  })
  return voicesLoadedPromise
}

function pickVoice(voices) {
  if (cachedVoice) return cachedVoice
  const en = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
  const preferred =
    en.find((v) => /Google US English/i.test(v.name)) ||
    en.find((v) => /Aria/i.test(v.name)) ||
    en.find((v) => /Samantha/i.test(v.name)) ||
    en.find((v) => /Daniel/i.test(v.name)) ||
    en.find((v) => /Karen/i.test(v.name)) ||
    en.find((v) => /Microsoft.*Natural/i.test(v.name)) ||
    en[0] ||
    voices[0]
  cachedVoice = preferred || null
  return cachedVoice
}

// Module-level state so we can stop in-flight audio cleanly on scene
// changes — the hook reuses one element across renders.
let activeAudio = null
function stopAll() {
  if (activeAudio) {
    try {
      activeAudio.pause()
      activeAudio.currentTime = 0
    } catch (_) { /* ignore */ }
    activeAudio = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

function speakViaSpeechSynthesis(text, voices) {
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 1.0
    u.volume = 1.0
    const v = pickVoice(voices)
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  } catch (e) {
    console.warn('[useNarration] speak failed:', e?.message)
  }
}

export function useNarration({ walkthroughId, scene, script, enabled = true }) {
  const lastSceneRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!enabled) { stopAll(); return }
    if (!scene || !script || !script[scene]) return
    if (lastSceneRef.current === scene) return
    lastSceneRef.current = scene

    let cancelled = false

    const tryMp3 = async () => {
      const url = audioUrlFor(walkthroughId, scene)
      if (!url) return false
      const ok = await probeAudio(url)
      if (!ok || cancelled || !enabled) return false
      stopAll()
      const audio = new Audio(url)
      audio.preload = 'auto'
      activeAudio = audio
      try {
        await audio.play()
      } catch (e) {
        // Autoplay can still fail in edge cases (e.g. iframe sandboxing).
        // Fall back to Web Speech.
        return false
      }
      return true
    }

    ;(async () => {
      const playedMp3 = await tryMp3()
      if (playedMp3 || cancelled) return
      // Fallback: Web Speech API
      const voices = await loadVoices()
      if (cancelled || !enabled) return
      speakViaSpeechSynthesis(script[scene], voices)
    })()

    return () => {
      cancelled = true
    }
  }, [scene, walkthroughId, enabled, script])

  // Cancel on unmount.
  useEffect(() => {
    return () => { stopAll() }
  }, [])
}

export function resetNarrationCache() {
  stopAll()
}
