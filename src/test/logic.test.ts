import { describe, it, expect } from 'vitest';
import {
  isValidIPv4,
  computeThreatScore,
  computeThreatLevel,
  computeAnomalyDelta,
  interpolateHeatmapColor,
  serializeBlocklistEntry,
  deserializeBlocklistEntry,
} from '../utils/logic';
import { generateThreatsFromIP } from '../utils/threatIntel';
import type { BlocklistEntry } from '../types';

describe('logic utils', () => {
  describe('isValidIPv4', () => {
    it('returns true for valid IPv4 addresses', () => {
      expect(isValidIPv4('192.168.1.1')).toBe(true);
      expect(isValidIPv4('8.8.8.8')).toBe(true);
      expect(isValidIPv4('0.0.0.0')).toBe(true);
      expect(isValidIPv4('255.255.255.255')).toBe(true);
      expect(isValidIPv4('127.0.0.1')).toBe(true);
    });

    it('returns false for invalid IPv4 addresses', () => {
      expect(isValidIPv4('256.0.0.1')).toBe(false);
      expect(isValidIPv4('192.168.1')).toBe(false);
      expect(isValidIPv4('192.168.1.1.1')).toBe(false);
      expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false);
      expect(isValidIPv4('')).toBe(false);
      expect(isValidIPv4('192.168.-1.1')).toBe(false);
    });
  });

  describe('computeThreatScore', () => {
    it('computes deterministic scores in range 0-99', () => {
      const score1 = computeThreatScore('192.168.1.1');
      const score2 = computeThreatScore('192.168.1.1');
      expect(score1).toBe(score2);
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThan(100);

      const score3 = computeThreatScore('8.8.8.8');
      expect(score3).toBeGreaterThanOrEqual(0);
      expect(score3).toBeLessThan(100);
    });
  });

  describe('computeThreatLevel', () => {
    it('maps alert rates to correct threat levels', () => {
      expect(computeThreatLevel(0)).toBe('LOW');
      expect(computeThreatLevel(2.9)).toBe('LOW');
      expect(computeThreatLevel(3)).toBe('MED');
      expect(computeThreatLevel(6)).toBe('MED');
      expect(computeThreatLevel(7)).toBe('HIGH');
      expect(computeThreatLevel(10)).toBe('HIGH');
      expect(computeThreatLevel(10.1)).toBe('CRITICAL');
      expect(computeThreatLevel(50)).toBe('CRITICAL');
    });
  });

  describe('computeAnomalyDelta', () => {
    it('detects when rolling deviates from baseline by > 40%', () => {
      expect(computeAnomalyDelta(150, 100)).toBe(true); // +50%
      expect(computeAnomalyDelta(50, 100)).toBe(true);  // -50%
      expect(computeAnomalyDelta(110, 100)).toBe(false); // +10%
      expect(computeAnomalyDelta(100, 100)).toBe(false); // 0%
    });
  });

  describe('interpolateHeatmapColor', () => {
    it('returns hex color values across the spectrum', () => {
      const low = interpolateHeatmapColor(0);
      expect(low).toBe('#0a1628');

      const mid = interpolateHeatmapColor(50);
      expect(mid).toBe('#00f5d4');

      const high = interpolateHeatmapColor(100);
      expect(high).toBe('#ff2d55');
    });
  });

  describe('serializeBlocklistEntry & deserializeBlocklistEntry', () => {
    it('correctly serializes and deserializes dates in blocklist entries', () => {
      const entry: BlocklistEntry = {
        id: 'block-1',
        ip: '198.51.100.23',
        reason: 'Brute Force attempt',
        severity: 'CRITICAL',
        addedAt: new Date('2026-09-20T12:00:00.000Z'),
        expiresAt: new Date('2026-09-21T12:00:00.000Z'),
      };

      const serialized = serializeBlocklistEntry(entry);
      expect(typeof serialized).toBe('string');

      const deserialized = deserializeBlocklistEntry(serialized);
      expect(deserialized.id).toBe(entry.id);
      expect(deserialized.ip).toBe(entry.ip);
      expect(deserialized.reason).toBe(entry.reason);
      expect(deserialized.severity).toBe(entry.severity);
      expect(deserialized.addedAt.toISOString()).toBe(entry.addedAt.toISOString());
      expect(deserialized.expiresAt.toISOString()).toBe(entry.expiresAt.toISOString());
      expect(deserialized.addedAt instanceof Date).toBe(true);
      expect(deserialized.expiresAt instanceof Date).toBe(true);
    });
  });

  describe('generateThreatsFromIP', () => {
    it('generates alert records for high risk IPs', () => {
      const threats = generateThreatsFromIP({
        ip: '185.220.101.45',
        country: 'Germany',
        city: 'Frankfurt',
        isp: 'Tor Exit Node',
        asn: 'AS12345',
        latitude: 50.1109,
        longitude: 8.6821,
        abuseScore: 85,
        totalReports: 25,
        isVPN: true,
        isProxy: true,
        isBogon: false,
        isDatacenter: true,
        isResidential: false,
        isMobile: false,
        threatTypes: ['High Risk', 'VPN', 'Proxy'],
        recentActivity: true,
        usageType: 'Datacenter',
      });

      expect(threats.length).toBeGreaterThan(0);
      expect(threats.some(t => t.severity === 'CRITICAL')).toBe(true);
      expect(threats.some(t => t.type === 'VPN Detected')).toBe(true);
    });
  });
});
