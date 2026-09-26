import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

// Benny the Bid Builder (2026-09-26 — Bryce: Dougie stays inside Lenard as
// the takeoff reader; the bid work is Benny "so users know what he does").
// The buyer's bid package in, a priced bid in their format out.
const BENNY_TABS = [
  { path: '/agents/benny', label: 'Bid Packages', icon: 'ClipboardList', end: true },
]

export default function BennyWorkspace() {
  return (
    <AgentRequired slug="benny-bids">
      <div className="flex flex-col h-full">
        <AgentHeader slug="benny-bids" tabs={BENNY_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
