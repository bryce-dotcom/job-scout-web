import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

const VICTOR_TABS = [
  { path: '/agents/victor', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { path: '/agents/victor/verify', label: 'New Verification', icon: 'Camera' },
  { path: '/agents/victor/history', label: 'History', icon: 'ClipboardList' },
  { path: '/agents/victor/settings', label: 'Settings', icon: 'Settings' },
]

export default function VictorWorkspace() {
  return (
    <AgentRequired slug="victor-verify">
      <div className="flex flex-col h-full">
        <AgentHeader slug="victor-verify" tabs={VICTOR_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
