/**
 * Phase 4 — Crawler Tests
 * Run: node test-phase4.js
 *
 * Uses a local HTTP server to avoid any external network dependency.
 */

import http from 'http';
import { startCrawl } from './src/services/crawler.service.js';
import {
  createJob as cj,
  cancelJob as cx,
  getJob as gj,
} from './src/services/queue.service.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(55));
}

// LOCAL TEST SERVER
// Serves a small HTML site in memory so tests never hit the web

const PAGES = {
  '/': `<html><body>
    <a href="/about">About</a>
    <a href="/blog">Blog</a>
    <a href="/dead">Dead link</a>
    <a href="https://external-ignore-me.com/page">External</a>
  </body></html>`,

  '/about': `<html><body>
    <a href="/">Home</a>
    <a href="/contact">Contact</a>
  </body></html>`,

  '/blog': `<html><body>
    <a href="/">Home</a>
    <a href="/blog/post-1">Post 1</a>
  </body></html>`,

  '/blog/post-1': `<html><body>
    <a href="/blog">Back</a>
  </body></html>`,

  '/contact': `<html><body>
    <a href="/">Home</a>
  </body></html>`,
};

// /dead is intentionally absent — returns 404

const server = http.createServer((req, res) => {
  const page = PAGES[req.url];
  if (page) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise((res) => server.listen(0, '127.0.0.1', res));
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;
console.log(`\n  Local test server running on ${BASE}`);

// 1. BASIC CRAWL
section('1. Basic crawl — local server (depth 2)');

const fired = [];
const { stats: s1, results: r1 } = await startCrawl(
  BASE,
  { depth: 2, concurrency: 3, noRobots: true },
  (r) => fired.push(r),
);

assert('returns stats object', typeof s1 === 'object');
assert('stats.total > 0', s1.total > 0, `got ${s1.total}`);
assert(
  'stats.total matches results',
  s1.total === r1.length,
  `stats=${s1.total} results=${r1.length}`,
);
assert('onResult fired for each link', fired.length === r1.length);
assert(
  'every result has url',
  r1.every((r) => typeof r.url === 'string'),
);
assert(
  'every result has type',
  r1.every((r) => ['live', 'broken', 'redirect', 'error'].includes(r.type)),
);
assert(
  'every result has sourceUrl',
  r1.every((r) => typeof r.sourceUrl === 'string'),
);
assert(
  'every result has responseTime',
  r1.every((r) => typeof r.responseTime === 'number'),
);
assert(
  'every result has depth field',
  r1.every((r) => typeof r.depth === 'number'),
);
assert(
  'every result has linkType',
  r1.every((r) => ['internal', 'external'].includes(r.linkType)),
);
assert(
  'stats breakdown sums to total',
  s1.live + s1.broken + s1.redirects + s1.errors === s1.total,
);
assert('broken link detected (/dead)', s1.broken >= 1, `broken=${s1.broken}`);
assert('live links detected', s1.live >= 1, `live=${s1.live}`);

// 2. DEDUPLICATION
section('2. Deduplication — no URL checked twice');

const urls = r1.map((r) => r.url);
const unique = new Set(urls);
assert(
  'no duplicate URLs in results',
  urls.length === unique.size,
  `${urls.length} results, ${unique.size} unique`,
);

// 3. DEPTH CONTROL
section('3. Depth control');

const { results: r_d0 } = await startCrawl(
  BASE,
  { depth: 0, concurrency: 3, noRobots: true },
  () => {},
);
assert(
  'depth 0 — all results at depth 0',
  r_d0.every((r) => r.depth === 0),
  `depths: ${[...new Set(r_d0.map((r) => r.depth))]}`,
);
assert(
  'depth 0 — only seed page links',
  r_d0.length > 0,
  'no results at depth 0',
);

const { results: r_d1 } = await startCrawl(
  BASE,
  { depth: 1, concurrency: 3, noRobots: true },
  () => {},
);
const depths_d1 = [...new Set(r_d1.map((r) => r.depth))];
assert(
  'depth 1 — has depth-0 results',
  r_d1.some((r) => r.depth === 0),
);
assert(
  'depth 1 — has no depth-2 results',
  r_d1.every((r) => r.depth <= 1),
  `found depth: ${depths_d1}`,
);

// 4. IGNORE PATTERNS
section('4. Ignore patterns');

const { results: r4 } = await startCrawl(
  BASE,
  { depth: 2, concurrency: 3, noRobots: true, ignore: ['/blog*'] },
  () => {},
);
const hasBlog = r4.some((r) => r.url.includes('/blog'));
assert(
  'ignored /blog* pattern — no blog URLs in results',
  !hasBlog,
  `found: ${r4.filter((r) => r.url.includes('/blog')).map((r) => r.url)}`,
);

// 5. BROKEN LINK DETECTION
section('5. Broken link detection');

const brokenResults = r1.filter((r) => r.type === 'broken');
const deadLink = brokenResults.find((r) => r.url.includes('/dead'));
assert(
  '404 page classified as broken',
  deadLink !== undefined,
  `broken URLs: ${brokenResults.map((r) => r.url)}`,
);
assert(
  'broken result has status 404',
  deadLink?.status === 404,
  `got: ${deadLink?.status}`,
);
assert('broken result has sourceUrl', typeof deadLink?.sourceUrl === 'string');

// 6. ERROR RESILIENCE
section('6. Error resilience — bad domain');

let threw = false;
let errResult = null;

try {
  await startCrawl(
    'http://127.0.0.1:1', // nothing listening on port 1
    { depth: 1, concurrency: 2, noRobots: true },
    (r) => {
      errResult = r;
    },
  );
  assert('bad host does not throw', true);
  assert(
    'bad host returns error result',
    errResult?.type === 'error',
    `got: ${errResult?.type}`,
  );
} catch {
  threw = true;
  assert('bad host does not throw', false, 'threw an exception');
}

// 7. CANCELLATION
section('7. Cancellation');

const testJobId = cj('http://127.0.0.1', {});
assert('job starts not cancelled', gj(testJobId).status !== 'cancelled');
cx(testJobId);
assert(
  'job is cancelled after cancelJob',
  gj(testJobId).status === 'cancelled',
);

// 8. CONCURRENCY + TIMING
section('8. Concurrency — completes quickly');

const t = Date.now();
await startCrawl(BASE, { depth: 2, concurrency: 10, noRobots: true }, () => {});
const ms = Date.now() - t;
assert('crawl completes under 5s', ms < 5000, `took ${ms}ms`);
console.log(`  ℹ️  Completed in ${ms}ms`);

// TEARDOWN + SUMMARY
server.close();

console.log(`\n${'-'.repeat(55)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('-'.repeat(55));

if (failed > 0) process.exit(1);
