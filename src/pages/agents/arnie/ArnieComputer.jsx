// Arnie → Computer. The surface for the hands.
//
// Four things, in the order they matter: is Arnie on a computer, what may he
// touch, what has he done, and stop him. The kill switch is on screen at all
// times and never behind a menu — a person who wants to stop an agent should
// not have to go looking.
//
// Grok's principle here is "delegation over operation": the agent's computer is
// its workspace, not a surface that invites constant supervision. Ours goes
// further, because it is the person's OWN machine — they can already see it.
// So there is no remote screen here. What there is instead is a record: the
// last thing he looked at, and every action with its verdict.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import {
  Monitor, ShieldCheck, Ban, Eye, MousePointerClick, Keyboard, Plus, Trash2,
  AlertTriangle, Power, GraduationCap, RefreshCw, Download, Sparkles,
} from 'lucide-react'
import { myComputer, myGrants, myOffers, grant as addGrant, revoke as dropGrant, stop as stopSession } from '../../../lib/arnieComputer'
import ArnieOfferCard from '../../../components/ArnieOfferCard'
import MachinePanel from './MachinePanel'
import { useRelease, agentIsStale, releaseBase } from '../../../lib/agentRelease'
import { whatArnieCanDo, stateLabel, NEVER, READY } from '../../../lib/arnieCanDo'
import { computerState, describeAction } from '../../../lib/agentStatus'
import { useAssistant } from '../../../components/AssistantAvatar'
import { assistantShortName } from '../../../lib/arniePersonaClient'

const t = {
  bg: '#f7f5ef', card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52',
  muted: '#7d8a7f', line: '#d6cdb8', accent: '#5a6349', accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.10)', add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)',
  rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)', amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)',
}

const TIERS = [
  { id: 'watch', label: 'Watch only', icon: Eye, blurb: 'He can look at it. Nothing else.' },
  { id: 'click', label: 'Click, never type', icon: MousePointerClick, blurb: 'For anything where a stray keystroke would be worse than a click — a terminal, an editor.' },
  { id: 'full', label: 'Full', icon: Keyboard, blurb: 'Look, click and type. Still never a password, and never an irreversible button.' },
]

// Every decision the database can hold. A missing key here falls through to
// 'failed', which is how an action merely WAITING on somebody read "Failed" in
// the log — found by looking at the rendered page, not by reading the code.
const DECISION = {
  allowed: { c: t.add, bg: t.addBg, label: 'Done' },
  queued: { c: '#1d4ed8', bg: 'rgba(59,130,246,0.10)', label: 'Waiting on the agent' },
  refused: { c: t.rm, bg: t.rmBg, label: 'Refused' },
  awaiting_human: { c: t.amber, bg: t.amberBg, label: 'Needs you' },
  needs_approval: { c: t.amber, bg: t.amberBg, label: 'Asking you' },
  // Same trap as above, caught the same way — by reading the rendered page.
  // An offer nobody has answered yet was listed as "Failed", which is both
  // wrong and discouraging: the one thing a person must not believe about an
  // offer is that it already went badly.
  needs_grant: { c: t.amber, bg: t.amberBg, label: 'Asking to use a program' },
  expired: { c: t.muted, bg: 'rgba(125,138,127,0.10)', label: 'Lapsed' },
  failed: { c: t.muted, bg: 'rgba(125,138,127,0.10)', label: 'Failed' },
}

const ago = (iso) => {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function ArnieComputer() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  // This page said "Arnie" and "him" to people whose assistant is Jenny.
  const assistant = useAssistant()
  const who = assistantShortName({ personaRow: assistant.personaRow })
  // user.id IS the employees row id in this app — the same thing every other
  // Arnie page uses as employee_id.
  const employeeId = user?.id || null

  const [data, setData] = useState({ session: null, latest: null, actions: [] })
  const [grants, setGrants] = useState([])
  const [offers, setOffers] = useState([])
  const [skills, setSkills] = useState([])
  const release = useRelease()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showConnect, setShowConnect] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ app: '', host: '', tier: 'watch' })

  const load = useCallback(async () => {
    if (!employeeId) return
    try {
      const [c, g, o, k] = await Promise.all([
        myComputer(employeeId), myGrants(employeeId), myOffers(employeeId),
        supabase.from('arnie_skills').select('name,status,steps').eq('company_id', companyId).eq('status', 'published')
          .then((r) => r.data || [], () => []),
      ])
      setData(c); setGrants(g); setOffers(o); setSkills(k); setErr('')
    } catch (e) { setErr(String(e.message || e)) }
  }, [employeeId, companyId])

  useEffect(() => { load() }, [load])
  // While he is working, the log is the only way to follow along, so it has to
  // keep up. Idle sessions do not need a poll every three seconds.
  useEffect(() => {
    const live = data.session?.status === 'live'
    const id = setInterval(load, live ? 4000 : 20000)
    return () => clearInterval(id)
  }, [load, data.session?.status])

  const status = useMemo(() => computerState({ session: data.session, latest: data.latest, actions: data.actions }), [data])
  // 'idle' means both "no computer at all" and "connected, nothing happening",
  // so what is CONNECTED has to be read from the session itself. Stale counts
  // as not connected: a session whose agent stopped checking in cannot do
  // anything, and saying "ready" about it would be a lie.
  const connected = data.session?.status === 'live' &&
    Date.now() - new Date(data.session.last_seen_at || 0).getTime() < 90_000


  const doStop = async () => {
    if (!data.session) return
    if (!window.confirm(`Stop ${who} on this computer? Anything waiting to be done will be refused, and the agent has to be started again from the machine.`)) return
    setBusy(true)
    try { await stopSession(data.session.id); await load() }
    catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  const saveGrant = async () => {
    const app = draft.app.trim().toLowerCase()
    if (!app) { setErr('Which program?'); return }
    setBusy(true); setErr('')
    try {
      await addGrant({ app, host: draft.host.trim().toLowerCase() || '*', tier: draft.tier })
      setDraft({ app: '', host: '', tier: 'watch' }); setAdding(false); await load()
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  const removeGrant = async (g) => {
    setBusy(true)
    try { await dropGrant({ app: g.app, host: g.host }); await load() }
    catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px' }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Monitor size={20} style={{ color: t.accent }} /> Arnie on your computer
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>
          Only the programs you have allowed here can be touched, a password is never typed,
          and nothing that cannot be taken back is ever clicked. It is all listed below.
        </p>
      </header>

      {err && (
        <div style={{ background: t.rmBg, border: `1px solid ${t.rm}33`, color: t.rm, borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      {/* ── 1. The machine ───────────────────────────────────────────── */}
      <MachinePanel
        who={who}
        outOfDate={agentIsStale(data.session, release)}
        session={data.session}
        status={status}
        connected={connected}
        busy={busy}
        onRefresh={load}
        onStop={doStop}
        onGetAgent={() => setShowConnect((v) => !v)}
      />

      {(showConnect || !data.session) && (
        <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: '4px 16px 16px', marginBottom: 14 }}>
          <GetTheAgent />
        </section>
      )}

      {/* ── 1b. Waiting on you ───────────────────────────────────────── */}
      {/* Above the permission list on purpose. A question he has actually
          asked beats a form for questions he has not: the list below is for
          taking something back, not for granting things in advance. */}
      {offers.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: t.ink }}>
            Waiting on you
          </h3>
          {offers.map((o) => (
            <ArnieOfferCard key={o.id} offer={o} onAnswered={load} />
          ))}
        </section>
      )}

      {/* ── 2. What he may touch ─────────────────────────────────────── */}
      {/* An empty permission list and an empty log under an empty machine is
          three cards saying nothing, on the page somebody lands on before
          they have anything at all. They appear when there is something to
          put in them. */}
      {(connected || grants.length > 0) && (
      <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={17} style={{ color: t.accent }} /> What Arnie may touch
          </h3>
          <button onClick={() => setAdding((v) => !v)} style={btn(t.card2, t.sub)}>
            <Plus size={14} /> Allow a program
          </button>
        </div>

        {!grants.length && !adding && (
          <p style={{ margin: 0, fontSize: 13, color: t.muted }}>
            Nothing yet — so Arnie can do nothing at all on your computer. Allow one program to start.
          </p>
        )}

        {grants.map((g) => {
          const tier = TIERS.find((x) => x.id === g.tier) || TIERS[0]
          const Icon = tier.icon
          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
              borderTop: `1px solid ${t.line}55`,
            }}>
              <Icon size={16} style={{ color: t.accent, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: t.ink, fontWeight: 600 }}>
                  {g.app}{g.host && g.host !== '*' ? <span style={{ color: t.sub, fontWeight: 400 }}> on {g.host}</span> : ''}
                </div>
                <div style={{ fontSize: 12, color: t.muted }}>
                  {tier.label}{g.duration === 'once' ? ' · once only' : ''} · allowed {ago(g.granted_at)}
                </div>
              </div>
              <button onClick={() => removeGrant(g)} disabled={busy} title="Revoke" style={btn(t.rmBg, t.rm)}>
                <Trash2 size={14} /> Revoke
              </button>
            </div>
          )
        })}

        {adding && (
          <div style={{ borderTop: `1px solid ${t.line}`, marginTop: 10, paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input
                value={draft.app} onChange={(e) => setDraft({ ...draft, app: e.target.value })}
                placeholder="Program (chrome, excel, outlook)"
                style={input} />
              <input
                value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                placeholder="Site, if it is a browser (optional)"
                style={input} />
            </div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              {TIERS.map((x) => {
                const Icon = x.icon
                const on = draft.tier === x.id
                return (
                  <label key={x.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                    background: on ? t.accentBg : t.card2, border: `1px solid ${on ? t.accent : t.line}`,
                    borderRadius: 9, padding: '9px 11px',
                  }}>
                    <input type="radio" name="tier" checked={on} onChange={() => setDraft({ ...draft, tier: x.id })} style={{ marginTop: 3 }} />
                    <Icon size={16} style={{ color: t.accent, flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{x.label}</div>
                      <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.45 }}>{x.blurb}</div>
                    </div>
                  </label>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: t.sub, marginBottom: 10, lineHeight: 1.5 }}>
              For a browser, name the site as well. “Chrome” on its own means every page you have open,
              which is almost never what anyone means.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveGrant} disabled={busy} style={btn(t.accent, '#fff')}>Allow it</button>
              <button onClick={() => { setAdding(false); setDraft({ app: '', host: '', tier: 'watch' }) }} style={btn(t.card2, t.sub)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
      )}

      {/* ── 2b. What he can do, and what is in the way ───────────────── */}
      {/* "How does the user know what he can even do for them?" — nothing on
          this page answered that. A permission list and a log describe a
          system to somebody who already understands it. */}
      <WhatHeCanDo
        who={who}
        connected={connected}
        platform={data.session?.platform || ''}
        grants={grants}
        skills={skills}
        canRecord={data.session?.capabilities ? data.session.capabilities.record : null}
        onConnect={() => setShowConnect(true)}
      />

      {/* ── 3. Teach him something ───────────────────────────────────── */}
      {connected && (
      <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GraduationCap size={17} style={{ color: t.accent }} /> Teach Arnie a task
        </h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: t.sub, lineHeight: 1.55 }}>
          Do a job once with the recorder on and he writes the steps down. You read them back in plain
          English and fix what he misunderstood before it is ever used on a real customer.
        </p>
        <TeachButton employeeId={employeeId} companyId={companyId} session={data.session} onDone={load} />
      </section>
      )}

      {/* ── 4. What he has done ──────────────────────────────────────── */}
      {/* The record is the trust surface: an admin asking "what has he been
          trying to do on Cole's machine" gets a real answer here, refusals
          included. A ledger with a rail, not a stack of equal rows — the
          decision is what you scan, so it leads. */}
      {data.actions.length > 0 && (
      <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: t.ink }}>What Arnie has done</h3>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: t.muted }}>
          Refusals are listed too — if he tried something he was not allowed to do, it is here.
        </p>
        {/* A rail down the left with a dot per entry in the decision's own
            colour. Scanning this is how you answer "has he been refused a
            lot" or "when did he stop" without reading a word. */}
        <div style={{ position: 'relative', paddingLeft: 18, marginTop: 10 }}>
          <span style={{
            position: 'absolute', left: 4, top: 6, bottom: 6, width: 1,
            background: `linear-gradient(to bottom, ${t.line}, ${t.line}00)`,
          }} />
          {data.actions.map((a) => {
            const d = DECISION[a.decision] || DECISION.failed
            return (
              <div key={a.id} style={{ position: 'relative', padding: '8px 0 10px' }}>
                <span style={{
                  position: 'absolute', left: -18, top: 13, width: 9, height: 9, borderRadius: '50%',
                  background: d.c, boxShadow: `0 0 0 3px ${t.card}`,
                }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, color: t.ink, fontWeight: 600 }}>{describeAction(a)}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
                    color: d.c, whiteSpace: 'nowrap',
                  }}>{d.label}</span>
                  <span style={{ fontSize: 11.5, color: t.muted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {ago(a.created_at)}
                  </span>
                </div>
                {a.reason && (
                  <div style={{ fontSize: 12.5, color: t.sub, marginTop: 3, lineHeight: 1.45 }}>{a.reason}</div>
                )}
                {a.target?.text_length !== undefined && (
                  <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3 }}>
                    {a.target.text_length} characters typed — what they were is not recorded
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
      )}
    </div>
  )
}

/**
 * "How does the user know what he can even do for them?"
 *
 * The answer has to be on the page, not in a help article, and it has to be
 * honest about what is in the way — a capability list that reads "ready" when
 * nothing is connected is worse than no list. So each row carries its real
 * state, and the thing the person has to do about it is the only button.
 *
 * What he will never do sits right beside it, because that is the part people
 * want to know before installing anything.
 */
function WhatHeCanDo({ who = 'Arnie', connected, platform, grants, skills, canRecord, onConnect }) {
  const rows = whatArnieCanDo({ connected, platform, grants, skills, canRecord })
  const blocked = rows.filter((r) => r.state !== READY).length

  return (
    <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={17} style={{ color: t.accent }} /> What Arnie can do here
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: t.muted }}>
        {blocked === 0
          ? 'All of it, on this computer.'
          : `${rows.length - blocked} of ${rows.length} ready — the rest need something from you.`}
      </p>

      {rows.map((r) => {
        const s = stateLabel(r.state)
        return (
          <div key={r.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${t.line}55`, alignItems: 'flex-start' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6,
              background: r.state === READY ? t.add : t.amber,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink }}>{r.title}</div>
              <div style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5, marginTop: 2 }}>{r.blurb}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, borderRadius: 11, padding: '2px 8px', marginTop: 2,
              flexShrink: 0, whiteSpace: 'nowrap',
              color: r.state === READY ? t.add : t.amber,
              background: r.state === READY ? t.addBg : t.amberBg,
            }}>{s.label}</span>
          </div>
        )
      })}

      {!connected && (
        <button onClick={onConnect} style={{ ...btn(t.accent, '#fff'), marginTop: 12 }}>
          <Download size={14} /> Put {who} on this computer
        </button>
      )}

      <div style={{ marginTop: 14, borderTop: `1px solid ${t.line}`, paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: 6 }}>
          And what never happens
        </div>
        {NEVER.map((line) => (
          <div key={line} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
            <Ban size={13} style={{ color: t.muted, flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Putting Arnie on a computer.
 *
 * This used to be: reveal a token, copy it, open a terminal, paste it into a
 * command. That is a thing a developer does. Nobody else was ever going to,
 * which meant every other feature on this page was unreachable — "it needs to
 * be easy as hell or people won't use it."
 *
 * Now it is two steps, and they really are a sequence, which is why they are
 * numbered: download one file, open it. The file fetches the agent, the agent
 * opens the browser, and the person presses Connect on a page they are
 * already signed in to. Nothing is typed.
 *
 * The honesty here is deliberate. A browser WILL warn about a downloaded
 * launcher, and a person who is not warned about the warning assumes
 * something is wrong and stops. Saying it first costs a sentence and saves
 * the install. (A signed installer removes the warning entirely; that is a
 * certificate purchase, not a code change.)
 */
// One numbered step. Defined out here because a component made inside a
// render is a new component every time, which throws its children away.
const Step = ({ n, title, children }) => (
  <div style={{ display: 'flex', gap: 11, marginBottom: 14 }}>
    <div style={{
      width: 22, height: 22, borderRadius: '50%', background: t.accentBg, color: t.accent,
      fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 1,
    }}>{n}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: t.ink, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.55 }}>{children}</div>
    </div>
  </div>
)

function GetTheAgent() {
  // WHY THIS IS NOT JUST AN <a download>.
  //
  // It was, and Alayda clicked it and nothing happened at all — no file, no
  // error, nothing. Two things stack up: the download ATTRIBUTE is ignored on
  // a cross-origin link (the file is on supabase.co, the page is not), and
  // browsers quietly discard a downloaded .cmd as a dangerous type. Between
  // them the click produces no network request and no message, which is
  // indistinguishable from a broken button — and from her side it WAS one.
  //
  // Fetching it ourselves and handing over a same-origin blob puts the
  // filename and the outcome back under our control. The important part is
  // not that this always succeeds — it is that it can no longer fail in
  // silence: a refusal now says so and offers the command instead.
  const [dl, setDl] = useState('idle')   // idle | working | done | blocked

  const grab = async (name) => {
    setDl('working')
    try {
      const res = await fetch(`${base}/${encodeURIComponent(name)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      if (!blob.size) throw new Error('empty')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoked late: a browser that is still writing the file needs the url
      // to outlive the click.
      setTimeout(() => URL.revokeObjectURL(url), 20000)
      setDl('done')
    } catch {
      setDl('blocked')
    }
  }

  const base = releaseBase
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const mac = /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)
  const phone = /iPhone|iPad|Android/i.test(ua)

  // What is actually published, rather than what we hope is. The release
  // writes release.json naming the best download it really uploaded, so the
  // day a signed installer exists this offers it with no deploy and nobody to
  // remember — and until then it cannot link to a file that is not there.
  // One definition of "what is published", shared with the staleness check
  // above — two fetches would be two answers.
  const release = useRelease()

  // The launcher is the floor: it is what shipped before any of this and it
  // works, so a missing or unreadable manifest costs nobody their download.
  const pick = (which) => {
    const r = release?.[which]
    const fallback = which === 'mac' ? 'JobScout Agent.command' : 'JobScout Agent.cmd'
    return { name: r?.installer || r?.launcher || fallback, signed: !!r?.installer }
  }
  const mine = pick(mac ? 'mac' : 'windows')
  const other = pick(mac ? 'windows' : 'mac')
  const file = mine.name

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${t.line}`, paddingTop: 14 }}>
      {phone && (
        <div style={{
          background: t.amberBg, color: t.amber, borderRadius: 9, padding: '10px 12px',
          fontSize: 13, lineHeight: 1.5, marginBottom: 14, display: 'flex', gap: 7, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {/* The old wording here was "Arnie works on a computer", on a
                phone. Read on a phone that says he does not work on phones —
                which is the opposite of true, and is exactly how somebody
                concluded the whole thing was useless. He works fully here.
                What needs a computer is the small program that gives him
                HANDS on that computer, and nothing can install that from a
                phone. Everything after it — allowing him, watching him,
                stopping him — is done from here. */}
            Arnie works fully on this phone. The one thing that needs a computer is the
            small program that lets him work <em>inside</em> the programs on it — that has to be
            downloaded there. After that you run him from here: you allow things, watch what
            he does and stop him, all from your phone.
          </span>
        </div>
      )}

      <Step n={1} title={`Download it${mac ? '' : ' on that computer'}`}>
        One small file. It is what starts the agent and keeps it up to date, so keep it
        somewhere you can find it again — the desktop is fine.
        <div style={{ marginTop: 9, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => grab(file)} disabled={dl === 'working'} style={btn(t.accent, '#fff')}>
            <Download size={14} /> {dl === 'working' ? 'Fetching…' : (mac ? 'Download for Mac' : 'Download for Windows')}
          </button>
          <a
            href={`${base}/${encodeURIComponent(other.name)}`}
            download
            style={{ ...btn(t.card2, t.sub), textDecoration: 'none' }}
          >
            {mac ? 'Windows version' : 'Mac version'}
          </a>
        </div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 8, lineHeight: 1.5 }}>
          {mine.signed
            // A signed build is the whole point of signing: nothing to warn
            // about, so nothing is said. Warning people about a box that will
            // not appear teaches them to expect trouble.
            ? 'It is signed by Hollow Hills Holdings, so it opens normally.'
            : <>
              Your browser will ask whether to keep it, because it is a program rather than a
              document. Keep it. {mac
                ? 'The first time you open it, hold Control and click it, then choose Open — macOS only offers that choice on a first run.'
                : 'Windows may also show a blue "protected your PC" box — choose More info, then Run anyway.'}
            </>}
        </div>

        {/* THE ONE THAT CANNOT BE BLOCKED.
            Nobody at this company has ever completed a connect, and one
            person reported clicking the button and nothing happening.
            Browsers quietly refuse to keep a downloaded .cmd — Chrome marks
            it dangerous and the file never lands — which looks exactly like
            "nothing happened". A command is text, so nothing can block it,
            and on a locked-down work machine it is often the only way in. */}
        {/* Whatever happened, it is said. The old failure mode was silence,
            which a person can only read as "the button is broken". */}
        {dl === 'done' && (
          <div style={{ fontSize: 12.5, color: t.add, marginTop: 8, lineHeight: 1.5 }}>
            Saved — look in your Downloads folder for <strong>{file}</strong>, and open it.
            Nothing there? Your browser may have removed it; use the command below.
          </div>
        )}
        {dl === 'blocked' && (
          <div style={{ fontSize: 12.5, color: t.amber, marginTop: 8, lineHeight: 1.5 }}>
            Your browser would not keep that file. That is common on a work computer and it is
            not something you did — use the command below instead.
          </div>
        )}
        {!mine.signed && !mac && <PasteInstead open={dl === 'blocked'} />}
      </Step>

      <Step n={2} title="Open it">
        A black window appears and a browser tab opens asking “Connect this computer?”.
        Press Connect and you are done — nothing to type, nothing to copy. Leave the black
        window open; closing it is how you stop Arnie on that machine.
      </Step>

      <div style={{
        background: t.card2, borderRadius: 9, padding: '10px 12px', fontSize: 12.5,
        color: t.sub, lineHeight: 1.55,
      }}>
        It connects outward only: nothing listens on the computer and no port is opened. The
        first run installs what it needs, which takes a minute and never happens again.
      </div>
    </div>
  )
}

/**
 * Teaching is one button here and the real work in the agent. The agent is the
 * only thing that can watch a screen, so this records an intent and the agent
 * picks it up on its next poll.
 */
function TeachButton({ employeeId, companyId, session, onDone }) {
  const [outcome, setOutcome] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const live = session?.status === 'live'

  const start = async () => {
    setBusy(true); setMsg('')
    try {
      const { error } = await supabase.from('arnie_skills').insert({
        company_id: companyId,
        employee_id: employeeId,
        name: outcome.trim().slice(0, 120),
        outcome: outcome.trim(),
        status: 'recording',
      })
      if (error) throw error
      setMsg('Recording. Go and do the job once on your computer, then come back and stop it.')
      setOpen(false); setOutcome(''); onDone?.()
    } catch (e) { setMsg(String(e.message || e)) } finally { setBusy(false) }
  }

  if (!live) {
    return <p style={{ margin: 0, fontSize: 13, color: t.muted }}>
      Connect a computer first — there is nothing to record on yet.
    </p>
  }

  return (
    <div>
      {!open && <button onClick={() => setOpen(true)} style={btn(t.accent, '#fff')}><GraduationCap size={14} /> Start teaching</button>}
      {open && (
        <div>
          <label style={{ display: 'block', fontSize: 13, color: t.ink, fontWeight: 600, marginBottom: 5 }}>
            What will you be showing him?
          </label>
          <input
            value={outcome} onChange={(e) => setOutcome(e.target.value)}
            placeholder="File a finished SRP job in TrakSmart"
            style={{ ...input, width: '100%', maxWidth: 440, marginBottom: 10 }} />
          <div style={{ fontSize: 12, color: t.sub, marginBottom: 10, lineHeight: 1.5 }}>
            Ten minutes at most, and nothing is recorded while he is waiting on you to sign in —
            so a password can never end up in the steps.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={start} disabled={busy || !outcome.trim()} style={btn(t.accent, '#fff')}>Start recording</button>
            <button onClick={() => setOpen(false)} style={btn(t.card2, t.sub)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p style={{ margin: '10px 0 0', fontSize: 13, color: t.sub }}>{msg}</p>}
    </div>
  )
}

const btn = (bg, fg, border) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: `1px solid ${border || 'transparent'}`,
  borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 600,
  minHeight: 36,
})

const input = {
  flex: 1, minWidth: 180, background: '#fff', border: `1px solid ${t.line}`,
  borderRadius: 8, padding: '8px 10px', fontSize: 13, color: t.ink, minHeight: 38,
}

/**
 * For when the download never arrives.
 *
 * Alayda clicked the button and nothing happened, and nobody at the company
 * has ever completed a connect. The likeliest reason is the quietest one: a
 * browser refusing to keep a downloaded .cmd. Chrome marks that file type
 * dangerous and discards it, and from the person's side there is no error —
 * the file simply is not there.
 *
 * A command is text. Nothing blocks text. It is the same launcher, fetched
 * and run in one line, and on a work machine with downloads locked down it is
 * often the only way in. Hidden behind a link because it IS a terminal, which
 * is the thing the whole download flow exists to avoid — it is the fallback,
 * not the path.
 */
function PasteInstead({ open: openByDefault = false }) {
  const [open, setOpen] = useState(openByDefault)
  const [copied, setCopied] = useState(false)
  // The backslashes matter: a single one here is an escape and the path comes
  // out as $env:TEMPJobScoutAgent.cmd, which fails in a way nobody could debug.
  const cmd = `irm "${releaseBase}/JobScout%20Agent.cmd" -OutFile "$env:TEMP\\JobScoutAgent.cmd"; & "$env:TEMP\\JobScoutAgent.cmd"`

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer',
          color: t.accent, fontSize: 12, fontWeight: 600, textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Download blocked, or nothing happened?
      </button>
    )
  }

  return (
    <div style={{ marginTop: 10, background: t.card2, borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5, marginBottom: 8 }}>
        Some work computers refuse to keep a downloaded program, and say nothing about it.
        This does the same job and cannot be blocked: open <strong>PowerShell</strong> on that
        computer — press Start, type powershell, press enter — then paste this and press enter.
      </div>
      <code style={{
        display: 'block', background: '#fff', border: `1px solid ${t.line}`, borderRadius: 7,
        padding: '8px 10px', fontSize: 11, color: t.ink, overflowX: 'auto', whiteSpace: 'nowrap',
      }}>{cmd}</code>
      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* select it by hand */ }
        }}
        style={{ ...btn(t.accent, '#fff'), marginTop: 8 }}
      >
        {copied ? 'Copied' : 'Copy the command'}
      </button>
      <div style={{ fontSize: 11.5, color: t.muted, marginTop: 8, lineHeight: 1.45 }}>
        It downloads the same file and runs it. The browser still opens and you still press
        Connect — nothing is typed and no token is pasted.
      </div>
    </div>
  )
}
