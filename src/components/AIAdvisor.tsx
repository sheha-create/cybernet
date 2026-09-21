import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ThreatLevel, Alert, BlocklistEntry } from '../types';

interface AIAdvisorProps {
  systemHealth: number;
  threatLevel: ThreatLevel;
  anomalyActive: boolean;
  alerts: Alert[];
  blocklist: BlocklistEntry[];
}

interface Message {
  id: string;
  role: 'user' | 'neural';
  content: string;
  loading?: boolean;
}

const PROMPT_CHIPS = [
  'Analyze current threats',
  'Should I escalate threat level?',
  'Recommend firewall rules',
  'Explain latest anomaly',
  'Top attack vectors right now',
];

function buildSystemPrompt(
  systemHealth: number,
  threatLevel: ThreatLevel,
  anomalyActive: boolean,
  alerts: Alert[],
  blocklist: BlocklistEntry[],
): string {
  const topPorts = [...new Set(alerts.slice(0, 20).map(a => a.targetPort))].slice(0, 5).join(', ');
  const alertsSummary = alerts.slice(0, 5).map(a => `${a.severity} ${a.eventType} from ${a.sourceIP}`).join('; ');
  return `You are NEURAL, an elite cybersecurity AI embedded in the CYBERNET dashboard. Current system state: ${systemHealth}% health, ${alerts.length} active threats, anomaly status: ${anomalyActive ? 'ACTIVE' : 'INACTIVE'}, recent alerts: ${alertsSummary}, blocked IPs: ${blocklist.filter(b => b.status === 'active').length}, top targeted ports: ${topPorts}. Give sharp, tactical, actionable security advice. Be concise, direct, use technical language. Short paragraphs only. No bullet points.`;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({
  systemHealth, threatLevel, anomalyActive, alerts, blocklist,
}) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const anomalyFiredRef = useRef(false);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };
    const loadingMsg: Message = {
      id: `msg-${Date.now()}-loading`,
      role: 'neural',
      content: '',
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    try {
      // Read API key from localStorage (user configures in Config tab)
      const apiKey = localStorage.getItem('cybernet_claude_api_key') ?? '';

      const systemPrompt = buildSystemPrompt(systemHealth, threatLevel, anomalyActive, alerts, blocklist);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      };

      // NOTE: Add your Claude API key in the Config tab.
      // It will be stored in localStorage under 'cybernet_claude_api_key'.
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            ...messages
              .filter(m => !m.loading)
              .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
            { role: 'user', content: content.trim() },
          ],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errData?.error?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { content: Array<{ type: string; text: string }> };
      const responseText = data.content.find(c => c.type === 'text')?.text ?? 'No response';

      setMessages(prev => prev.map(m =>
        m.loading ? { ...m, content: responseText, loading: false } : m
      ));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Connection failed';
      setMessages(prev => prev.map(m =>
        m.loading ? { ...m, content: `[ERROR] ${errMsg}. Configure your API key in the Config tab.`, loading: false } : m
      ));
    } finally {
      setLoading(false);
    }
  }, [loading, messages, systemHealth, threatLevel, anomalyActive, alerts, blocklist]);

  // Auto-send anomaly prompt when anomaly activates
  useEffect(() => {
    if (anomalyActive && !anomalyFiredRef.current && open) {
      anomalyFiredRef.current = true;
      sendMessage('Explain latest anomaly');
    }
    if (!anomalyActive) {
      anomalyFiredRef.current = false;
    }
  }, [anomalyActive, open, sendMessage]);

  const handleClear = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all"
        style={{
          background: 'rgba(10,22,40,0.95)',
          border: '1px solid rgba(0,245,212,0.3)',
          boxShadow: open ? '0 0 30px rgba(0,245,212,0.5)' : '0 0 15px rgba(0,245,212,0.2)',
          color: '#00f5d4',
        }}
        title="NEURAL AI Advisor"
      >
        🛡
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-30 w-80 flex flex-col animate-slide-in-up"
          style={{
            height: 480,
            background: 'rgba(10,22,40,0.97)',
            border: '1px solid rgba(0,245,212,0.25)',
            boxShadow: '0 0 40px rgba(0,245,212,0.15)',
            borderRadius: 4,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(0,245,212,0.1)]">
            <div>
              <div className="font-mono text-xs text-[#00f5d4]" style={{ textShadow: '0 0 8px rgba(0,245,212,0.6)' }}>
                NEURAL ADVISOR
              </div>
              <div className="font-mono text-[9px] text-gray-600">// AI-POWERED</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClear}
                className="font-mono text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                CLEAR SESSION
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 font-mono text-xs py-4">
                Ask NEURAL about your security posture
              </div>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'neural' && (
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(0,245,212,0.1)] border border-[rgba(0,245,212,0.3)] flex items-center justify-center mr-1.5 mt-0.5 animate-pulse-green">
                    <span className="text-[8px]">●</span>
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-2.5 py-1.5 rounded font-mono text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[rgba(0,245,212,0.12)] text-[#00f5d4] border border-[rgba(0,245,212,0.2)]'
                      : 'bg-[rgba(10,22,40,0.8)] text-gray-200 border border-[rgba(255,255,255,0.06)]'
                  }`}
                >
                  {msg.loading ? (
                    <div className="flex gap-1 items-center py-0.5">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[#00f5d4] animate-bounce-dot"
                          style={{ animationDelay: `${i * 0.16}s` }}
                        />
                      ))}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt chips */}
          {messages.length === 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {PROMPT_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  className="font-mono text-[9px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.15)] text-gray-500 hover:text-[#00f5d4] hover:border-[rgba(0,245,212,0.3)] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 border-t border-[rgba(0,245,212,0.08)] pt-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Ask NEURAL..."
                className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,212,0.15)] font-mono text-xs text-gray-200 px-2 py-1.5 rounded outline-none focus:border-[rgba(0,245,212,0.4)] placeholder-gray-700"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="font-mono text-[10px] px-2 py-1.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] transition-colors disabled:opacity-40"
              >
                TRANSMIT
              </button>
            </div>
            <div className="font-mono text-[8px] text-gray-700 mt-1 text-center">
              🔒 ENCRYPTED CHANNEL ACTIVE
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAdvisor;
