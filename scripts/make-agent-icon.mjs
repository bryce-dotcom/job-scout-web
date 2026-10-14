// The agent's face, for the Windows taskbar.
//
// Bryce, looking at his taskbar: Chrome, the Scout, and a generic PowerShell
// square — "can we wrap the powershell with the arnie or jennie face?". The
// window title has said "JobScout Agent" all along, but a .cmd runs inside the
// Windows console host and borrows ITS icon, and nothing a batch file can do
// changes that. The compiled executable is the only thing that can carry one,
// which `deno compile --icon` embeds.
//
// So this turns the artwork we already ship into a real multi-size .ico. ICO
// has allowed PNG-compressed entries since Vista, which is what every size
// here is — no BMP masks, no palettes.
//
//   node scripts/make-agent-icon.mjs            → from og-arnie.png
//   node scripts/make-agent-icon.mjs jenny      → from jenny-jobscouter.jpg
//
// Writes scripts/agent/jobscout-agent.ico, which build-agent-release passes
// to deno compile. Regenerate it when the artwork changes; it is committed so
// a release never depends on this having been run.

import sharp from 'sharp'
import { writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const which = (process.argv[2] || 'arnie').toLowerCase()
const SOURCE = {
  arnie: 'public/og-arnie.png',
  jenny: 'public/jenny-jobscouter.jpg',
}
const src = resolve(root, SOURCE[which] || SOURCE.arnie)
if (!existsSync(src)) {
  console.error(`No artwork at ${src}`)
  process.exit(1)
}
const out = resolve(root, 'scripts/agent/jobscout-agent.ico')

// Every size Windows actually asks for: 16 in the title bar, 32 on the
// taskbar, 48 in Explorer, 256 for the large view and Alt-Tab.
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const pngs = []
for (const size of SIZES) {
  pngs.push(await sharp(src)
    // `cover` rather than a stretch: these are photographs, and a squashed
    // face is worse than a cropped one.
    .resize(size, size, { fit: 'cover', position: 'attention' })
    // RGBA, always. sharp drops the alpha channel on an opaque source to save
    // bytes, and deno compile --icon refuses such a PNG outright: 'The PNG is
    // not in RGBA format'. Found by compiling, not by reading.
    .ensureAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer())
}

// ICONDIR: reserved, type 1 (icon), count.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(SIZES.length, 4)

const entries = []
// The image data starts after the directory, so the first offset is the
// header plus one 16-byte entry per size.
let offset = 6 + SIZES.length * 16
SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16)
  // 256 is written as 0 — the field is one byte, so 256 does not fit.
  e.writeUInt8(size === 256 ? 0 : size, 0)
  e.writeUInt8(size === 256 ? 0 : size, 1)
  e.writeUInt8(0, 2)            // colours in palette: 0 for a PNG entry
  e.writeUInt8(0, 3)            // reserved
  e.writeUInt16LE(1, 4)         // colour planes
  e.writeUInt16LE(32, 6)        // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  entries.push(e)
})

writeFileSync(out, Buffer.concat([header, ...entries, ...pngs]))
console.log(`${out} — ${SIZES.join(', ')}px from ${SOURCE[which] || SOURCE.arnie}`)
