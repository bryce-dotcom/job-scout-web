import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const FREDDY_TABS = [
  { path: '/agents/freddy', label: 'Fleet', icon: 'Truck', end: true },
  { path: '/agents/freddy/tracking', label: 'Tracking', icon: 'MapPin' },
  { path: '/agents/freddy/trips', label: 'Trips', icon: 'Route' },
  { path: '/agents/freddy/costs', label: 'Costs', icon: 'DollarSign' },
  { path: '/agents/freddy/drivers', label: 'Drivers', icon: 'UserCheck' },
  { path: '/agents/freddy/alerts', label: 'Alerts', icon: 'Bell' },
  { path: '/agents/freddy/calendar', label: 'Calendar', icon: 'Calendar' },
  { path: '/agents/freddy/settings', label: 'Settings', icon: 'Settings' },
];

export default function FreddyWorkspace() {
  return (
    <AgentRequired slug="freddy-fleet">
      <div className="flex flex-col h-full">
        <AgentHeader slug="freddy-fleet" tabs={FREDDY_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  );
}
