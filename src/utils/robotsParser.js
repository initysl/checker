import axios from 'axios';
import robotsParser from 'robots-parser';
import { config } from '../config.js';

// Cache robots per domain so we don't fetch it repeatedly
const cache = new Map();

/**
 * Fetch and parse robots.txt for a given URL's domain.
 * Returns a robots instance or null if unavailable.
 */
async function fetchRobots(url) {
  const origin = new URL(url).origin;
  if (cache.has(origin)) return cache.get(origin);

  const robotsUrl = `${origin}/robots.txt`;

  try {
    const res = await axios.get(robotsUrl, {
      timeout: config.timeout,
      headers: { 'User-Agent': config.userAgent },
    });
    const robots = robotsParser(robotsUrl, res.data);
    cache.set(origin, robots);
    return robots;
  } catch {
    // No robots.txt — allow everything
    cache.set(origin, null);
    return null;
  }
}

/**
 * Returns true if the crawler is allowed to visit the URL.
 * If robots.txt is missing or unreadable, defaults to allowed.
 */
export async function isAllowed(url) {
  try {
    const robots = await fetchRobots(url);
    if (!robots) return true;
    return robots.isAllowed(url, config.userAgent) !== false;
  } catch {
    return true;
  }
}

/**
 * Clear the robots cache (useful for testing).
 */
export function clearCache() {
  cache.clear();
}
