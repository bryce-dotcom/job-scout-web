import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

// Dougie the Document Reader. His first job was Lenard's handwritten takeoff
// forms (dougie-analyze, still called from the Lenard pages); his second,
// since 2026-09-25, is the buyer's bid package — read it, match every item
// to the catalog, price it, build the bid in their format.
const DOUGIE_TABS = [
  { path: '/agents/dougie', label: 'Bid Packages', icon: 'ClipboardList', end: true },
]

export default function DougieWorkspace() {
  return (
    <AgentRequired slug="dougie-docs">
      <div className="flex flex-col h-full">
        <AgentHeader slug="dougie-docs" tabs={DOUGIE_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
