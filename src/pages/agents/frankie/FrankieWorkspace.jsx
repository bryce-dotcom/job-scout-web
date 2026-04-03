import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

const FRANKIE_TABS = [
  { path: '/agents/frankie', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { path: '/agents/frankie/ask', label: 'Ask Frankie', icon: 'MessageCircle' },
  { path: '/agents/frankie/collections', label: 'Collections', icon: 'Bell' },
  { path: '/agents/frankie/insights', label: 'Insights', icon: 'TrendingUp' },
  { path: '/agents/frankie/settings', label: 'Settings', icon: 'Settings' },
]

export default function FrankieWorkspace() {
  return (
    <AgentRequired slug="frankie-finance">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader slug="frankie-finance" tabs={FRANKIE_TABS} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
