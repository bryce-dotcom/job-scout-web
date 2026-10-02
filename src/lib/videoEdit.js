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

export async function renderEdit({ clips, aspect = 'vertical', fps = 30, onProgress = null, signal = null }) {
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
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t)
  }

  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((r) => { rec.onstop = r })
  rec.start(500)

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
        try { const src = audio.createMediaElementSource(v); src.connect(dest) } catch { /* already connected or unsupported */ }
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
    // Hold the last frame a beat so the recorder flushes it.
    await wait(250)
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
