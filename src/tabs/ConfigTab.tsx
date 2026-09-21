import React, { useState, useEffect } from 'react';
import type { DashboardState } from '../hooks/useDashboardState';

interface ConfigTabProps {
  state: DashboardState;
}

const ConfigTab: React.FC<ConfigTabProps> = ({ state }) => {
  const { darkMode, setDarkMode, myIP, setMyIP, addToast } = state;
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [ipInput, setIpInput] = useState(myIP);
  const [detecting, setDetecting] = useState(false);

  // Keep local input in sync if myIP changes externally
  useEffect(() => { setIpInput(myIP); }, [myIP]);

  useEffect(() => {
    const stored = localStorage.getItem('cybernet_claude_api_key') ?? '';
    setApiKey(stored);
  }, []);

  const handleAutoDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      const detected: string = data.ip;
      setIpInput(detected);
      setMyIP(detected);
      addToast(`Tracking IP: ${detected}`, 'success');
    } catch {
      addToast('Failed to detect public IP', 'error');
    } finally {
      setDetecting(false);
    }
  };

  const handleSaveIP = () => {
    const trimmed = ipInput.trim();
    setMyIP(trimmed);
    if (trimmed) {
      addToast(`Now tracking ${trimmed}`, 'success');
    } else {
      addToast('IP tracking cleared', 'info');
    }
  };

  const handleClearIP = () => {
    setIpInput('');
    setMyIP('');
    addToast('IP tracking disabled', 'info');
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('cybernet_claude_api_key', apiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  return (
    <div className="h-full p-3 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── My IP Tracking ── */}
        <div className="cyber-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">My IP Tracking</div>
            {myIP && (
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                color: '#050d1a', background: '#00f5d4',
                borderRadius: 3, padding: '1px 8px', fontWeight: 700,
              }}>
                ACTIVE · {myIP}
              </span>
            )}
          </div>

          <p className="font-mono text-[10px] text-gray-500">
            Enter your public IP address to track all dashboard interactions from that IP in real time.
          </p>

          <div className="flex gap-2">
            <input
              id="my-ip-input"
              type="text"
              value={ipInput}
              onChange={e => setIpInput(e.target.value)}
              placeholder="e.g. 203.0.113.42"
              className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
            />
            <button
              id="my-ip-save-btn"
              onClick={handleSaveIP}
              className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors"
            >
              Save
            </button>
            {myIP && (
              <button
                id="my-ip-clear-btn"
                onClick={handleClearIP}
                className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(255,0,68,0.3)] text-[#f5564a] hover:bg-[rgba(255,0,68,0.06)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <button
            id="my-ip-autodetect-btn"
            onClick={handleAutoDetect}
            disabled={detecting}
            className="w-full font-mono text-xs py-2 rounded border border-[rgba(0,245,212,0.2)] text-gray-400 hover:text-[#00f5d4] hover:border-[rgba(0,245,212,0.4)] hover:bg-[rgba(0,245,212,0.04)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detecting ? '⏳ Detecting…' : '🌐 Auto-detect my public IP'}
          </button>
        </div>

        {/* Claude API Key */}
        <div className="cyber-card p-4 space-y-3">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">AI Configuration</div>
          <div>
            <label className="font-mono text-[10px] text-gray-500 uppercase block mb-1">
              Claude API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.2)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.5)]"
              />
              <button
                onClick={handleSaveApiKey}
                className="font-mono text-xs px-3 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors"
              >
                {apiKeySaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <p className="font-mono text-[10px] text-gray-600 mt-1">
              Required for NEURAL AI Advisor. Stored locally in your browser.
            </p>
          </div>
        </div>

        {/* Display Settings */}
        <div className="cyber-card p-4 space-y-3">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Display Settings</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-gray-300">Dark Mode</div>
              <div className="font-mono text-[10px] text-gray-600">Toggle between dark and light theme</div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`relative w-10 h-5 rounded-full transition-colors ${darkMode ? 'bg-[rgba(0,245,212,0.3)]' : 'bg-[rgba(255,255,255,0.1)]'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${darkMode ? 'translate-x-5 bg-[#00f5d4]' : 'translate-x-0.5 bg-gray-400'}`}
              />
            </button>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="cyber-card p-4 space-y-3">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Simulation</div>
          <div className="font-mono text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Alert injection rate</span>
              <span className="text-[#00f5d4]">1 / 4s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Traffic update rate</span>
              <span className="text-[#00f5d4]">1 / 5s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Terminal log rate</span>
              <span className="text-[#00f5d4]">1 / 1.5s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Heatmap update rate</span>
              <span className="text-[#00f5d4]">1 / 30s</span>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="cyber-card p-4 space-y-2">
          <div className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">About</div>
          <div className="font-mono text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Platform</span>
              <span>CYBERNET Security Dashboard</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="text-[#00f5d4]">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Stack</span>
              <span>React + TypeScript + Vite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">AI Model</span>
              <span>claude-sonnet-4-20250514</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ConfigTab;
