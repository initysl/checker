import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalize, isSameDomain } from '../utils/urlNormalizer.js';
import { config } from '../config.js';

// Content types we can actually parse for links
const PARSEABLE_TYPES = ['text/html', 'application/xhtml+xml'];

/**
 * Fetch a page and extract all links from it.
 * Returns { links, error } where links is an array of:
 * { href, type: 'internal' | 'external' }
 */
export async function parsePage(pageUrl, baseUrl) {
  let html;

  try {
    const res = await axios.get(pageUrl, {
      timeout: config.timeout,
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html',
      },
      maxRedirects: config.maxRedirects,
    });

    const contentType = res.headers['content-type'] ?? '';
    const isParseable = PARSEABLE_TYPES.some((t) => contentType.includes(t));

    if (!isParseable) {
      return { links: [], error: null };
    }

    html = res.data;
  } catch (err) {
    return { links: [], error: err.message };
  }

  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href');
    const href = normalize(raw, pageUrl);

    // Skip nulls and already-seen hrefs
    if (!href || seen.has(href)) return;
    seen.add(href);

    links.push({
      href,
      type: isSameDomain(href, baseUrl) ? 'internal' : 'external',
    });
  });

  return { links, error: null };
}
