/**
 * Phase 3 — Service Tests
 * Run: node test-phase3.js
 * Run: npm test.js
 *
 * Tests queue, parser, and checker services individually
 * then together as an integration check.
 */

import {
  createJob,
  addResult,
  getJob,
  cancelJob,
  isCancelled,
  updateJob,
} from './src/services/queue.service.js';
import { parsePage } from './src/services/parser.service.js';
import { checkLink } from './src/services/checker.service.js';

const TEST_URL = 'https://example.com'; // safe, always up, minimal links

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
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(50));
}

// 1. QUEUE SERVICE
section('1. queue.service.js');

const jobId = createJob(TEST_URL, { maxDepth: 2, concurrency: 5 });
assert(
  'createJob returns a string ID',
  typeof jobId === 'string' && jobId.length > 0,
);

const job = getJob(jobId);
assert('getJob returns the job', job !== null);
assert('initial status is pending', job.status === 'pending');
assert('initial stats are zeroed', job.stats.total === 0);
assert('visitedUrls is a Set', job.visitedUrls instanceof Set);
assert('checkedLinks is a Set', job.checkedLinks instanceof Set);

// addResult — each type
addResult(jobId, { url: '/a', type: 'live', status: 200 });
addResult(jobId, { url: '/b', type: 'broken', status: 404 });
addResult(jobId, { url: '/c', type: 'redirect', status: 301 });
addResult(jobId, { url: '/d', type: 'error', status: null });
addResult(jobId, { url: '/e', type: 'error', status: null });

const stats = getJob(jobId).stats;
assert('total increments correctly', stats.total === 5, `got ${stats.total}`);
assert('live count correct', stats.live === 1, `got ${stats.live}`);
assert('broken count correct', stats.broken === 1, `got ${stats.broken}`);
assert(
  'redirects count correct',
  stats.redirects === 1,
  `got ${stats.redirects}`,
);
assert('errors count correct', stats.errors === 2, `got ${stats.errors}`);
assert('results array length', getJob(jobId).results.length === 5);

// updateJob
updateJob(jobId, { status: 'running' });
assert('updateJob patches status', getJob(jobId).status === 'running');

// cancel
assert('isCancelled is false before cancel', !isCancelled(jobId));
cancelJob(jobId);
assert('isCancelled is true after cancel', isCancelled(jobId));

// getJob for unknown ID
assert('getJob returns null for unknown ID', getJob('nonexistent') === null);

// 2. CHECKER SERVICE
section('2. checker.service.js');
console.log('  (making real HTTP requests — requires internet)\n');

// 200 OK
const live = await checkLink('https://example.com');
assert(
  'live link returns type "live"',
  live.type === 'live',
  `got: ${live.type}`,
);
assert(
  'live link returns status 200',
  live.status === 200,
  `got: ${live.status}`,
);
assert('live link has responseTime (ms)', live.responseTime > 0);
assert('live link has no error', live.error === null);

// 404 via httpbin
const broken = await checkLink('https://httpbin.org/status/404');
assert(
  'broken link returns type "broken"',
  broken.type === 'broken',
  `got: ${broken.type}`,
);
assert(
  'broken link returns status 404',
  broken.status === 404,
  `got: ${broken.status}`,
);

// redirect via httpbin
const redirect = await checkLink('https://httpbin.org/redirect/1');
assert(
  'redirect returns type "live" or "redirect"',
  ['live', 'redirect'].includes(redirect.type),
  `got: ${redirect.type}`,
);
assert(
  'redirect has a status code',
  redirect.status !== null,
  `got: ${redirect.status}`,
);

// bad domain — network error
const bad = await checkLink(
  'https://this-domain-absolutely-does-not-exist-checker.xyz',
);
assert(
  'bad domain returns type "error"',
  bad.type === 'error',
  `got: ${bad.type}`,
);
assert('bad domain has null status', bad.status === null);
assert(
  'bad domain has error message',
  typeof bad.error === 'string' && bad.error.length > 0,
);

// result shape check
const keys = ['url', 'status', 'type', 'finalUrl', 'responseTime', 'error'];
assert(
  'result has all expected keys',
  keys.every((k) => k in live),
  `missing: ${keys.filter((k) => !(k in live))}`,
);

// 3. PARSER SERVICE
section('3. parser.service.js');
console.log('  (making real HTTP requests — requires internet)\n');

const { links, error: parseError } = await parsePage(TEST_URL, TEST_URL);
assert('parsePage returns no error', parseError === null, `got: ${parseError}`);
assert('parsePage returns array of links', Array.isArray(links));
assert(
  'links array is not empty',
  links.length > 0,
  `got ${links.length} links`,
);
assert(
  'each link has href',
  links.every((l) => typeof l.href === 'string'),
);
assert(
  'each link has type',
  links.every((l) => ['internal', 'external'].includes(l.type)),
);
assert(
  'no mailto or javascript hrefs',
  links.every(
    (l) => !l.href.startsWith('mailto:') && !l.href.startsWith('javascript:'),
  ),
);
assert(
  'no fragment-only hrefs',
  links.every((l) => !l.href.startsWith('#')),
);
assert(
  'no duplicate hrefs',
  links.length === new Set(links.map((l) => l.href)).size,
);
assert(
  'hrefs are absolute URLs',
  links.every((l) => l.href.startsWith('http')),
);

// non-HTML url should return empty links, not crash
const { links: imgLinks, error: imgError } = await parsePage(
  'https://httpbin.org/image/png',
  TEST_URL,
);
assert(
  'non-HTML page returns empty links (not a crash)',
  Array.isArray(imgLinks),
);

// 4. INTEGRATION
section('4. Integration — parse + check + queue');

const integJobId = createJob(TEST_URL, {});
const { links: integLinks } = await parsePage(TEST_URL, TEST_URL);

// Check first 3 links and add to job
const sample = integLinks.slice(0, 3);
for (const link of sample) {
  const result = await checkLink(link.href);
  addResult(integJobId, result);
}

const integJob = getJob(integJobId);
assert(
  'integration job has results',
  integJob.results.length === sample.length,
);
assert(
  'integration total stat matches',
  integJob.stats.total === sample.length,
);
assert(
  'all results have required keys',
  integJob.results.every(
    (r) => r.url && r.type && r.responseTime !== undefined,
  ),
);

// SUMMARY
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failed > 0) process.exit(1);
