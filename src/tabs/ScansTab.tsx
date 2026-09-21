import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import BlocklistManager from '../components/panels/BlocklistManager';

interface ScansTabProps {
  state: DashboardState;
}

const ScansTab: React.FC<ScansTabProps> = ({ state }) => {
  const { blocklist, addToBlocklist, removeFromBlocklist, addToast, pinPanel } = state;

  return (
    <div className="h-full p-3">
      <BlocklistManager
        blocklist={blocklist}
        addToBlocklist={addToBlocklist}
        removeFromBlocklist={removeFromBlocklist}
        addToast={addToast}
        onPin={pinPanel}
      />
    </div>
  );
};

export default ScansTab;
