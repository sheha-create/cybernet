import { describe, expect, it } from 'vitest';
import {
  expandIPv6, formatIP, ipFamily, isLoopbackIP, isRoutableIP,
  isValidIP, isValidIPv4, isValidIPv6, normalizeIP,
} from '../utils/ip';

describe('isValidIPv4', () => {
  it('accepts valid dotted quads', () => {
    for (const ip of ['0.0.0.0', '8.8.8.8', '127.0.0.1', '192.168.1.1', '255.255.255.255']) {
      expect(isValidIPv4(ip)).toBe(true);
    }
  });

  it('rejects malformed input', () => {
    for (const ip of ['256.0.0.1', '192.168.1', '192.168.1.1.1', 'abc.def.ghi.jkl', '', '192.168.-1.1']) {
      expect(isValidIPv4(ip)).toBe(false);
    }
  });

  it('rejects leading zeros, which are ambiguous', () => {
    expect(isValidIPv4('010.1.1.1')).toBe(false);
    expect(isValidIPv4('192.168.01.1')).toBe(false);
  });
});

describe('isValidIPv6', () => {
  it('accepts common forms', () => {
    for (const ip of [
      '::1', '::', 'fe80::1', '2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001',
      '2001:db8:85a3::8a2e:370:7334', 'fe80::1%eth0', '::ffff:8.8.8.8', '1:2:3:4:5:6:7:8',
    ]) {
      expect(isValidIPv6(ip), ip).toBe(true);
    }
  });

  it('rejects malformed input', () => {
    for (const ip of ['', 'gggg::1', '1:2:3:4:5:6:7:8:9', '1::2::3', '12345::1', '1.2.3.4']) {
      expect(isValidIPv6(ip), ip).toBe(false);
    }
  });
});

describe('expandIPv6', () => {
  it('expands compressed zeroes', () => {
    expect(expandIPv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(expandIPv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(expandIPv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
  });

  it('treats equivalent spellings identically', () => {
    expect(expandIPv6('2001:db8::1')).toBe(expandIPv6('2001:0db8:0000:0000:0000:0000:0000:0001'));
  });

  it('strips a zone identifier', () => {
    expect(expandIPv6('fe80::1%eth0')).toBe('fe80:0000:0000:0000:0000:0000:0000:0001');
  });

  it('converts an embedded IPv4 tail', () => {
    expect(expandIPv6('::ffff:1.2.3.4')).toBe('0000:0000:0000:0000:0000:ffff:0102:0304');
  });
});

describe('normalizeIP', () => {
  it('collapses v4-mapped IPv6 to plain IPv4', () => {
    expect(normalizeIP('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIP('::FFFF:8.8.8.8')).toBe('8.8.8.8');
  });

  it('canonicalises the IPv6 loopback', () => {
    expect(normalizeIP('0:0:0:0:0:0:0:1')).toBe('::1');
  });

  it('leaves IPv4 unchanged', () => {
    expect(normalizeIP('192.168.1.1')).toBe('192.168.1.1');
  });
});

describe('ipFamily', () => {
  it('detects the family', () => {
    expect(ipFamily('8.8.8.8')).toBe('IPv4');
    expect(ipFamily('2001:db8::1')).toBe('IPv6');
    expect(ipFamily('::1')).toBe('IPv6');
    expect(ipFamily('nonsense')).toBeNull();
  });
});

describe('isValidIP', () => {
  it('accepts both families and rejects junk', () => {
    expect(isValidIP('8.8.8.8')).toBe(true);
    expect(isValidIP('2001:db8::1')).toBe(true);
    expect(isValidIP('hello')).toBe(false);
  });
});

describe('isLoopbackIP', () => {
  it('recognises loopback in both families', () => {
    expect(isLoopbackIP('127.0.0.1')).toBe(true);
    expect(isLoopbackIP('127.5.5.5')).toBe(true);
    expect(isLoopbackIP('::1')).toBe(true);
    expect(isLoopbackIP('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIP('8.8.8.8')).toBe(false);
  });
});

describe('isRoutableIP', () => {
  it('treats public addresses as routable', () => {
    // 2001:4860:4860::8888 is Google Public DNS. Note that 2001:db8::/32 is the
    // documentation range and must NOT appear here.
    for (const ip of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888', '2606:4700:4700::1111']) {
      expect(isRoutableIP(ip), ip).toBe(true);
    }
  });

  it('treats IPv4 private ranges as non-routable', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1']) {
      expect(isRoutableIP(ip), ip).toBe(false);
    }
  });

  it('does not mistake 172.15 or 172.32 for private', () => {
    expect(isRoutableIP('172.15.0.1')).toBe(true);
    expect(isRoutableIP('172.32.0.1')).toBe(true);
  });

  it('treats IPv6 private ranges as non-routable', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1']) {
      expect(isRoutableIP(ip), ip).toBe(false);
    }
  });

  it('treats global unicast IPv6 as routable', () => {
    expect(isRoutableIP('2001:4860:4860::8888')).toBe(true);
  });
});

describe('formatIP', () => {
  it('returns a compact readable form', () => {
    expect(formatIP('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(formatIP('8.8.8.8')).toBe('8.8.8.8');
  });

  it('round-trips through normalize', () => {
    for (const ip of ['2001:db8::1', 'fe80::1', '8.8.8.8']) {
      expect(normalizeIP(formatIP(ip))).toBe(normalizeIP(ip));
    }
  });
});