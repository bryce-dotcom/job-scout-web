// What Arnie can actually do on your computer — and what is in the way.
//
// Bryce, looking at the finished feature: "How does the user know what he can
// even do for them?" Nothing answered that. The Computer tab listed
// permissions and a log, both of which describe a system somebody already
// understands. A person opening it for the first time saw an empty page and a
// form asking which program to allow.
//
// ONE definition, here, because this list appears in more than one place and a
// second copy is how a storefront ends up advertising a feature nobody built —
// which has already happened once on this project.
//
// THE RULE FOR THIS FILE: nothing goes in it that does not work. Not "coming
// soon", not "planned". Each entry names a real capability and says plainly
// what state it is in, so the honest answer to "can he file my SRP job" is
// visible rather than implied.

/** The states, worst first — this order is the order a person has to fix them in. */
export const BLOCKED = 'blocked'      // the platform cannot, and no setting changes it
export const NEEDS_AGENT = 'agent'    // no computer connected
export const NEEDS_TEACHING = 'teach' // he can do the parts, nobody has shown him the job
export const READY = 'ready'

/**
 * What he can do, given what is actually set up.
 *
 * @param {object} ctx
 * @param {boolean} ctx.connected   is an agent checking in right now
 * @param {string}  ctx.platform    'win32' | 'darwin' | ''
 * @param {Array}   ctx.grants      live grants for this person
 * @param {Array}   ctx.skills      published skills for this company
 * @param {boolean|null} ctx.canRecord  what the AGENT said about this machine,
 *   null from an agent too old to say. Guessing from the platform was wrong
 *   in the direction that matters: it called teaching Ready on a Mac whose
 *   Screen Recording switch is off, where a demonstration records nothing.
 */
export function whatArnieCanDo({ connected = false, platform = '', grants = [], skills = [], canRecord = null } = {}) {
  const mac = platform === 'darwin'
  const taught = skills.filter((s) => s.steps?.written || s.status === 'published')
  const allowed = (app) => grants.some((g) => String(g.app || '').toLowerCase() === app)

  const base = connected ? READY : NEEDS_AGENT

  return [
    {
      id: 'look',
      title: 'Look at what is on your screen',
      blurb: 'He takes a picture of the program you point him at and tells you what he sees. '
        + 'This is how every job starts — he works from what is really there, not from memory.',
      state: base,
    },
    {
      id: 'work',
      title: 'Click and type in a program you allow',
      blurb: 'A utility portal, a spreadsheet, your email. One program at a time, and only the ones you say yes to. '
        + (allowed('chrome') || allowed('edge') ? 'You have already allowed a browser.' : 'He will ask the first time he needs one.'),
      state: base,
    },
    {
      id: 'open',
      title: 'Open a program for you',
      blurb: 'Chrome, Edge, Excel, Outlook, Word, Notepad, File Explorer. Anything else you open yourself and he carries on from there.',
      state: base,
    },
    {
      id: 'teach',
      title: 'Be shown a job once, and write down the steps',
      blurb: canRecord === false
        ? 'This computer cannot watch the screen yet, so a demonstration would record nothing. '
          + (mac ? 'macOS needs Screen Recording and Input Monitoring switched on in System Settings — switches only you can flip.' : '')
        : 'Do the job once with the recorder on. He writes the steps in plain English and you correct what he misunderstood before it is ever used on a real customer.',
      // Not READY when the machine has said it cannot watch a screen. The old
      // version guessed from the platform and called this Ready on a Mac with
      // the switches off, which is the one wrong answer that costs somebody
      // ten minutes of demonstrating to an empty recording.
      state: !connected ? NEEDS_AGENT : canRecord === false ? BLOCKED : READY,
    },
    {
      id: 'repeat',
      title: taught.length
        ? `Do a job you have shown him (${taught.length} so far)`
        : 'Do a job you have shown him',
      blurb: taught.length
        ? `He follows the steps as written and looks at the screen between them: ${taught.slice(0, 3).map((s) => s.name).join(', ')}${taught.length > 3 ? '…' : ''}.`
        : 'Nothing yet. Show him one job — filing a finished rebate is the usual first one — and it becomes something he can do.',
      // Shown-him-a-job depends on having been able to record one, so a
      // machine that cannot watch a screen cannot get here either.
      state: !connected ? NEEDS_AGENT
        : taught.length ? READY
          : canRecord === false ? BLOCKED
            : NEEDS_TEACHING,
    },
  ]
}

/**
 * What he will NEVER do, however it is set up.
 *
 * On the page beside the capabilities, not buried in a tooltip. It is the part
 * people actually want to know before they install anything, and saying it
 * plainly is cheaper than being asked.
 */
export const NEVER = [
  'Type a password, a card number or a code from your phone. He stops at the box and you type it — then he carries on in the session you opened.',
  'Press Submit, Send, Pay, Delete or anything else that cannot be taken back. He fills the form and hands it to you.',
  'Touch a program you have not allowed, or a site other than the one you named.',
  'Work on anybody else’s computer, or use anybody else’s login. Your machine, your sessions, your permissions.',
]

/** Plain words for a state, and whether it is the person's move. */
export function stateLabel(state) {
  switch (state) {
    case READY: return { label: 'Ready', yours: false }
    case NEEDS_AGENT: return { label: 'Needs a computer connected', yours: true }
    case NEEDS_TEACHING: return { label: 'Needs showing once', yours: true }
    case BLOCKED: return { label: 'Not on this computer', yours: false }
    default: return { label: '', yours: false }
  }
}
