import { Outlet } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'
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
  const [personaRow, setPersonaRow] = useState(null)

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

  const name = assistantName({
    personaRow,
    companyCustomName: getCompanyAgent?.('arnie-og')?.custom_name,
    agentFullName: getAgent?.('arnie-og')?.full_name,
  })

  return (
    <AgentRequired slug="arnie-og">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader slug="arnie-og" tabs={ARNIE_TABS} status={status} displayName={name} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet context={{ personaRow, refreshPersona }} />
        </div>
      </div>
    </AgentRequired>
  )
}
