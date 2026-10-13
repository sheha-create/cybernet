/**
 * IP address utilities covering both IPv4 and IPv6.
 *
 * IPv6 handling notes:
 *  - A v4-mapped address such as `::ffff:127.0.0.1` is treated as IPv4.
 *  - Zone identifiers (`fe80::1%eth0`) are accepted and stripped.
 *  - Addresses are compared on their expanded form, so `2001:db8::1` and
 *    `2001:0db8:0000:0000:0000:0000:0000:0001` are recognised as equal.
 */

/**
 * Expands an IPv6 address to its full eight-group lowercase form.
 * Returns null when the input is not a valid IPv6 address.
 */
export function expandIPv6(input: string): string | null {
  let address = input.trim().toLowerCase();
  if (!address) return null;

  // Strip a zone identifier such as %eth0 or %12.
  const zone = address.indexOf('%');
  if (zone !== -1) address = address.slice(0, zone);

  // A trailing dotted-quad (::ffff:1.2.3.4) becomes two hex groups.
  const embedded = address.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) {
    const octets = embedded[2].split('.').map(Number);
    if (octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${embedded[1]}${high}:${low}`;
  }

  const doubleColon = address.indexOf('::');
  if (doubleColon !== -1 && address.indexOf('::', doubleColon + 1) !== -1) return null;

  let head: string[];
  let tail: string[];
  if (doubleColon === -1) {
    head = address.split(':');
    tail = [];
    if (head.length !== 8) return null;
  } else {
    const before = address.slice(0, doubleColon);
    const after = address.slice(doubleColon + 2);
    head = before ? before.split(':') : [];
    tail = after ? after.split(':') : [];
    if (head.length + tail.length > 7) return null;
  }

  const groups: string[] = [];
  const parse = (parts: string[]) => parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    return part;
  });

  const headParsed = parse(head);
  const tailParsed = parse(tail);
  if (headParsed.some(p => p === null) || tailParsed.some(p => p === null)) return null;

  groups.push(...(headParsed as string[]));
  const fill = 8 - groups.length - tailParsed.length;
  for (let i = 0; i < fill; i += 1) groups.push('0');
  groups.push(...(tailParsed as string[]));

  if (groups.length !== 8) return null;
  return groups.map(g => g.padStart(4, '0')).join(':');
}

/** True when the string is a valid IPv4 dotted-quad address. */
export function isValidIPv4(s: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return false;
  return s.split('.').every((part) => {
    // Reject leading zeros such as "01", which are ambiguous.
    if (part.length > 1 && part.startsWith('0')) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/** True when the string is a valid IPv6 address. */
export function isValidIPv6(s: string): boolean {
  return expandIPv6(s) !== null;
}

/** True for either address family. */
export function isValidIP(s: string): boolean {
  const value = s.trim();
  return isValidIPv4(value) || isValidIPv6(value);
}

/** Returns 'IPv4' | 'IPv6', or null when the address is invalid. */
export function ipFamily(s: string): 'IPv4' | 'IPv6' | null {
  const value = s.trim();
  if (isValidIPv4(value)) return 'IPv4';
  if (expandIPv6(value)) return 'IPv6';
  return null;
}

/**
 * Normalises an address for storage and comparison.
 * v4-mapped IPv6 is collapsed to its plain IPv4 form, zone ids are removed, and
 * IPv6 is expanded so equivalent spellings share one key.
 */
export function normalizeIP(s: string): string {
  const value = s.trim();
  if (isValidIPv4(value)) return value;

  const lower = value.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped && isValidIPv4(mapped[1])) return mapped[1];

  const expanded = expandIPv6(lower);
  if (!expanded) return value;

  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return '::1';
  const embeddedV4 = expanded.match(/^0000:0000:0000:0000:0000:(?:ffff:)?(\w{4}):(\w{4})$/);
  if (embeddedV4) {
    const hi = parseInt(embeddedV4[1], 16);
    const lo = parseInt(embeddedV4[2], 16);
    const v4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    if (isValidIPv4(v4)) return v4;
  }
  return expanded;
}

const IPV4_PRIVATE = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.18\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^224\./, // multicast
  /^240\./, // reserved
];

function isPrivateIPv4(ip: string): boolean {
  return IPV4_PRIVATE.some(pattern => pattern.test(ip));
}

function isPrivateIPv6(expanded: string): boolean {
  const first = parseInt(expanded.slice(0, 4), 16);
  // :: unspecified
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
  // ::1 loopback
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
  // fc00::/7 unique local
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link local
  if ((first & 0xffc0) === 0xfe80) return true;
  // ff00::/8 multicast
  if ((first & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 documentation
  if (expanded.startsWith('2001:0db8')) return true;
  // 64:ff9b::/96 NAT64
  if (expanded.startsWith('0064:ff9b')) return true;
  return false;
}

/** True when the address is loopback, unspecified or otherwise non-routable. */
export function isLoopbackIP(s: string): boolean {
  const ip = normalizeIP(s);
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (isValidIPv4(ip)) return /^127\./.test(ip);
  return false;
}

/**
 * True when the address is publicly routable, meaning public geolocation and
 * threat-intelligence sources can hold data for it.
 */
export function isRoutableIP(s: string): boolean {
  const ip = normalizeIP(s);
  if (isValidIPv4(ip)) return !isPrivateIPv4(ip);
  const expanded = expandIPv6(ip);
  if (!expanded) return false;
  return !isPrivateIPv6(expanded);
}

/** Compact, human-friendly form. IPv6 is re-compressed for display. */
export function formatIP(s: string): string {
  const ip = normalizeIP(s);
  if (isValidIPv4(ip)) return ip;
  const expanded = expandIPv6(ip);
  if (!expanded) return s;

  // Longest run of zero groups collapses to '::'.
  const groups = expanded.split(':');
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;
  groups.forEach((group, index) => {
    if (group === '0000') {
      if (currentStart === -1) currentStart = index;
      currentLength += 1;
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentStart = -1;
      currentLength = 0;
    }
  });

  if (bestLength < 2) {
    return groups.map(g => g.replace(/^0+(?=.)/, '')).join(':');
  }
  const head = groups.slice(0, bestStart).map(g => g.replace(/^0+(?=.)/, '')).join(':');
  const tail = groups.slice(bestStart + bestLength).map(g => g.replace(/^0+(?=.)/, '')).join(':');
  return `${head}::${tail}`;
}