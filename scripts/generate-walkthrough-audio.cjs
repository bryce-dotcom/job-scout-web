// Pre-generate narration MP3s via ElevenLabs.
//
// Reads every script in src/lib/walkthroughScripts.js and writes
// public/audio/walkthroughs/<id>/<scene>.mp3. The Video Library
// walkthroughs probe these URLs at runtime — present = play the MP3,
// missing = fall back to the browser's Web Speech API.
//
// Idempotent: by default skips files that already exist on disk. Pass
// --force to re-generate all of them. Pass --only <id> to limit to one
// walkthrough.
//
// Usage:
//   ELEVENLABS_API_KEY=... node scripts/generate-walkthrough-audio.cjs
//   ... --force
//   ... --only prospect-scout
//
// Output:
//   public/audio/walkthroughs/<id>/<scene>.mp3
//   public/audio/walkthroughs/manifest.json   (optional — written too)

const fs = require('fs')
const path = require('path')
const https = require('https')
require('dotenv').config()

const FORCE = process.argv.includes('--force')
const onlyIdx = process.argv.indexOf('--only')
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) {
  console.error('ERROR: ELEVENLABS_API_KEY not set in env. Add it to .env or export it.')
  process.exit(1)
}

// Voice id catalog. ElevenLabs default voices — names match the scripts'
// `voice` field. Add more here as we want options.
const VOICE_IDS = {
  Adam:    'pNInz6obpgDQGcFmaJgB',
  Rachel:  '21m00Tcm4TlvDq8ikWAM',
  Sarah:   'EXAVITQu4vr4xnSDxMaL',
  Drew:    '29vD33N1CtxCmqQRPOHJ',
  Antoni:  'ErXwobaYiN019PkySvjV',
  Brian:   'nPczCjzI2devNBz1zQrb',
  Bill:    'pqHfZKP75CvOlQylNhV4',
  Domi:    'AZnzlk1XvdvUeBnXmlld',
  Charlie: 'IKne3meq5aSn9XLyUdCD',
}

const MODEL = 'eleven_flash_v2_5'   // fast, natural; lower latency than v3
const OUT_ROOT = path.join(__dirname, '..', 'public', 'audio', 'walkthroughs')

// We use a tiny shim to load the ESM walkthroughScripts file from CJS.
// The file only exports a plain object, so a regex-extracted require
// would also work — but dynamic import keeps it honest if the schema
// grows.
async function loadScripts() {
  const url = 'file://' + path.join(__dirname, '..', 'src', 'lib', 'walkthroughScripts.js').replace(/\\/g, '/')
  const mod = await import(url)
  return mod.WALKTHROUGH_SCRIPTS
}

function postElevenLabs({ voiceId, text }) {
  const body = JSON.stringify({
    text,
    model_id: MODEL,
    voice_settings: {
      stability:        0.55,   // a touch of expressiveness
      similarity_boost: 0.80,
      style:            0.30,
      use_speaker_boost: true,
    },
  })
  return new Promise((resolve, reject) => {
    const req = https.request({
      method:   'POST',
      hostname: 'api.elevenlabs.io',
      path:     `/v1/text-to-speech/${voiceId}`,
      headers: {
        'xi-api-key':   KEY,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const msg = Buffer.concat(chunks).toString('utf8')
          return reject(new Error(`HTTP ${res.statusCode}: ${msg.slice(0, 200)}`))
        }
        resolve(Buffer.concat(chunks))
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

;(async () => {
  const scripts = await loadScripts()
  fs.mkdirSync(OUT_ROOT, { recursive: true })

  let generated = 0, skipped = 0, failed = 0
  const manifest = {}

  for (const [id, def] of Object.entries(scripts)) {
    if (ONLY && id !== ONLY) continue
    const voiceId = VOICE_IDS[def.voice] || VOICE_IDS.Adam
    if (!VOICE_IDS[def.voice]) {
      console.warn(`  [${id}] voice "${def.voice}" not in VOICE_IDS — using Adam`)
    }
    const outDir = path.join(OUT_ROOT, id)
    fs.mkdirSync(outDir, { recursive: true })
    manifest[id] = { voice: def.voice, voiceId, lines: [] }

    console.log(`\n${id} (voice=${def.voice}):`)
    for (const [sceneKey, text] of Object.entries(def.lines)) {
      const outPath = path.join(outDir, `${sceneKey}.mp3`)
      manifest[id].lines.push(sceneKey)
      if (!FORCE && fs.existsSync(outPath)) {
        console.log(`  ↷ ${sceneKey} (cached)`)
        skipped++
        continue
      }
      try {
        process.stdout.write(`  • ${sceneKey} ... `)
        const t0 = Date.now()
        const buf = await postElevenLabs({ voiceId, text })
        fs.writeFileSync(outPath, buf)
        console.log(`${buf.length} bytes in ${Date.now() - t0}ms`)
        generated++
      } catch (err) {
        console.log(`FAILED: ${err.message}`)
        failed++
      }
    }
  }

  fs.writeFileSync(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n✅ Done. Generated ${generated}, skipped ${skipped}, failed ${failed}.`)
  console.log(`   MP3s under public/audio/walkthroughs/`)
})().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
