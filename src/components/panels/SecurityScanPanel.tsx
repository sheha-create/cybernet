import React from 'react';
import type { ScanFinding, ScanReport } from '../../types';
import PanelMenu from '../PanelMenu';

const SEVERITY_STYLE: Record<ScanFinding['severity'], string> = {
  CRITICAL: 'text-[#ff2d55] border-[rgba(255,45,85,0.35)] bg-[rgba(255,45,85,0.08)]',
  HIGH: 'text-orange-400 border-[rgba(255,100,0,0.35)] bg-[rgba(255,100,0,0.08)]',
  MED: 'text-[#ffcc00] border-[rgba(255,204,0,0.3)] bg-[rgba(255,204,0,0.06)]',
  LOW: 'text-[#00f5d4] border-[rgba(0,245,212,0.25)] bg-[rgba(0,245,212,0.05)]',
  INFO: 'text-gray-400 border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)]',
};

const SEVERITY_ORDER: ScanFinding['severity'][] = ['CRITICAL', 'HIGH', 'MED', 'LOW', 'INFO'];

interface SecurityScanPanelProps {
  report: ScanReport;
  loading: boolean;
  error: string;
  onRescan: () => void;
  onPin?: (id: string) => void;
}

const SecurityScanPanel: React.FC<SecurityScanPanelProps> = ({ report, loading, error, onRescan, onPin }) => {
  const grouped = SEVERITY_ORDER
    .map(severity => ({ severity, items: report.findings.filter(f => f.severity === severity) }))
    .filter(group => group.items.length > 0);

  const worst = report.summary?.highestSeverity ?? 'INFO';

  return (
    <div className="cyber-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-[#00f5d4]">Security Scan</span>
          <div className="font-mono text-[10px] text-gray-500 mt-1">
            {report.available
              ? `${report.hostname ?? 'this host'} · ${report.platform ?? ''} ${report.osRelease ?? ''}`.trim()
              : 'Waiting for a collector agent to report'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRescan}
            disabled={loading}
            className="font-mono text-[10px] px-2 py-0.5 rounded border border-[rgba(0,245,212,0.3)] text-[#00f5d4] hover:bg-[rgba(0,245,212,0.08)] disabled:opacity-50"
          >
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
          <PanelMenu panelId="scan" title="Security Scan" data={report.findings} onPin={onPin} />
        </div>
      </div>

      {!report.available ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
          <span className="font-mono text-xs text-gray-500">
            {report.reason ?? 'No scan data available yet.'}
          </span>
          <span className="font-mono text-[10px] text-gray-600">
            The scan reads your machine's listening ports and firewall state, which only
            the collector agent can supply.
          </span>
          <span className="font-mono text-[10px] text-gray-500">
            Config tab &rarr; Generate token &rarr; paste into <code className="text-[#00f5d4]">agent\.env</code> &rarr; run <code className="text-[#00f5d4]">node agent\collector.mjs</code>
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <div className="border border-[rgba(255,255,255,0.06)] rounded p-2">
              <div className="font-mono text-[10px] text-gray-500">VERDICT</div>
              <div className={`font-mono text-xs font-bold ${worst === 'CRITICAL' || worst === 'HIGH' ? 'text-[#ff2d55]' : worst === 'MED' ? 'text-[#ffcc00]' : 'text-[#00ff88]'}`}>
                {worst}
              </div>
            </div>
            <div className="border border-[rgba(255,255,255,0.06)] rounded p-2">
              <div className="font-mono text-[10px] text-gray-500">PORTS OPEN</div>
              <div className="font-mono text-xs text-[#00f5d4]">{report.summary?.totalPorts ?? 0}</div>
            </div>
            <div className="border border-[rgba(255,255,255,0.06)] rounded p-2">
              <div className="font-mono text-[10px] text-gray-500">EXPOSED</div>
              <div className={`font-mono text-xs ${(report.summary?.exposedPorts ?? 0) > 0 ? 'text-orange-400' : 'text-[#00ff88]'}`}>
                {report.summary?.exposedPorts ?? 0}
              </div>
            </div>
            <div className="border border-[rgba(255,255,255,0.06)] rounded p-2">
              <div className="font-mono text-[10px] text-gray-500">ATTACKS (24h)</div>
              <div className={`font-mono text-xs ${report.attacks.last24h > 0 ? 'text-[#ff2d55]' : 'text-[#00ff88]'}`}>
                {report.attacks.last24h}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto space-y-2 pr-1">
            {grouped.map(group => (
              <div key={group.severity} className="space-y-1">
                {group.items.map((finding, index) => (
                  <div
                    key={`${group.severity}-${index}`}
                    className={`border-l-2 rounded-r px-2 py-1.5 ${SEVERITY_STYLE[finding.severity]}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-gray-100">{finding.title}</span>
                      <span className="font-mono text-[10px] shrink-0 opacity-80">{finding.category}</span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-400 mt-0.5 leading-relaxed">{finding.detail}</div>
                  </div>
                ))}
              </div>
            ))}
            {report.findings.length === 0 && (
              <div className="font-mono text-[10px] text-gray-600 py-6 text-center">
                No findings from the last scan.
              </div>
            )}
          </div>

          <div className="font-mono text-[10px] text-gray-600 border-t border-[rgba(255,255,255,0.08)] pt-2 leading-relaxed">
            Findings come from the operating system's own listening-socket and firewall state reported by
            your collector agent{report.scannedAt ? ` at ${new Date(report.scannedAt).toLocaleString()}` : ''}.
            Attack counts are the requests this service actually detected against your account.
          </div>
        </>
      )}

      {error && <div className="font-mono text-[10px] text-[#ff2d55]">{error}</div>}
    </div>
  );
};

export default SecurityScanPanel;
