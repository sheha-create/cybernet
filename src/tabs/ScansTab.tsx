import React from 'react';
import type { DashboardState } from '../hooks/useDashboardState';
import SecurityScanPanel from '../components/panels/SecurityScanPanel';
import BlocklistManager from '../components/panels/BlocklistManager';

interface ScansTabProps {
  state: DashboardState;
}

const ScansTab: React.FC<ScansTabProps> = ({ state }) => {
  const { scan, blocklist, addToBlocklist, removeFromBlocklist, addToast, pinPanel } = state;

  return (
    <div className="flex flex-col gap-3 h-full p-3 overflow-auto">
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 min-h-[420px]">
        <SecurityScanPanel
          report={scan.report}
          loading={scan.loading}
          error={scan.error}
          onRescan={scan.refresh}
          onPin={pinPanel}
        />
        <BlocklistManager
          blocklist={blocklist}
          addToBlocklist={addToBlocklist}
          removeFromBlocklist={removeFromBlocklist}
          addToast={addToast}
          onPin={pinPanel}
        />
      </div>
    </div>
  );
};

export default ScansTab;
