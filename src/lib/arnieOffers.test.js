import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const strip = (src) => src.split('\n')
  .filter((l) => {
    const x = l.trim()
    return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') && !x.startsWith('--')
  }).join('\n')

const railSrc = read('../../supabase/functions/arnie-computer/index.ts')
const rail = strip(railSrc)
const chat = strip(read('../../supabase/functions/arnie-chat/index.ts'))
const agent = strip(read('../../scripts/jobscout-agent.mjs'))
const client = strip(read('./arnieComputer.js'))
const card = strip(read('../components/ArnieOfferCard.jsx'))
const engine = strip(read('../pages/agents/arnie/arnieEngine.js'))
const migration = strip(read('../../supabase/migrations/20261012071000_computer_offers.sql'))

// Everything behind this feature was built, tested, and then unreachable,
// because nothing ever queued an action: Arnie's brain did not know a computer
// existed, and the only way to grant a permission was a form nobody could
// answer cold. These are the properties that closed that loop — each one, if
// it quietly stopped holding, puts the feature back in the drawer.

describe('Arnie can actually ask', () => {
  it('he has exactly one way to reach a computer', () => {
    expect(chat).toMatch(/name: 'use_my_computer'/)
    // Through the rail, as the person — not by writing to the tables himself.
    expect(chat).toMatch(/functions\/v1\/arnie-computer/)
    expect(chat).toMatch(/action: 'queue'/)
    expect(chat).not.toMatch(/arnie_computer_actions', \{\s*method: 'POST'/)
  })

  it('and he is told one exists, or told plainly that one does not', () => {
    expect(chat).toMatch(/async function computerBlock\(/)
    expect(chat).toMatch(/\+ await computerBlock\(companyId, caller\.employeeId\)/)
    expect(chat).toMatch(/NO computer connected/)
  })

  it('a routine or a text message cannot reach for somebody’s desk', () => {
    // No real session, no tool. A routine may ask a PERSON for something; it
    // must not assume they are sitting at a machine.
    expect(chat).toMatch(/if \(opts\.ownSession\) offered\.push\(USE_COMPUTER_TOOL\)/)
    expect(chat).toMatch(/toolsFor\(caller\.role, cards, \{ ownSession: !!bearer \}\)/)
    expect(chat).toMatch(/const ownToken = bearer && bearer !== SUPABASE_SERVICE_ROLE_KEY \? bearer : ''/)
    expect(chat).toMatch(/if \(!bearer \|\| !employeeId\)/)
  })

  it('he never supplies a session id — the server finds the person’s own', () => {
    expect(chat).toMatch(/arnie_computer_sessions\?select=id,device_label,status,last_seen_at&employee_id=eq\./)
    const schema = chat.slice(chat.indexOf("name: 'use_my_computer'"), chat.indexOf('const CARD_TOOLS'))
    expect(schema).not.toMatch(/session_id/)
  })

  it('the tool only exists for a client that can draw the card', () => {
    // propose_bulk_change once shipped to the server before its card did, and
    // the whole message list threw mid-render.
    expect(chat).toMatch(/use_my_computer: 'computer'/)
    expect(engine).toMatch(/RENDERABLE_CARDS = \['config', 'record', 'bulk', 'create', 'computer'\]/)
    expect(engine).toMatch(/currentEvent === 'offer'/)
  })
})

describe('a missing permission is a question, not a dead end', () => {
  it('the rail records it as its own decision, with the tier it wants', () => {
    expect(rail).toMatch(/'needsGrant' in verdict \? 'needs_grant'/)
    expect(rail).toMatch(/wants_tier: !verdict\.ok && 'needsGrant' in verdict \? verdict\.needsGrant\.tier : null/)
    expect(migration).toMatch(/'needs_approval', 'needs_grant', 'failed', 'expired'/)
    expect(migration).toMatch(/wants_tier text/)
  })

  it('accepting writes the permission and then asks the leash again', () => {
    const block = rail.slice(rail.indexOf("action === 'accept_offer'"), rail.indexOf("action === 'pair_claim'"))
    expect(block).toMatch(/arnie_computer_grants', \{/)
    expect(block).toMatch(/await placeAction\(/)
    // It must NOT simply mark the thing allowed: a tier might still not cover
    // the kind, and a rule might still say ask first.
    expect(block).not.toMatch(/decision: 'queued'/)
  })

  it('and it cannot grant more than the offer asked for', () => {
    const block = rail.slice(rail.indexOf("action === 'accept_offer'"), rail.indexOf("action === 'pair_claim'"))
    expect(block).toMatch(/const tier = String\(offer\.wants_tier \|\| 'watch'\)/)
    expect(block).not.toMatch(/body\.tier/)
    expect(block).not.toMatch(/body\.app/)
    expect(block).not.toMatch(/body\.host/)
  })

  it('only the person it belongs to can accept it, and only while it is live', () => {
    const block = rail.slice(rail.indexOf("action === 'accept_offer'"), rail.indexOf("action === 'pair_claim'"))
    expect(block).toMatch(/employee_id=eq\.\$\{me\}/)
    expect(block).toMatch(/if \(offer\.decision !== 'needs_grant'\)/)
    expect(block).toMatch(/if \(hasExpired\(offer\)\)/)
  })

  it('one place decides, used by queueing and by accepting', () => {
    // A second, shorter copy of this decision is the obvious shortcut and the
    // one thing that must not happen: two copies disagreeing is
    // indistinguishable from a bypass.
    expect(rail.match(/decideWithRules\(/g)?.length).toBe(1)
    expect(rail).toMatch(/const placeAction = async \(/)
  })

  it('the browser can only report that somebody said yes', () => {
    expect(client).toMatch(/call\('accept_offer', \{ action_id, duration \}\)/)
    expect(client).not.toMatch(/decision: 'allowed'/)
    expect(client).not.toMatch(/from\('arnie_computer_grants'\)[\s\S]{0,200}insert/)
    expect(card).toMatch(/acceptOffer\(offer\.id, what\)/)
  })

  it('an offer times out like an approval does', () => {
    expect(rail).toMatch(/'needsApproval' in verdict \|\| 'needsGrant' in verdict/)
    const grants = strip(read('../../supabase/functions/_shared/computerGrants.ts'))
    expect(grants).toMatch(/row\.decision !== 'needs_approval' && row\.decision !== 'needs_grant'/)
  })
})

describe('the machine still has the last word', () => {
  it('the agent treats an offer as a refusal', () => {
    expect(agent).toMatch(/verdict\.needsGrant && verdict\.needsGrant\.why/)
  })

  it('it re-reads permissions ITSELF rather than being handed them', () => {
    // An agent taking its permissions from the same message as its orders
    // would be trusting whoever sent the orders — which is the one thing the
    // local check exists not to do.
    expect(agent).toMatch(/if \(!verdict\.ok && verdict\.needsGrant\) \{[\s\S]{0,200}call\('grants'\)/)
    const next = rail.slice(rail.indexOf("action === 'next'"), rail.indexOf("action === 'report'"))
    expect(next).not.toMatch(/grants/)
  })

  it('a one-shot permission is spent by one action and no other', () => {
    expect(rail).toMatch(/consumed_at: new Date\(\)\.toISOString\(\), consumed_by: made\[0\]\.id/)
    expect(agent).toMatch(/decideAction\(\{ id: a\.id,/)
    expect(migration).toMatch(/add column if not exists consumed_by bigint/)
  })

  it('launching is the one action not checked against what is in front', () => {
    // Because that is what launching IS. Checking it made opening a program
    // impossible, which is most of the way back to having no hands.
    expect(agent).toMatch(/if \(a\.app && a\.kind !== 'launch'\)/)
    expect(agent).toMatch(/case 'launch': return await launchApp\(a\.app\)/)
  })

  it('and a program is opened by name from a fixed list, never a command', () => {
    const hands = strip(read('../../scripts/agent/hands.mjs'))
    expect(hands).toMatch(/const LAUNCHABLE = \{/)
    expect(hands).toMatch(/if \(!known\) \{/)
    // cmd's own start builtin, with the name as an argument — not interpolated.
    expect(hands).toMatch(/run\('cmd\.exe', \['\/c', 'start', '', known\[0\]\]\)/)
    expect(hands).toMatch(/run\('open', \['-a', known\[1\]\]\)/)
  })

  it('and it waits until the program really is in front', () => {
    const hands = strip(read('../../scripts/agent/hands.mjs'))
    expect(hands).toMatch(/was asked to open but is still not in front/)
  })

  it('a Store app is not mistaken for the frame Windows draws round it', () => {
    // Every Store app reports as applicationframehost, which made the
    // frontmost check both useless and unable to tell two of them apart.
    const hands = strip(read('../../scripts/agent/hands.mjs'))
    expect(hands).toMatch(/EnumChildWindows/)
    expect(hands).toMatch(/inner != 0 \? inner : outer/)
  })
})

describe('the badge counts an offer, because it is waiting on you', () => {
  it('all three waiting states', () => {
    const attention = strip(read('./arnieAttention.js'))
    expect(attention).toMatch(/\['awaiting_human', 'needs_approval', 'needs_grant'\]/)
  })

  it('and the list the Computer tab reads drops the ones that timed out', () => {
    expect(client).toMatch(/\.in\('decision', \['needs_grant', 'needs_approval', 'awaiting_human'\]\)/)
    expect(client).toMatch(/new Date\(r\.expires_at\)\.getTime\(\) > now/)
  })
})

describe('one card, two places', () => {
  it('both the conversation and the Computer tab draw the same component', () => {
    expect(read('../pages/agents/arnie/ArnieChat.jsx')).toMatch(/<ArnieOfferCard offerId=\{msg\.offerId\} \/>/)
    expect(read('../pages/agents/arnie/ArnieComputer.jsx')).toMatch(/<ArnieOfferCard key=\{o\.id\} offer=\{o\}/)
  })

  it('and it reads the row, so an answered question cannot be asked twice', () => {
    expect(card).toMatch(/from\('arnie_computer_actions'\)/)
    expect(card).toMatch(/if \(!\['needs_grant', 'needs_approval', 'awaiting_human'\]\.includes\(offer\.decision\)/)
  })

  it('something he will never do gets no allow button at all', () => {
    const block = card.slice(card.indexOf("offer.decision === 'awaiting_human'"))
    expect(block.slice(0, 600)).not.toMatch(/answer\('once'\)|answer\('always'\)/)
    expect(card).toMatch(/This one is yours/)
  })
})
