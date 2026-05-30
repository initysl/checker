/**
 * Reporter Tests
 * Run: node test.js
 * Run: npm test:test
 *
 * Tests console reporter output and JSON reporter file writing.
 * Uses a local HTTP server — no external network needed.
 */

import http from 'http';
import { readFile, unlink } from 'fs/promises';
import { printReport } from './src/reporter/consoleReporter.js';
import { writeJson } from './src/reporter/jsonReporter.js';
import { startCrawl } from './src/services/crawler.service.js';

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

const PAGES = {
  '/': `<html><body>
    <a href="/about">About</a>
    <a href="/blog">Blog</a>
    <a href="/dead">Dead link</a>
    <a href="/redirect">Redirect</a>
  </body></html>`,
  '/about': '<html><body><a href="/">Home</a></body></html>',
  '/blog': '<html><body><a href="/">Home</a></body></html>',
};

const server = http.createServer((req, res) => {
  if (req.url === '/redirect') {
    res.writeHead(301, { Location: '/about' });
    res.end();
    return;
  }
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
console.log(`\n  Local server on ${BASE}`);

// Run one crawl — share results across all tests
const { stats, results } = await startCrawl(
  BASE,
  { depth: 1, concurrency: 3, noRobots: true },
  () => {},
);

// 1. CRAWL RESULTS SANITY (baseline for reporter tests)
section('1. Crawl baseline sanity');

assert('has results to report', results.length > 0, `got ${results.length}`);
assert(
  'has at least one live result',
  results.some((r) => r.type === 'live'),
);
assert(
  'has at least one broken result',
  results.some((r) => r.type === 'broken'),
);
assert(
  'has at least one redirect',
  results.some((r) => r.type === 'redirect'),
);
assert('stats total matches results', stats.total === results.length);
assert(
  'stats breakdown sums correctly',
  stats.live + stats.broken + stats.redirects + stats.errors === stats.total,
);

// 2. CONSOLE REPORTER — does not throw
section('2. consoleReporter.printReport');
console.log('  (visual output below — inspect it manually)\n');

let consoleThrew = false;
try {
  printReport({ url: BASE, stats, results, onlyBroken: false, elapsed: 1234 });
} catch (err) {
  consoleThrew = true;
  console.log('  ERROR:', err.message);
}
assert('printReport does not throw', !consoleThrew);

// --only-broken mode
let onlyBrokenThrew = false;
try {
  printReport({ url: BASE, stats, results, onlyBroken: true, elapsed: 500 });
} catch (err) {
  onlyBrokenThrew = true;
}
assert('printReport --only-broken does not throw', !onlyBrokenThrew);

// Empty results edge case
let emptyThrew = false;
try {
  printReport({
    url: BASE,
    stats: { total: 0, live: 0, broken: 0, redirects: 0, errors: 0 },
    results: [],
    onlyBroken: false,
    elapsed: 100,
  });
} catch (err) {
  emptyThrew = true;
}
assert('printReport handles empty results', !emptyThrew);

// 3. JSON REPORTER — file structure
section('3. jsonReporter.writeJson — file structure');

const outPath = '/tmp/checker-phase5-test.json';
const opts = { depth: 1, concurrency: 3, timeout: 8000, ignore: [] };

await writeJson(outPath, {
  url: BASE,
  options: opts,
  stats,
  results,
  elapsed: 1234,
});

const raw = await readFile(outPath, 'utf-8');
const report = JSON.parse(raw);

// meta
assert('report has meta block', typeof report.meta === 'object');
assert('meta.url matches seed', report.meta.url === BASE);
assert(
  'meta.generatedAt is ISO string',
  typeof report.meta.generatedAt === 'string' &&
    report.meta.generatedAt.includes('T'),
);
assert('meta.elapsedMs is a number', typeof report.meta.elapsedMs === 'number');
assert('meta.options.depth present', report.meta.options.depth === opts.depth);
assert(
  'meta.options.concurrency present',
  report.meta.options.concurrency === opts.concurrency,
);

// stats
assert('report has stats block', typeof report.stats === 'object');
assert(
  'stats.total correct',
  report.stats.total === stats.total,
  `got ${report.stats.total}`,
);
assert('stats.broken correct', report.stats.broken === stats.broken);
assert('stats.live correct', report.stats.live === stats.live);

// results
assert('report has results array', Array.isArray(report.results));
assert('results length matches', report.results.length === results.length);

const first = report.results[0];
const requiredKeys = [
  'url',
  'status',
  'type',
  'linkType',
  'sourceUrl',
  'finalUrl',
  'responseTime',
  'depth',
  'error',
];
assert(
  'each result has all required keys',
  requiredKeys.every((k) => k in first),
  `missing: ${requiredKeys.filter((k) => !(k in first))}`,
);

// result types are valid
assert(
  'all types are valid strings',
  report.results.every((r) =>
    ['live', 'broken', 'redirect', 'error'].includes(r.type),
  ),
);
assert(
  'all linkTypes are valid',
  report.results.every((r) => ['internal', 'external'].includes(r.linkType)),
);
assert(
  'responseTime is always a number',
  report.results.every((r) => typeof r.responseTime === 'number'),
);

// broken link has correct data
const brokenInReport = report.results.find((r) => r.type === 'broken');
assert(
  'broken result status is 404',
  brokenInReport?.status === 404,
  `got ${brokenInReport?.status}`,
);
assert(
  'broken result has sourceUrl',
  typeof brokenInReport?.sourceUrl === 'string',
);

// 4. JSON REPORTER — valid JSON output
section('4. jsonReporter — output is valid JSON');

let parseThrew = false;
try {
  JSON.parse(raw);
} catch {
  parseThrew = true;
}
assert('output parses as valid JSON', !parseThrew);
assert('output is pretty-printed', raw.includes('\n  '));

// 5. JSON REPORTER — different result types preserved
section('5. jsonReporter — result types preserved');

const typesInFile = [...new Set(report.results.map((r) => r.type))];
assert(
  'live type present in file',
  typesInFile.includes('live'),
  `types: ${typesInFile}`,
);
assert(
  'broken type present in file',
  typesInFile.includes('broken'),
  `types: ${typesInFile}`,
);
assert(
  'redirect type present in file',
  typesInFile.includes('redirect'),
  `types: ${typesInFile}`,
);

// TEARDOWN + SUMMARY
server.close();
await unlink(outPath).catch(() => {});

console.log(`\n${'═'.repeat(55)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(55));

if (failed > 0) process.exit(1);
