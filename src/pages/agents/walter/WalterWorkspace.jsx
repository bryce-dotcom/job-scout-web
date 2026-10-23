import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

const WALTER_TABS = [
  { path: '/agents/walter', label: 'Assessments', icon: 'Grid3X3', end: true },
]

export default function WalterWorkspace() {
  return (
    <AgentRequired slug="walter-windows">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AgentHeader slug="walter-windows" tabs={WALTER_TABS} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
