import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

const ARNIE_TABS = [
  { path: '/agents/arnie', label: 'Chat', icon: 'MessageCircle', end: true },
  { path: '/agents/arnie/history', label: 'History', icon: 'Clock' },
]

export default function ArnieWorkspace() {
  return (
    <AgentRequired slug="arnie-og">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader slug="arnie-og" tabs={ARNIE_TABS} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
