import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const teach = read('../../supabase/functions/arnie-teach/index.ts')
const rail = read('../../supabase/functions/arnie-computer/index.ts')
const obsMig = read('../../supabase/migrations/20261011093000_arnie_teach_observations.sql')
const bucketMig = read('../../supabase/migrations/20261011101500_arnie_recordings_bucket.sql')
const recorder = read('../../scripts/agent/recorder.ps1')
const agent = read('../../scripts/jobscout-agent.mjs')
const hands = read('../../scripts/agent/hands.mjs')
const skills = read('../pages/agents/arnie/ArnieSkills.jsx')

const code = (src) => src.split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('#') && !l.trim().startsWith('--') && !l.trim().startsWith('*'))
  .join('\n')

describe('a demonstration never captures what was typed', () => {
  it('the recorder counts characters and emits only a count', () => {
    expect(recorder).toMatch(/Emit 'type' @\{ text_length = \$script:typed \}/)
    // the counter is incremented, never the character appended
    expect(recorder).toMatch(/\$script:typed\+\+/)
    expect(code(recorder)).not.toMatch(/\$typedText|\+= \$char|\[char\]\$vk/)
  })

  it('the table has nowhere to put the text', () => {
    const cols = code(obsMig).match(/create table if not exists public\.arnie_skill_observations \(([\s\S]*?)\n\);/)[1]
    expect(cols).toMatch(/text_length\s+integer/)
    expect(cols).not.toMatch(/\btyped_text\b|\bvalue\b|\bcontent\b|\bkeystrokes\b/)
  })

  it('the rail takes a length and never a value', () => {
    const observe = rail.slice(rail.indexOf("action === 'observe'"), rail.indexOf("action === 'teach_stop'"))
    expect(observe).toMatch(/text_length: Number\.isFinite/)
    expect(observe).not.toMatch(/o\.value|o\.text\b/)
  })

  it('and Arnie is told he is not given them, so he asks where a value comes from', () => {
    expect(teach).toMatch(/NEVER given the characters themselves/)
    expect(teach).toMatch(/say what the value should come FROM/)
  })
})

describe('nothing is recorded while Arnie waits on a sign-in', () => {
  it('the rail says to hold whenever a handoff is open', () => {
    expect(rail).toMatch(/decision=eq\.awaiting_human&completed_at=is\.null/)
    expect(rail).toMatch(/hold_recorder: !!handoff/)
  })

  it('the agent passes that straight to the recorder', () => {
    expect(agent).toMatch(/holdRecorder\(!!got\.hold_recorder\)/)
  })

  it('and the recorder really stops looking, rather than just flagging it', () => {
    expect(recorder).toMatch(/if \(\$paused\) \{ Start-Sleep -Milliseconds 120; continue \}/)
    // the pause is logged so the gap is visible in the transcript, not silent
    expect(recorder).toMatch(/Emit 'paused'/)
    expect(teach).toMatch(/RECORDING PAUSED/)
  })
})

describe('control is a file and output is flushed — both are scars', () => {
  it('the recorder is driven by a control file, not stdin', () => {
    expect(recorder).toMatch(/\[Parameter\(Mandatory = \$true\)\]\[string\]\$ControlFile/)
    expect(code(recorder)).not.toMatch(/\[Console\]::In\.Peek|\[Console\]::In\.ReadLine/)
    expect(code(agent)).not.toMatch(/stdin\.write/)
  })

  it('and every line is flushed by hand', () => {
    expect(recorder).toMatch(/\[Console\]::Out\.Flush\(\)/)
    expect(code(recorder)).not.toMatch(/Write-Output \(\$o \| ConvertTo-Json/)
  })
})

describe('the recording cannot run away', () => {
  it('ten minutes, enforced server-side', () => {
    expect(rail).toMatch(/const TEACH_MAX_SECONDS = 600/)
    expect(rail).toMatch(/if \(left <= 0\)/)
  })

  it('running out turns it into a draft rather than losing it', () => {
    const block = rail.slice(rail.indexOf('const TEACH_MAX_SECONDS'), rail.length)
    expect(block).toMatch(/status: 'draft'[\s\S]*?recording/)
  })

  it('only one recording per person — two would interleave into both', () => {
    expect(read('../../supabase/migrations/20261010213000_arnie_skills_rules_expiry.sql'))
      .toMatch(/arnie_skills_one_recording_idx/)
  })
})

describe('what comes back is a draft, and only a person publishes it', () => {
  it('arnie-teach writes draft, never published', () => {
    expect(teach).toMatch(/status: 'draft'/)
    expect(code(teach)).not.toMatch(/status: 'published'/)
  })

  it('it is told not to pad a thin recording', () => {
    expect(teach).toMatch(/Do not invent steps you did not see/)
    expect(teach).toMatch(/too thin to be useful/)
  })

  it('it asks for what one run could not show', () => {
    expect(teach).toMatch(/What I am not sure about/)
    expect(teach).toMatch(/which parts vary by customer/)
  })

  it('the screen keeps the uncertainty above the steps', () => {
    expect(skills).toMatch(/What Arnie is not sure about/)
    expect(skills.indexOf('What Arnie is not sure about')).toBeLessThan(skills.indexOf('The steps'))
  })

  it('publishing needs the changes saved first, so a half-edited draft cannot go live', () => {
    expect(skills).toMatch(/r\.status === 'draft' && !dirty/)
    expect(skills).toMatch(/Save first, then put it to work/)
  })
})

describe('a recording is somebody’s screen', () => {
  it('the bucket is private and gains no public read', () => {
    expect(bucketMig).toMatch(/values \('arnie-recordings', 'arnie-recordings', false/)
    expect(bucketMig).toMatch(/set public = false/)
    expect(code(bucketMig)).not.toMatch(/public read|anon/i)
  })

  it('writes and reads are scoped to your own recording by path', () => {
    for (const p of ['insert', 'read', 'update', 'delete']) {
      expect(bucketMig).toMatch(new RegExp(`arnie_recordings_${p}_own`))
    }
    expect(bucketMig).toMatch(/split_part\(object_name, '\/', 1\)/)
  })

  it('identity is the JWT email, because this app has no employees.user_id', () => {
    // auth.uid() would have matched nothing and denied everybody — which is
    // exactly how the missing policy was found.
    expect(bucketMig).toMatch(/request\.jwt\.claims.*->> 'email'/)
    expect(code(bucketMig)).not.toMatch(/auth\.uid\(\)/)
    expect(bucketMig).toMatch(/e\.active = true/)
  })

  it('Arnie reads them server-side through a short-lived signed URL', () => {
    expect(teach).toMatch(/storage\/v1\/object\/sign\/arnie-recordings/)
    expect(teach).toMatch(/expiresIn: 300/)
  })

  it('and only your own skill can be written up', () => {
    expect(teach).toMatch(/id=eq\.\$\{skillId\}&employee_id=eq\.\$\{caller\.employeeId\}/)
    expect(teach).toMatch(/resolveCaller/)
  })
})

describe('the agent says what this platform cannot do', () => {
  it('recording is Windows-only and admits it rather than recording nothing', () => {
    expect(hands).toMatch(/record: WIN/)
    expect(hands).toMatch(/Teaching by demonstration is Windows-only/)
    expect(agent).toMatch(/a recording is running but this platform cannot watch a screen yet/)
  })

  it('macOS gets a usable sentence, not an osascript error number', () => {
    expect(hands).toMatch(/Privacy & Security → Accessibility/)
    expect(hands).toMatch(/Screen Recording/)
  })

  it('a key name that is not on the list never reaches a shell, on either platform', () => {
    expect(hands).toMatch(/const KEYS_WIN = \{/)
    expect(hands).toMatch(/const KEYS_MAC = \{/)
    expect(hands).toMatch(/not a key this agent will press/)
  })

  it('text to type travels by file on both platforms, never on a command line', () => {
    const typeFn = hands.slice(hands.indexOf('export async function typeText'), hands.indexOf('const KEYS_WIN'))
    expect(typeFn).toMatch(/writeFileSync\(path, s/)
    expect(typeFn).toMatch(/ReadAllText/)
    expect(typeFn).toMatch(/read \(POSIX file/)
  })
})
