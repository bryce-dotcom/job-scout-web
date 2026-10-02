// Cut and stitch video in the browser, with no server and no ffmpeg.
//
// How: play each clip's chosen stretch into a hidden canvas (cover-fit to
// the chosen frame), route its sound through Web Audio, and record the
// canvas + audio with MediaRecorder. It renders in real time — a 40-second
// result takes 40 seconds — which is fine for a Reel and keeps the phone
// out of trouble. Output is whatever the browser records best (mp4 on
// Safari, webm elsewhere); the publisher transcodes for each network.
//
// Progress is seconds rendered over seconds planned.

export const ASPECTS = {
  vertical:  { w: 720,  h: 1280, label: 'Vertical · Reels, Stories, TikTok' },
  square:    { w: 1080, h: 1080, label: 'Square · feed' },
  landscape: { w: 1280, h: 720,  label: 'Landscape · YouTube, Facebook video' },
}

export const MAX_RESULT_SECONDS = 90

export function totalSeconds(clips) {
  return (clips || []).reduce((n, c) => n + Math.max(0, (Number(c.end) || 0) - (Number(c.start) || 0)), 0)
}

// Keep the whole clip when it fits; otherwise the first `cap` seconds. The
// AI plan may override with its own stretch.
export function defaultTrim(duration, cap = 20) {
  const d = Number(duration) || 0
  return { start: 0, end: d > 0 ? Math.min(d, cap) : cap }
}

export function canEditVideo() {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream
}

function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return c.find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || ''
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const once = (el, ev, ms) => new Promise((resolve) => {
  let done = false
  const fin = (ok) => { if (!done) { done = true; el.removeEventListener(ev, h); resolve(ok) } }
  const h = () => fin(true)
  el.addEventListener(ev, h, { once: true })
  setTimeout(() => fin(false), ms)
})

function drawCover(ctx, video, W, H) {
  const vw = video.videoWidth || W, vh = video.videoHeight || H
  const s = Math.max(W / vw, H / vh)
  const dw = vw * s, dh = vh * s
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

// If the narrator runs past the picture, hold the last scene until they
// finish (within the cap). Pure; tested.
export function stretchForVoice(scenes, total, voiceLen, cap = MAX_RESULT_SECONDS) {
  if (!scenes.length || !(voiceLen > total - 0.3)) return { scenes, total }
  const extra = Math.min(cap - total, voiceLen + 0.6 - total)
  if (!(extra > 0)) return { scenes, total }
  const last = scenes.length - 1
  return {
    scenes: scenes.map((sc, i) => (i === last ? { ...sc, seconds: +((sc.seconds || 0) + extra).toFixed(1) } : sc)),
    total: +(total + extra).toFixed(1),
  }
}

// soundtrack: { music: AudioBuffer|null, musicGain: 0..1, voice: AudioBuffer|null }
// Plays into the recording (not the speaker): the voice from the top, the
// music ducked under it and brought back after, faded out at the end.
function startSoundtrack(audio, dest, soundtrack, total) {
  if (!audio || !dest || !soundtrack) return
  const voiceLen = soundtrack.voice?.duration || 0
  const t0 = audio.currentTime + 0.05
  if (soundtrack.music) {
    const src = audio.createBufferSource(); src.buffer = soundtrack.music
    const g = audio.createGain()
    const level = Math.max(0, Math.min(1, soundtrack.musicGain ?? 0.6))
    const ducked = soundtrack.voice ? level * 0.35 : level
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, ducked), t0 + 0.8)
    if (soundtrack.voice) {
      g.gain.setValueAtTime(Math.max(0.0001, ducked), t0 + voiceLen + 0.3)
      g.gain.linearRampToValueAtTime(level, t0 + voiceLen + 1.5)
    }
    g.gain.setValueAtTime(g.gain.value, t0 + Math.max(1, total - 1.5))
    g.gain.linearRampToValueAtTime(0.0001, t0 + total)
    src.connect(g); g.connect(dest); src.start(t0); src.stop(t0 + total + 0.1)
  }
  if (soundtrack.voice) {
    const v = audio.createBufferSource(); v.buffer = soundtrack.voice
    const vg = audio.createGain(); vg.gain.value = 1
    v.connect(vg); vg.connect(dest); v.start(t0 + 0.4)
  }
}
// How loud a clip's own sound sits: under a narrator, low; under music, a little lower than alone.
const clipLevel = (soundtrack) => (soundtrack?.voice ? 0.25 : soundtrack?.music ? 0.7 : 1)

export async function renderEdit({ clips, aspect = 'vertical', fps = 30, soundtrack = null, onProgress = null, signal = null }) {
  if (!canEditVideo()) throw new Error('This browser cannot cut video. Try Safari on the phone or Chrome on a computer.')
  const { w: W, h: H } = ASPECTS[aspect] || ASPECTS.vertical
  const plan = (clips || []).map((c) => ({ ...c, start: Math.max(0, Number(c.start) || 0), end: Math.max(0, Number(c.end) || 0) })).filter((c) => c.end > c.start + 0.2)
  const total = totalSeconds(plan)
  if (!plan.length) throw new Error('Nothing to cut: every clip is trimmed to zero.')
  if (total > MAX_RESULT_SECONDS + 0.5) throw new Error(`That is ${Math.round(total)} seconds; keep it under ${MAX_RESULT_SECONDS}.`)

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
  const stream = canvas.captureStream(fps)

  const AC = window.AudioContext || window.webkitAudioContext
  const audio = AC ? new AC() : null
  let dest = null
  if (audio) {
    try { await audio.resume() } catch { /* fine */ }
    dest = audio.createMediaStreamDestination()
    try { const silent = audio.createConstantSource(); silent.offset.value = 0; const g = audio.createGain(); g.gain.value = 0; silent.connect(g); g.connect(dest); silent.start() } catch { /* older engines */ }
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t)
  }

  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((r) => { rec.onstop = r })
  rec.start(500)
  const voiceLen = soundtrack?.voice?.duration || 0
  const tail = Math.max(0.25, voiceLen + 0.6 - total)
  startSoundtrack(audio, dest, soundtrack, total + tail - 0.25)

  let rendered = 0
  const videos = []
  try {
    for (const clip of plan) {
      if (signal?.aborted) throw new Error('Cancelled')
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'; v.muted = false; v.playsInline = true; v.preload = 'auto'
      v.setAttribute('playsinline', '')
      v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none'
      document.body.appendChild(v)
      videos.push(v)
      v.src = clip.url
      v.load()
      if (!(await once(v, 'loadedmetadata', 15000))) throw new Error('Could not open one of the clips.')
      await once(v, 'loadeddata', 8000)
      // Sound goes to the recording, not the speaker.
      if (audio && dest) {
        try { const src = audio.createMediaElementSource(v); const g = audio.createGain(); g.gain.value = clipLevel(soundtrack); src.connect(g); g.connect(dest) } catch { /* already connected or unsupported */ }
      } else v.muted = true
      const end = Math.min(clip.end, isFinite(v.duration) ? v.duration : clip.end)
      if (Math.abs(v.currentTime - clip.start) > 0.05) {
        const seeked = once(v, 'seeked', 8000)
        v.currentTime = clip.start
        await seeked
      }
      await v.play()
      const base = rendered
      // A timer, not requestAnimationFrame: rAF stops in a hidden tab (and
      // when a phone switches apps), and the recording would go black while
      // the clip kept playing. requestFrame pushes each draw into the track.
      const track = stream.getVideoTracks()[0]
      await new Promise((resolve) => {
        const iv = setInterval(() => {
          if (signal?.aborted || v.ended || v.currentTime >= end - 0.03) { clearInterval(iv); resolve(); return }
          drawCover(ctx, v, W, H)
          try { track.requestFrame?.() } catch { /* not every engine has it */ }
          const done = base + Math.max(0, v.currentTime - clip.start)
          onProgress?.(Math.min(0.99, done / total), done)
        }, Math.round(1000 / fps))
        v.addEventListener('ended', () => { clearInterval(iv); resolve() }, { once: true })
      })
      v.pause()
      rendered += end - clip.start
      onProgress?.(Math.min(0.99, rendered / total), rendered)
    }
    // Hold the last frame a beat so the recorder flushes it, longer if the
    // narrator is still talking.
    const holdTrack = stream.getVideoTracks()[0]
    const holdUntil = performance.now() + tail * 1000
    while (performance.now() < holdUntil) { try { holdTrack.requestFrame?.() } catch { /* ignore */ } await wait(Math.round(1000 / fps)) }
  } finally {
    try { rec.state !== 'inactive' && rec.stop() } catch { /* ignore */ }
    await stopped
    for (const v of videos) { try { v.pause(); v.removeAttribute('src'); v.load(); v.remove() } catch { /* ignore */ } }
    try { await audio?.close() } catch { /* ignore */ }
    for (const t of stream.getTracks()) t.stop()
  }
  if (signal?.aborted) throw new Error('Cancelled')
  const type = (mime || 'video/webm').split(';')[0]
  const blob = new Blob(chunks, { type })
  if (!blob.size) throw new Error('The recording came out empty. Try again, or a different browser.')
  onProgress?.(1, total)
  const ext = type.includes('mp4') ? 'mp4' : 'webm'
  return { blob, file: new File([blob], `cut-${Date.now()}.${ext}`, { type }), duration: total, mime: type }
}

// ── Storyboard: the AI's scenes, rendered ─────────────────────────────
// Scenes come from marketing-draft (mode storyboard): compare (before →
// after reveal), photo (slow motion), clip (a stretch of video), card
// (text on the brand colour). Headlines sit over the picture with a
// shadow, the brand badge in a corner, and a call-to-action card closes
// it. Same recorder as renderEdit; same real-time rule.

const SCENE_KINDS = new Set(['compare', 'photo', 'clip', 'card'])

// Keep what refers to real captures, clamp seconds, add the closing card.
export function normalizeStoryboard(sb, captures = [], { max = 60 } = {}) {
  const byId = Object.fromEntries((captures || []).map((c) => [c.id, c]))
  const out = []
  let total = 0
  for (let sc of sb?.scenes || []) {
    if (!SCENE_KINDS.has(sc?.kind)) continue
    let secs = Math.max(1.5, Math.min(8, Number(sc.seconds) || 3))
    if (sc.kind === 'compare' && !(byId[sc.before] && byId[sc.after])) continue
    if ((sc.kind === 'photo' || sc.kind === 'clip') && !byId[sc.capture]) continue
    if (sc.kind === 'clip') {
      const d = Number(byId[sc.capture].duration_s) || 0
      const start = Math.max(0, Number(sc.start) || 0)
      let end = Number(sc.end); if (!isFinite(end) || end <= start) end = start + secs
      if (d) end = Math.min(end, d)
      if (end - start < 1) continue
      secs = end - start
      sc = { ...sc, start, end }
    }
    if (sc.kind === 'card' && !sc.text) continue
    if (total + secs > max) break
    out.push({ ...sc, seconds: +secs.toFixed(1) })
    total += secs
  }
  const cta = sb?.cta?.text ? { kind: 'card', text: sb.cta.text, sub: sb.cta.sub || null, seconds: 3, cta: true } : null
  if (cta && total + 3 <= max && !(out[out.length - 1]?.cta)) { out.push(cta); total += 3 }
  return { scenes: out, total: +total.toFixed(1), headline: sb?.headline || '' }
}

const loadImage = (url) => new Promise((resolve) => {
  const img = new Image(); img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img); img.onerror = () => resolve(null)
  img.src = url
})

function wrapLines(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []; let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 4)
}

function drawHeadline(ctx, W, H, text, { y = 0.22, size = 0.075, color = '#fff' } = {}) {
  if (!text) return
  const fs = Math.round(W * size)
  ctx.save()
  ctx.font = '800 ' + fs + 'px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const lines = wrapLines(ctx, text, W * 0.86)
  const lh = fs * 1.15
  const top = H * y - ((lines.length - 1) * lh) / 2
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = fs * 0.5; ctx.shadowOffsetY = fs * 0.08
  ctx.fillStyle = color
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh))
  ctx.restore()
}

function drawBadge(ctx, W, H, brand, logo) {
  const pad = Math.round(W * 0.04), h = Math.round(W * 0.075)
  const name = brand?.name || ''
  if (!name && !logo) return
  ctx.save()
  ctx.font = '700 ' + Math.round(h * 0.55) + 'px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  const tw = name ? ctx.measureText(name).width : 0
  const w = (logo ? h + pad * 0.5 : 0) + tw + pad * 1.4
  const x = pad, y = H - pad - h
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h)
  ctx.fill()
  let tx = x + pad * 0.7
  if (logo) { ctx.drawImage(logo, x + pad * 0.35, y + h * 0.12, h * 0.76, h * 0.76); tx = x + pad * 0.35 + h + pad * 0.2 }
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillText(name, tx, y + h / 2)
  ctx.restore()
}

function drawImageKenBurns(ctx, img, W, H, t, motion) {
  // t 0..1 through the scene. Cover-fit, then a slow 8% move.
  const s0 = Math.max(W / img.width, H / img.height)
  const zoom = motion === 'zoom_in' ? 1 + 0.08 * t : motion === 'zoom_out' ? 1.08 - 0.08 * t : 1.06
  const s = s0 * zoom
  const dw = img.width * s, dh = img.height * s
  let dx = (W - dw) / 2
  const dy = (H - dh) / 2
  if (motion === 'pan_left') dx = (W - dw) * (0.2 + 0.6 * t)
  if (motion === 'pan_right') dx = (W - dw) * (0.8 - 0.6 * t)
  ctx.drawImage(img, dx, dy, dw, dh)
}

// soundtrack as renderEdit. If the voice runs past the picture, the closing
// card holds until the narrator finishes.
export async function renderStoryboard({ storyboard, captures, brand = {}, aspect = 'vertical', fps = 30, soundtrack = null, onProgress = null, signal = null }) {
  if (!canEditVideo()) throw new Error('This browser cannot make video. Try Safari on the phone or Chrome on a computer.')
  const { w: W, h: H } = ASPECTS[aspect] || ASPECTS.vertical
  const norm = normalizeStoryboard(storyboard, captures)
  let { scenes, total } = norm
  if (!scenes.length) throw new Error('The storyboard has no scenes.')
  ;({ scenes, total } = stretchForVoice(scenes, total, soundtrack?.voice?.duration || 0))
  const byId = Object.fromEntries((captures || []).map((c) => [c.id, c]))
  const color = brand?.color || '#5a6349'
  const logo = brand?.logo_url ? await loadImage(brand.logo_url) : null
  const images = {}
  for (const sc of scenes) {
    for (const id of [sc.capture, sc.before, sc.after].filter(Boolean)) {
      const c = byId[id]
      if (c && c.media_type !== 'video' && !images[id]) images[id] = await loadImage(c.url)
    }
  }

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const stream = canvas.captureStream(fps)
  const track = stream.getVideoTracks()[0]
  const AC = window.AudioContext || window.webkitAudioContext
  const audio = AC ? new AC() : null
  let dest = null
  if (audio) {
    try { await audio.resume() } catch { /* fine */ }
    dest = audio.createMediaStreamDestination()
    // A destination with nothing playing into it emits no audio frames, and
    // the recorder then waits forever: the first storyboard came out 0.9 s
    // long. A silent constant source keeps the audio clock running.
    try { const silent = audio.createConstantSource(); silent.offset.value = 0; const g = audio.createGain(); g.gain.value = 0; silent.connect(g); g.connect(dest); silent.start() } catch { /* older engines */ }
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t)
  }
  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((r) => { rec.onstop = r })
  rec.start(500)

  startSoundtrack(audio, dest, soundtrack, total)

  let rendered = 0
  const videos = []
  const frameMs = Math.round(1000 / fps)
  const paint = () => { try { track.requestFrame?.() } catch { /* ignore */ } }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  try {
    for (const sc of scenes) {
      if (signal?.aborted) throw new Error('Cancelled')
      const secs = sc.seconds
      const started = performance.now()
      if (sc.kind === 'clip') {
        const c = byId[sc.capture]
        const v = document.createElement('video')
        v.crossOrigin = 'anonymous'; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '')
        v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none'
        document.body.appendChild(v); videos.push(v)
        v.src = c.url; v.load()
        if (!(await once(v, 'loadedmetadata', 15000))) throw new Error('Could not open a clip.')
        await once(v, 'loadeddata', 8000)
        if (audio && dest) { try { const src = audio.createMediaElementSource(v); const g = audio.createGain(); g.gain.value = clipLevel(soundtrack); src.connect(g); g.connect(dest) } catch { /* ignore */ } } else v.muted = true
        if (Math.abs(v.currentTime - sc.start) > 0.05) { const s = once(v, 'seeked', 8000); v.currentTime = sc.start; await s }
        await v.play()
        await new Promise((resolve) => {
          const iv = setInterval(() => {
            if (signal?.aborted || v.ended || v.currentTime >= sc.end - 0.03) { clearInterval(iv); resolve(); return }
            drawCover(ctx, v, W, H)
            drawHeadline(ctx, W, H, sc.text)
            drawBadge(ctx, W, H, brand, logo)
            paint()
            onProgress?.(Math.min(0.99, (rendered + (v.currentTime - sc.start)) / total), rendered + (v.currentTime - sc.start))
          }, frameMs)
          v.addEventListener('ended', () => { clearInterval(iv); resolve() }, { once: true })
        })
        v.pause()
      } else {
        await new Promise((resolve) => {
          const iv = setInterval(() => {
            const el = (performance.now() - started) / 1000
            const t = Math.min(1, el / secs)
            if (signal?.aborted || el >= secs) { clearInterval(iv); resolve(); return }
            if (sc.kind === 'card') {
              ctx.fillStyle = color; ctx.fillRect(0, 0, W, H)
              const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.35)')
              ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
              if (logo && sc.cta) ctx.drawImage(logo, W / 2 - W * 0.1, H * 0.3, W * 0.2, W * 0.2)
              drawHeadline(ctx, W, H, sc.text, { y: sc.cta ? 0.55 : 0.48, size: sc.cta ? 0.085 : 0.09 })
              if (sc.sub) drawHeadline(ctx, W, H, sc.sub, { y: sc.cta ? 0.66 : 0.6, size: 0.045, color: 'rgba(255,255,255,0.9)' })
            } else if (sc.kind === 'compare') {
              const before = images[sc.before], after = images[sc.after]
              if (before) drawImageKenBurns(ctx, before, W, H, t, 'zoom_in'); else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H) }
              // hold the before for a third, then wipe the after across
              const reveal = Math.max(0, Math.min(1, (t - 0.33) / 0.45))
              if (after && reveal > 0) {
                ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * reveal, H); ctx.clip()
                drawImageKenBurns(ctx, after, W, H, t, 'zoom_in')
                ctx.restore()
                if (reveal < 1) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(W * reveal - 2, 0, 4, H) }
              }
              drawHeadline(ctx, W, H, sc.text)
            } else {
              const img = images[sc.capture]
              if (img) drawImageKenBurns(ctx, img, W, H, t, sc.motion || 'zoom_in'); else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H) }
              drawHeadline(ctx, W, H, sc.text)
            }
            if (!sc.cta) drawBadge(ctx, W, H, brand, logo)
            paint()
            onProgress?.(Math.min(0.99, (rendered + el) / total), rendered + el)
          }, frameMs)
        })
      }
      rendered += secs
      onProgress?.(Math.min(0.99, rendered / total), rendered)
    }
    await sleep(250)
  } finally {
    try { if (rec.state !== 'inactive') rec.stop() } catch { /* ignore */ }
    await stopped
    for (const v of videos) { try { v.pause(); v.removeAttribute('src'); v.load(); v.remove() } catch { /* ignore */ } }
    try { await audio?.close() } catch { /* ignore */ }
    for (const t of stream.getTracks()) t.stop()
  }
  if (signal?.aborted) throw new Error('Cancelled')
  const type = (mime || 'video/webm').split(';')[0]
  const blob = new Blob(chunks, { type })
  if (!blob.size) throw new Error('The recording came out empty. Try again, or a different browser.')
  onProgress?.(1, total)
  const ext = type.includes('mp4') ? 'mp4' : 'webm'
  return { blob, file: new File([blob], 'ai-video-' + Date.now() + '.' + ext, { type }), duration: total, mime: type }
}
