import React from 'react';
import type { Toast } from '../types';

interface ToastManagerProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

const ICONS: Record<Toast['type'], string> = {
  success: '✓',
  warning: '⚠',
  error: '✗',
  info: 'ℹ',
};

const COLORS: Record<Toast['type'], string> = {
  success: 'text-[#00ff88] border-[rgba(0,255,136,0.3)]',
  warning: 'text-[#ffcc00] border-[rgba(255,204,0,0.3)]',
  error: 'text-[#ff2d55] border-[rgba(255,45,85,0.3)]',
  info: 'text-[#00f5d4] border-[rgba(0,245,212,0.3)]',
};

const ToastManager: React.FC<ToastManagerProps> = ({ toasts, removeToast }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[150] flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`cyber-card border font-mono text-xs flex items-center gap-2 px-3 py-2 min-w-[260px] max-w-[360px] animate-slide-in-up ${COLORS[toast.type]}`}
        >
          <span className="text-sm flex-shrink-0">{ICONS[toast.type]}</span>
          <span className="flex-1 text-gray-200">{toast.message}</span>
          {toast.undoFn && (
            <button
              onClick={() => { toast.undoFn?.(); removeToast(toast.id); }}
              className="text-[#00f5d4] hover:underline flex-shrink-0"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-500 hover:text-gray-300 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastManager;
