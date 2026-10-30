import { describe, it, expect } from 'vitest'
import { clockInChoice as libChoice, mustClockToJob as libMust, overheadCodeList as libCodes } from './clockInJob'
import {
  clockInChoice as edgeChoice,
  mustClockToJob as edgeMust,
  overheadCodeList as edgeCodes,
} from '../../supabase/functions/_shared/clockInRule.ts'

// src/lib/clockInJob.js and supabase/functions/_shared/clockInRule.ts are the
// same rule written twice — the Field Scout button reads one, Arnie's
// "clock me in" card reads the other. Both files say "change both or
// neither", and until now nothing checked. A field tech who cannot get a
// general punch from the button must not be able to get one from the chat.
//
// This runs the real cases through both copies and compares, rather than
// diffing the source text, so a difference that matters fails and a
// difference in wording does not.

const tech = { role: 'Field Tech', skill_level: 'First Class' }
const office = { role: 'Office', skill_level: null }
const pmOnBonus = { role: 'Project Manager', skill_level: 'Eagle' }
const pmOffBonus = { role: 'Project Manager', skill_level: 'Not on bonus' }
const shopHand = { role: 'Shop Hand', skill_level: null }
const levels = [{ name: 'First Class', weight: 3 }, { name: 'Eagle', weight: 4 }, { name: 'Not on bonus', weight: 0 }]

const noCodes = { skillLevels: levels }
const withCodes = { skillLevels: levels, overheadCodes: ['Shop', 'Training', 'Crew Meeting'] }
const companySays = { skillLevels: levels, overheadRoles: ['Shop Hand'], jobRoles: ['Project Manager'] }

const CASES = [
  ['a job, for a tech', { jobId: 23522, employee: tech, settings: noCodes }],
  ['a job as a string', { jobId: '23522', employee: office, settings: noCodes }],
  ['a tech with no job and no codes', { jobId: '', employee: tech, settings: noCodes }],
  ['a tech with no job, codes defined', { jobId: '', employee: tech, settings: withCodes }],
  ['a tech on a defined code', { code: 'Shop', employee: tech, settings: withCodes }],
  ['loose spelling of a code', { code: '  cREW meeting ', employee: tech, settings: withCodes }],
  ['a code nobody defined', { code: 'Sick Day', employee: tech, settings: withCodes }],
  ['a code when none are set up', { code: 'Shop', employee: tech, settings: noCodes }],
  ['a job beats a code', { jobId: 7, code: 'Shop', employee: tech, settings: withCodes }],
  ['office, no job', { employee: office, settings: withCodes }],
  ['a PM on the bonus', { jobId: '', employee: pmOnBonus, settings: noCodes }],
  ['a PM off the bonus', { employee: pmOffBonus, settings: noCodes }],
  ['a title the company called overhead', { employee: shopHand, settings: companySays }],
  ['a title the company forced onto jobs', { jobId: '', employee: pmOffBonus, settings: companySays }],
  ['a bad job id', { jobId: 'abc', employee: tech, settings: withCodes }],
  ['no employee at all', { jobId: '', employee: null, settings: withCodes }],
]

describe('the clock-in rule and its edge mirror agree', () => {
  for (const [name, input] of CASES) {
    it(name, () => {
      expect(edgeChoice(input), name).toEqual(libChoice(input))
    })
  }

  it('agree on who must charge a job', () => {
    for (const e of [tech, office, pmOnBonus, pmOffBonus, shopHand, null]) {
      for (const s of [noCodes, withCodes, companySays]) {
        expect(edgeMust(e, s), JSON.stringify([e, s])).toBe(libMust(e, s))
      }
    }
  })

  it('agree on the code list, including the { name } shape', () => {
    for (const s of [
      {},
      { overheadCodes: [] },
      { overheadCodes: ['Shop', { name: 'Training' }, 'shop', '', null, '   '] },
      { overheadCodes: [{ name: ' Crew Meeting ' }, 'Travel'] },
    ]) {
      expect(edgeCodes(s), JSON.stringify(s)).toEqual(libCodes(s))
    }
  })
})
