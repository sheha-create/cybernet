import React from 'react';

interface CriticalFlashProps {
  active: boolean;
}

const CriticalFlash: React.FC<CriticalFlashProps> = ({ active }) => {
  if (!active) return null;
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[200] animate-critical-flash"
      style={{ backgroundColor: 'rgba(255, 45, 85, 0.10)' }}
    />
  );
};

export default CriticalFlash;
