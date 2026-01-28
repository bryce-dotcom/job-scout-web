import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const FREDDY_TABS = [
  { path: '/agents/freddy', label: 'Fleet', icon: 'Truck', end: true },
  { path: '/agents/freddy/calendar', label: 'Calendar', icon: 'Calendar' },
  { path: '/agents/freddy/inventory', label: 'Inventory', icon: 'Package' },
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
