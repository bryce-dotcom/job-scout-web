// The conference rooms.
//
// Bryce, 2026-10-22: techs are on phones in the field, the office is on
// laptops, and there was nowhere in JobScout to just see each other. The
// Campfire is the main room and always exists; FireSides get opened on the
// spot and take the next free name off the topo list, so nobody has to invent
// one mid-conversation.
//
// This page is only the lobby. The call itself is held by RoomSession,
// above the router, so joining a room does not trap you here — you walk in
// and carry on working, and the dock follows you around the app.

import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Loader, Check, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/ThemeContext'
import { toast } from '../lib/toast'
import { MAIN_ROOM, nextRoomName, occupancyLabel, fireSideName, fireSideSlug } from '../lib/conferenceRooms'
import { useRoomSession } from '../components/RoomSession'
import CampfireMark from '../components/CampfireMark'
import { signedPhotoUrls } from '../lib/employeePhoto'

export default function Rooms() {
  const theme = useTheme()
  const companyId = useStore(s => s.companyId)
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const session = useRoomSession()
  const joined = session?.slug || null

  const [rooms, setRooms] = useState([])

  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState("")

  const me = useMemo(
    () => (employees || []).find(e => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()) || null,
    [employees, user?.email],
  )
  const myName = me?.name || user?.email || 'Someone'

  // The lobby list. The Campfire is not stored — it exists for every company,
  // so there is nothing to create before the first meeting.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('conference_rooms')
        .select('id, slug, name, blurb, opened_by_name, member_ids, created_at')
        .eq('company_id', companyId)
        .is('closed_at', null)
        .order('created_at')
      if (!cancelled) { setRooms(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  // Who is in which room comes from RoomSession's single presence channel.
  // This page used to open its own on the same topic and announce under the
  // same key, which is how a card could read "Empty" and "You're in here" at
  // once, about the same person.
  const headcount = session?.counts || {}
  const occupants = session?.occupants || {}
  // Signed, because employee-photos is a private bucket and every stored
  // headshot_url points at the PUBLIC path, which 400s. Signing keeps the
  // bucket closed and still shows the face.
  const [photoUrls, setPhotoUrls] = useState({})
  const seatedAtFire = occupants[MAIN_ROOM.slug] || []

  // The creator names it, in the ring, with no modal. A room called The Ridge
  // is charming and useless for a standing meeting — the sales team wants to
  // see the word Sales. The topo list stays as the fallback for anyone who
  // cannot think of one.
  //
  // Deliberately NOT prompt(): a native dialog is ugly in an installed PWA,
  // unusable on a phone, and blocks the whole page while it is up.
  const openRoom = async (typed) => {
    const named = fireSideName(typed)
    const taken = rooms.map(r => r.slug)
    const pick = named
      ? { slug: fireSideSlug(typed), name: named, blurb: '' }
      : nextRoomName(taken)

    if (taken.includes(pick.slug)) {
      const existing = rooms.find(r => r.slug === pick.slug)
      toast.error(`${existing?.name || pick.name} already exists — joining it instead.`)
      session?.join(pick.slug)
      return
    }

    setOpening(true)
    try {
      const { data, error } = await supabase
        .from('conference_rooms')
        .insert({
          company_id: companyId, slug: pick.slug, name: pick.name, blurb: pick.blurb,
          opened_by: me?.id || null, opened_by_name: myName,
        })
        .select('id, slug, name, blurb, opened_by_name, member_ids, created_at')
        .single()
      if (error) { toast.error('Could not start it: ' + error.message); return }
      setRooms(prev => [...prev, data])
      session?.join(data.slug)
    } finally {
      setOpening(false)
    }
  }

  // One link, one FireSide, 24 hours, revocable on its own.
  //
  // A fresh row every time rather than one reusable link per room: killing
  // the link you gave a client should not also kill the one you gave the
  // inspector, and a single shared token means nobody ever revokes anything.
  const shareRoom = async (room) => {
    const { data, error } = await supabase
      .from('room_invites')
      .insert({
        company_id: companyId,
        room_id: room.id,
        slug: room.slug,
        created_by: me?.id || null,
        created_by_name: myName,
      })
      .select('token')
      .single()
    if (error) { toast.error('Could not make a link: ' + error.message); return }

    const link = `${window.location.origin}/join/${data.token}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success(`Guest link copied — ${room.name}, good for 24 hours`)
    } catch {
      // Clipboard is blocked in plenty of places. Showing the link beats
      // telling someone it was copied when it was not.
      toast.info(link)
    }
  }

  const closeRoom = async (room) => {
    if (!confirm(`Close ${room.name}? It disappears from the list. Anyone still talking stays connected.`)) return
    const { error } = await supabase.from('conference_rooms').update({ closed_at: new Date().toISOString() }).eq('id', room.id)
    if (error) { toast.error('Could not close it: ' + error.message); return }
    setRooms(prev => prev.filter(r => r.id !== room.id))
  }

  // The outer ring: every FireSide, then the way to start one. Creating gets
  // a slot in the same circle as joining, because a feature nobody can find
  // the entrance to may as well not exist.
  const outerRing = [...rooms, { isCreate: true }]

  // Sign every roster photo once, not per face: the same person can be at
  // the fire and in a FireSide, and a signature costs a round trip.
  useEffect(() => {
    const urls = (employees || []).map(e => e.headshot_url).filter(Boolean)
    if (urls.length === 0) return
    let cancelled = false
    signedPhotoUrls(urls).then(map => { if (!cancelled) setPhotoUrls(map) })
    return () => { cancelled = true }
  }, [employees])

  return (
    <div style={{ padding: '20px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CampfireMark size={24} id="cf-lobby" /> CampFire
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: theme.textSecondary, maxWidth: 560, lineHeight: 1.5 }}>
            Everyone gathers at The Campfire. Start a FireSide when a few of you need to go deep on
            something without holding up the rest.
          </p>
        </div>
        {/* Same door as the + in the ring — it opens the name box there,
            rather than being a second way to make a room that skips naming. */}
        <button
          onClick={() => setNaming(true)}
          disabled={opening}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            background: theme.accent, color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: opening ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Plus size={16} /> {opening ? 'Starting…' : 'Start a FireSide'}
        </button>
      </div>

      {loading ? (
        <Centered theme={theme}><Loader size={18} /> Looking around…</Centered>
      ) : (
        <>
          {/* The fire, drawn as a fire.
              Bryce, 2026-10-22: "put the little fire in the middle of the page
              and name the participants around the fire, then the FireSides
              surrounding the main fire."
              A grid of cards made you read labels to work out where people
              were. A circle shows it: you see who is at the fire before you
              have read a word, and the FireSides orbit it because that is
              what they are — smaller fires away from the main one. */}
          <div style={{
            position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '1 / 1',
            margin: '8px auto 0',
          }}>
            {/* THE CAMPFIRE — the centre of everything */}
            <button
              onClick={() => { if (joined !== MAIN_ROOM.slug) session?.join(MAIN_ROOM.slug) }}
              title={joined === MAIN_ROOM.slug ? 'You are at The Campfire' : 'Join The Campfire'}
              style={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer', padding: 8, zIndex: 2,
              }}
            >
              <CampfireMark size={72} live={(headcount[MAIN_ROOM.slug] || 0) > 0} id="cf-centre" />
              <span style={{ fontSize: 15, fontWeight: 800, color: theme.text, whiteSpace: 'nowrap' }}>
                The Campfire
              </span>
              <span style={{ fontSize: 11, color: theme.textMuted }}>
                {occupancyLabel(headcount[MAIN_ROOM.slug] || 0)}
              </span>
            </button>

            {/* The people sitting round it */}
            {/* Faces, not name tags.
                Bryce, 2026-10-23: "use the employee picture to be the person
                at the fire with the name." A ring of names is a list drawn in
                a circle; a ring of faces is people sitting round a fire, and
                you recognise who is there before you read anything. */}
            {seatedAtFire.map((person, i) => {
              const pos = onCircle(i, seatedAtFire.length, 27)
              const emp = (employees || []).find(e => e.id === person.id)
              const first = String(person.name || '').split(/\s+/)[0]
              return (
                <div
                  key={(person.id ?? person.name) + '-' + i}
                  title={person.name}
                  style={{
                    position: 'absolute', left: pos.left, top: pos.top,
                    transform: 'translate(-50%, -50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}
                >
                  <FaceAtFire
                    src={emp?.headshot_url ? photoUrls[emp.headshot_url] : null}
                    name={person.name}
                    theme={theme}
                  />
                  <span style={{
                    padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                    background: theme.bgCard, border: '1px solid ' + theme.border,
                    color: theme.text, fontSize: 11, fontWeight: 600,
                  }}>
                    {first}
                  </span>
                </div>
              )
            })}

            {/* The FireSides, orbiting — and the way to start one, given a
                slot in the same ring so creating is as obvious as joining. */}
            {outerRing.map((node, i) => {
              const pos = onCircle(i, outerRing.length, 44)
              if (node.isCreate) {
                return (
                  <div
                    key="create"
                    style={{
                      position: 'absolute', left: pos.left, top: pos.top,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    {naming ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); const v = draft; setNaming(false); setDraft(''); openRoom(v) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => { if (!draft.trim()) setNaming(false) }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setNaming(false); setDraft('') } }}
                          placeholder="Sales"
                          maxLength={32}
                          style={{
                            width: 96, padding: '5px 8px', borderRadius: 8, fontSize: 12,
                            border: '1px solid ' + theme.accent, background: theme.bgCard, color: theme.text,
                          }}
                        />
                        <button
                          type="submit"
                          disabled={opening}
                          title="Start it"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                            border: 'none', background: theme.accent, color: '#fff',
                            cursor: opening ? 'wait' : 'pointer',
                          }}
                        >
                          <Check size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => setNaming(true)}
                        title="Start a FireSide"
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        }}
                      >
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 38, height: 38, borderRadius: 999,
                          border: '1px dashed ' + theme.border, color: theme.textMuted,
                          background: theme.bgCard,
                        }}>
                          <Plus size={17} />
                        </span>
                      </button>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: theme.textMuted, whiteSpace: 'nowrap' }}>
                      {opening ? 'Starting…' : naming ? 'Name it' : 'New FireSide'}
                    </span>
                  </div>
                )
              }
              const here = headcount[node.slug] || 0
              const youAreHere = joined === node.slug
              const sitting = (occupants[node.slug] || []).map(p => String(p?.name || '').split(/\s+/)[0]).filter(Boolean)
              return (
                <div
                  key={node.slug}
                  style={{
                    position: 'absolute', left: pos.left, top: pos.top,
                    transform: 'translate(-50%, -50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <button
                    onClick={() => { if (!youAreHere) session?.join(node.slug) }}
                    title={sitting.length ? node.name + ' — ' + sitting.join(', ') : node.name + ' — empty'}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      background: 'none', border: 'none', padding: 2,
                      cursor: youAreHere ? 'default' : 'pointer',
                    }}
                  >
                    <CampfireMark size={34} live={here > 0} id={'cf-' + node.slug} />
                    <span style={{
                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      color: youAreHere ? theme.accent : theme.text,
                    }}>
                      {node.name}
                    </span>
                    <span style={{ fontSize: 10, color: theme.textMuted, whiteSpace: 'nowrap' }}>
                      {youAreHere ? 'you are here' : (sitting.length ? sitting.join(', ') : 'empty')}
                    </span>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* The guest link lives on the FireSide and nowhere else:
                        a client should land in the room made for them, not
                        where the team is talking. */}
                    <button
                      onClick={() => shareRoom(node)}
                      title={'Copy a guest link to ' + node.name}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: theme.textMuted, opacity: 0.65, padding: 0, lineHeight: 1,
                      }}
                    >
                      <Link2 size={12} />
                    </button>
                    <button
                      onClick={() => closeRoom(node)}
                      title={'Close ' + node.name}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: theme.textMuted, opacity: 0.5, padding: 0, lineHeight: 1,
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Who a FireSide is for, listed under the circle — there is no room
              for it on a 34px fire, and it is the thing Cole's sales team need
              to recognise as theirs. */}
          {rooms.some(r => r.member_ids?.length > 0) && (
            <div style={{ maxWidth: 560, margin: '4px auto 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rooms.filter(r => r.member_ids?.length > 0).map(r => (
                <div key={r.id} style={{ fontSize: 11.5, color: theme.textMuted, textAlign: 'center' }}>
                  <strong style={{ color: theme.text }}>{r.name}</strong> — {namesFor(r.member_ids, employees)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Centered({ theme, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: theme.textMuted, fontSize: 14 }}>
      {children}
    </div>
  )
}

// "Cole, Doug, Damien and 2 more" — first names only, because a card has one
// line for this and a FireSide of eight people would otherwise wrap into a
// paragraph nobody reads.
function namesFor(ids, employees) {
  const byId = new Map((employees || []).map(e => [e.id, e]))
  const names = (ids || []).map(id => byId.get(id)?.name).filter(Boolean).map(n => n.split(/\s+/)[0])
  if (names.length === 0) return `${(ids || []).length} people`
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

// A spot on a circle, starting at the top and going round clockwise.
// Percentages rather than pixels so the ring scales with its container and
// works at 375px without measuring anything.
function onCircle(i, total, radiusPct) {
  const angle = (-90 + (360 / Math.max(total, 1)) * i) * (Math.PI / 180)
  return {
    left: `${50 + radiusPct * Math.cos(angle)}%`,
    top: `${50 + radiusPct * Math.sin(angle)}%`,
  }
}

// One person at the fire.
//
// Draws the photo when there is a working one and a clean initial when there
// is not — and treats "the image failed to load" as the same thing as "no
// photo", because the alternative is what Bryce saw: the browser's broken
// icon and the alt text, inside a circle, looking like a bug in the circle.
// alt is deliberately empty for that reason; the name is already underneath.
function FaceAtFire({ src, name, theme }) {
  const [broken, setBroken] = useState(false)
  const initial = String(name || '?').trim().charAt(0).toUpperCase()

  const ring = {
    width: 44, height: 44, borderRadius: '50%',
    border: '2px solid ' + theme.accent,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
  }

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        style={{ ...ring, objectFit: 'cover', background: theme.bgCard }}
      />
    )
  }

  return (
    <span style={{
      ...ring,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: theme.accentBg, color: theme.accent, fontSize: 15, fontWeight: 800,
    }}>
      {initial}
    </span>
  )
}
