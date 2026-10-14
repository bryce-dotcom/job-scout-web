import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStopCommand } from './bargeIn'

const here = dirname(fileURLToPath(import.meta.url))
const chat = readFileSync(resolve(here, '../pages/agents/arnie/ArnieChat.jsx'), 'utf8').replace(/\r\n/g, '\n')

describe('"stop", said while she talks', () => {
  it('the ways people actually say it', () => {
    for (const s of ['stop', 'Stop.', 'Jenny stop', 'okay stop', 'stop talking', 'hold on', 'wait',
      'be quiet', 'shut up', 'hey Jenny, hold on a sec', 'stop stop stop', 'enough', 'never mind']) {
      expect(isStopCommand(s, 'Jenny JobScouter'), s).toBe(true)
    }
  })
  it('her own sentences coming back through the speaker are not commands', () => {
    for (const s of [
      'please stop by the warehouse before ten',
      'the job is on hold until the parts arrive',
      'wait for the utility to approve the incentive',
      'you have three estimates waiting',
      'stop by the office tomorrow',
      'Jenny',
      '',
    ]) expect(isStopCommand(s, 'Jenny JobScouter'), s).toBe(false)
  })
  it('a renamed assistant can be stopped by name', () => {
    expect(isStopCommand('Sadie stop', 'Sadie')).toBe(true)
  })
})

describe('the mic stays on while she talks, for that and nothing else', () => {
  it('what it hears while she talks is checked for stop first, and never kept', () => {
    const onresult = chat.slice(chat.indexOf('recognition.onresult'), chat.indexOf('// ── Takeoff mode'))
    expect(onresult).toMatch(/if \(micStateRef\.current === 'bargein'\)/)
    expect(onresult).toMatch(/handleStopSpeaking\(\)/)
    // transcriptRef is only written AFTER the barge-in branch returns.
    expect(onresult.indexOf("micStateRef.current === 'bargein'")).toBeLessThan(onresult.indexOf('transcriptRef.current = full'))
  })
  it('every way into "she is about to talk" uses the same rule', () => {
    expect((chat.match(/micStateRef\.current = micWhileTalking\(\)/g) || []).length).toBe(4)
    expect(chat).not.toMatch(/micStateRef\.current = 'paused'/)
  })
  it('the mic is not handed back between sentences', () => {
    const drain = chat.slice(chat.indexOf('const drainSpeech'), chat.indexOf('const speakAsItArrives'))
    expect(drain).toMatch(/if \(streamDoneRef\.current\) \{\s*setSpeaking\(false\)\s*resumeMic\(\)/)
  })
})
