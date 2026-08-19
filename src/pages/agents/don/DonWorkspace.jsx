import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

const DON_TABS = [
  { path: '/agents/don',            label: 'Sites',      icon: 'MapPin', end: true },
  { path: '/agents/don/takeoff',    label: 'Takeoff',    icon: 'Ruler' },
  { path: '/agents/don/ground-truth', label: 'Actuals',    icon: 'Gauge' },
  { path: '/agents/don/price-book', label: 'Prices',     icon: 'DollarSign' },
  { path: '/agents/don/settings',   label: 'Settings',   icon: 'Settings' },
]

export default function DonWorkspace() {
  return (
    <AgentRequired slug="don-excavator">
      <div className="flex flex-col h-full">
        <AgentHeader slug="don-excavator" tabs={DON_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
