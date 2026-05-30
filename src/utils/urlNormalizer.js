// Protocols that are not crawlable — skip immediately
const SKIP_PROTOCOLS = ['mailto:', 'tel:', 'javascript:', 'data:', 'ftp:', '#'];

/**
 * Resolve a href to a full absolute URL.
 * Returns null if it can't be resolved.
 */
export function normalize(href, base) {
  if (!href || typeof href !== 'string') return null;

  const trimmed = href.trim();

  // Skip non-http protocols and pure fragments
  if (SKIP_PROTOCOLS.some((p) => trimmed.startsWith(p))) return null;
  if (trimmed === '' || trimmed === '/')
    return base ? stripFragment(base) : null;

  try {
    const resolved = new URL(trimmed, base);

    // Only allow http and https
    if (!['http:', 'https:'].includes(resolved.protocol)) return null;

    return stripFragment(resolved.href);
  } catch {
    return null;
  }
}

/**
 * Remove #fragment from a URL string.
 */
export function stripFragment(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/**
 * Check if a URL belongs to the same domain as the base.
 */
export function isSameDomain(url, base) {
  try {
    return new URL(url).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

/**
 * Basic URL format validation.
 */
export function isValid(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Get the root origin of a URL (protocol + hostname + port).
 */
export function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Check if a URL matches any of the ignore patterns.
 * Patterns are simple substring or wildcard (*) matches.
 */
export function shouldIgnore(url, patterns = []) {
  if (!patterns.length) return false;
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/\*/g, '.*');
    return new RegExp(escaped).test(url);
  });
}
