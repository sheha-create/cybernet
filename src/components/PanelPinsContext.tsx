import React, { createContext, useContext } from 'react';

interface PanelPinsValue {
  isPinned: (panelId: string) => boolean;
  pinPanel: (panelId: string) => void;
}

const PanelPinsContext = createContext<PanelPinsValue>({
  isPinned: () => false,
  pinPanel: () => { /* provider not mounted */ },
});

export const PanelPinsProvider: React.FC<{ value: PanelPinsValue; children: React.ReactNode }> = ({ value, children }) => (
  <PanelPinsContext.Provider value={value}>{children}</PanelPinsContext.Provider>
);

export function usePanelPins(): PanelPinsValue {
  return useContext(PanelPinsContext);
}
