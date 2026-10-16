import { Outlet } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'
import AssistantAvatar, { useAssistant } from '../../../components/AssistantAvatar'
import ArniePersona from './ArniePersona'
import { useStore } from '../../../lib/store'
import { myComputer } from '../../../lib/arnieComputer'
import { computerState } from '../../../lib/agentStatus'
import { loadPersona, assistantName } from '../../../lib/arniePersonaClient'
import { setPersona } from './arnieEngine'

const ARNIE_TABS = [
  { path: '/agents/arnie', label: 'Chat', icon: 'MessageCircle', end: true },
  { path: '/agents/arnie/computer', label: 'Computer', icon: 'Monitor' },
  { path: '/agents/arnie/routines', label: 'Routines', icon: 'Clock' },
  { path: '/agents/arnie/taught', label: 'Taught', icon: 'GraduationCap' },
  { path: '/agents/arnie/history', label: 'History', icon: 'History' },
  { path: '/agents/arnie/settings', label: 'Settings', icon: 'Wrench' },
]

export default function ArnieWorkspace() {
  const user = useStore((s) => s.user)
  const getAgent = useStore((s) => s.getAgent)
  const getCompanyAgent = useStore((s) => s.getCompanyAgent)
  const [status, setStatus] = useState(null)
  // undefined until this page's own load lands; until then the remembered
  // persona (useAssistant) stands in, so the header never starts as OG Arnie
  // on Jenny's page.
  const [loadedRow, setPersonaRow] = useState(undefined)
  const remembered = useAssistant()
  const personaRow = loadedRow !== undefined ? loadedRow : remembered.personaRow
  const personaKnown = loadedRow !== undefined || remembered.known
  const [picking, setPicking] = useState(false)

  // Who this person's assistant is. Loaded once here and handed to the engine,
  // so the name on the header and the name in the prompt are the same one.
  // Being greeted as Jenny under a header that says Arnie would be worse than
  // having no personas at all.
  const refreshPersona = useCallback(async () => {
    if (!user?.id) return
    const row = await loadPersona(user.id).catch(() => null)
    setPersonaRow(row)
    setPersona(row)
  }, [user?.id])

  useEffect(() => { refreshPersona() }, [refreshPersona])

  // The header badge is the ambient signal — a dot, a colour, the detail on
  // hover — and it is the only place a person finds out Arnie is stuck waiting
  // on them without opening the Computer tab. So it polls, slowly, and faster
  // only while something is actually happening.
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    let timer
    const tick = async () => {
      try {
        const c = await myComputer(user.id)
        if (!alive) return
        const s = computerState({ session: c.session, latest: c.latest, actions: c.actions })
        setStatus(s)
        // 'Needs you' and 'Working' are moving targets; idle is not.
        timer = setTimeout(tick, s.state === 'idle' ? 30000 : 6000)
      } catch {
        if (alive) timer = setTimeout(tick, 60000)
      }
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [user?.id])

  const name = personaKnown ? assistantName({
    personaRow,
    companyCustomName: getCompanyAgent?.('arnie-og')?.custom_name,
    agentFullName: getAgent?.('arnie-og')?.full_name,
  }) : ''

  return (
    <AgentRequired slug="arnie-og">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader
          slug="arnie-og"
          tabs={ARNIE_TABS}
          status={status}
          displayName={name}
          // His actual face, and the way to change whose it is. Both were
          // missing: the header drew a generic icon, and choosing Jenny lived
          // in a settings page about system changes.
          avatar={<AssistantAvatar size={36} persona={personaRow?.persona} />}
          onIdentityClick={() => setPicking(true)}
        />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* status so the chat can say where he is without polling a
              second time; openIdentity so his face is the switch wherever it
              appears, not only in the header. */}
          <Outlet context={{ personaRow, refreshPersona, status, openIdentity: () => setPicking(true) }} />
        </div>
        {picking && (
          <WhoIsYourAssistant
            onClose={() => setPicking(false)}
            onChanged={refreshPersona}
          />
        )}
      </div>
    </AgentRequired>
  )
}

/**
 * The picker, over the page you were already on.
 *
 * Deliberately not a route: changing who your assistant is should not take
 * you somewhere else and make you find your way back. It is the same
 * ArniePersona the settings page uses — one picker, so the two cannot drift
 * into disagreeing about what you chose.
 */
function WhoIsYourAssistant({ onClose, onChanged }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(44,53,48,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '6vh 16px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#f7f5ef', borderRadius: 16, padding: 16,
          width: '100%', maxWidth: 560, boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <strong style={{ fontSize: 15, color: '#2c3530' }}>Who your assistant is</strong>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#4d5a52',
              fontSize: 13, fontWeight: 600, padding: '8px 10px', minHeight: 44,
            }}
          >
            Done
          </button>
        </div>
        <ArniePersona onChanged={onChanged} />
      </div>
    </div>
  )
}
