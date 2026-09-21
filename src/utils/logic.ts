import type { BlocklistEntry, ThreatLevel } from '../types';

/**
 * Validates an IPv4 address string.
 * Requires four dot-separated octets each in the range 0–255.
 */
export function isValidIPv4(s: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return false;
  return s.split('.').every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/**
 * Computes a deterministic threat score (0–99) seeded from the four IP octets.
 * Formula: (o1*7 + o2*13 + o3*3 + o4*17) % 100
 */
export function computeThreatScore(ip: string): number {
  const [o1, o2, o3, o4] = ip.split('.').map(Number);
  return (o1 * 7 + o2 * 13 + o3 * 3 + o4 * 17) % 100;
}

/**
 * Maps an alert accumulation rate (alerts/min) to a ThreatLevel.
 * < 3  → LOW
 * 3–6  → MED
 * 6–10 → HIGH
 * > 10 → CRITICAL
 */
export function computeThreatLevel(rate: number): ThreatLevel {
  if (rate < 3) return 'LOW';
  if (rate <= 6) return 'MED';
  if (rate <= 10) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Returns true when the rolling average deviates from the baseline by more than 40%.
 * Formula: |rolling - baseline| / baseline > 0.40
 */
export function computeAnomalyDelta(rolling: number, baseline: number): boolean {
  return Math.abs(rolling - baseline) / baseline > 0.40;
}

// ---------------------------------------------------------------------------
// Heatmap color interpolation helpers
// ---------------------------------------------------------------------------

/** Parse a 6-digit hex color string into [r, g, b] components (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Linear interpolation between two values. */
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Convert [r, g, b] to a CSS hex color string. */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Interpolates a heatmap color for a value in [0, 100].
 * 0   → #0a1628 (dark navy)
 * 50  → #00f5d4 (cyan)
 * 100 → #ff2d55 (red)
 */
export function interpolateHeatmapColor(v: number): string {
  const clamped = Math.max(0, Math.min(100, v));

  const low: [number, number, number] = hexToRgb('#0a1628');
  const mid: [number, number, number] = hexToRgb('#00f5d4');
  const high: [number, number, number] = hexToRgb('#ff2d55');

  if (clamped <= 50) {
    const t = clamped / 50;
    return rgbToHex(lerp(low[0], mid[0], t), lerp(low[1], mid[1], t), lerp(low[2], mid[2], t));
  } else {
    const t = (clamped - 50) / 50;
    return rgbToHex(lerp(mid[0], high[0], t), lerp(mid[1], high[1], t), lerp(mid[2], high[2], t));
  }
}

// ---------------------------------------------------------------------------
// Blocklist serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a BlocklistEntry to a JSON string with Date fields as ISO strings.
 */
export function serializeBlocklistEntry(entry: BlocklistEntry): string {
  return JSON.stringify({
    ...entry,
    addedAt: entry.addedAt.toISOString(),
    expiresAt: entry.expiresAt.toISOString(),
  });
}

/**
 * Deserializes a JSON string back into a BlocklistEntry,
 * converting ISO date strings back to Date objects.
 */
export function deserializeBlocklistEntry(s: string): BlocklistEntry {
  const raw = JSON.parse(s);
  return {
    ...raw,
    addedAt: new Date(raw.addedAt),
    expiresAt: new Date(raw.expiresAt),
  };
}
