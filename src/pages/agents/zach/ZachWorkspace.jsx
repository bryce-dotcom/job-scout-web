import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const ZACH_TABS = [
  { path: '/agents/zach',            label: 'Properties', icon: 'Home',     end: true },
  { path: '/agents/zach/visits',     label: 'Visits',     icon: 'ClipboardCheck' },
  { path: '/agents/zach/treatments', label: 'Treatments', icon: 'Sprout' },
  { path: '/agents/zach/pricing',    label: 'Pricing',    icon: 'DollarSign' },
  { path: '/agents/zach/settings',   label: 'Settings',   icon: 'Settings' },
];

export default function ZachWorkspace() {
  return (
    <AgentRequired slug="zach-yard-yeti">
      <div className="flex flex-col h-full">
        <AgentHeader slug="zach-yard-yeti" tabs={ZACH_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  );
}
