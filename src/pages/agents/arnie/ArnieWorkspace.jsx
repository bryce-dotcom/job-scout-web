import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'
import { useStore } from '../../../lib/store'
import { myComputer } from '../../../lib/arnieComputer'
import { computerState } from '../../../lib/agentStatus'

const ARNIE_TABS = [
  { path: '/agents/arnie', label: 'Chat', icon: 'MessageCircle', end: true },
  { path: '/agents/arnie/computer', label: 'Computer', icon: 'Monitor' },
  { path: '/agents/arnie/routines', label: 'Routines', icon: 'Clock' },
  { path: '/agents/arnie/history', label: 'History', icon: 'History' },
  { path: '/agents/arnie/settings', label: 'Settings', icon: 'Wrench' },
]

export default function ArnieWorkspace() {
  const user = useStore((s) => s.user)
  const [status, setStatus] = useState(null)

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

  return (
    <AgentRequired slug="arnie-og">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader slug="arnie-og" tabs={ARNIE_TABS} status={status} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
