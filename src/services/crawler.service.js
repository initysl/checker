import pLimit from 'p-limit';
import { parsePage } from './parser.service.js';
import { checkLink } from './checker.service.js';
import {
  createJob,
  getJob,
  updateJob,
  addResult,
  isCancelled,
} from './queue.service.js';
import { isAllowed } from '../utils/robotsParser.js';
import {
  isSameDomain,
  shouldIgnore,
  isBinaryUrl,
} from '../utils/urlNormalizer.js';

/**
 * Start a full crawl.
 *
 * @param {string}   url       - Seed URL
 * @param {object}   options   - depth, concurrency, ignore, noRobots
 * @param {function} onResult  - Called with each link result as it comes in
 * @returns {{ stats, results }}
 */
export async function startCrawl(url, options = {}, onResult = () => {}) {
  const { depth = 2, concurrency = 5, ignore = [], noRobots = false } = options;

  const jobId = createJob(url, options);
  updateJob(jobId, { status: 'running', startedAt: new Date() });

  const queue = [{ pageUrl: url, depth: 0 }];
  const limit = pLimit(Number(concurrency));

  // BFS loop
  while (queue.length > 0) {
    if (isCancelled(jobId)) break;

    const batch = queue.splice(0, queue.length);

    await Promise.all(
      batch.map((entry) =>
        limit(() =>
          crawlPage(entry, {
            jobId,
            baseUrl: url,
            maxDepth: Number(depth),
            ignore,
            noRobots,
            queue,
            onResult,
          }).catch((err) => {
            // Per-page errors must never crash the whole crawl
            console.error(
              `[crawler] Unexpected error on ${entry.pageUrl}: ${err.message}`,
            );
          }),
        ),
      ),
    );
  }

  updateJob(jobId, { status: 'complete', completedAt: new Date() });

  const finalJob = getJob(jobId);
  return { stats: finalJob.stats, results: finalJob.results };
}

// Internal — process one page
async function crawlPage(entry, context) {
  const { pageUrl, depth } = entry;
  const { jobId, baseUrl, maxDepth, ignore, noRobots, queue, onResult } =
    context;

  const job = getJob(jobId);
  if (!job || isCancelled(jobId)) return;

  // Already crawled this page
  if (job.visitedUrls.has(pageUrl)) return;
  job.visitedUrls.add(pageUrl);

  // Binary files — check the link but don't parse for more links
  if (isBinaryUrl(pageUrl)) return;

  // Robots.txt
  if (!noRobots) {
    const allowed = await isAllowed(pageUrl);
    if (!allowed) return;
  }

  const { links, error: parseError } = await parsePage(pageUrl, baseUrl);

  if (parseError) {
    const result = {
      url: pageUrl,
      sourceUrl: pageUrl,
      status: null,
      type: 'error',
      finalUrl: null,
      responseTime: 0,
      error: parseError,
      depth,
      linkType: 'internal',
    };
    addResult(jobId, result);
    onResult(result);
    return;
  }

  // Check all links found on this page concurrently
  await Promise.all(
    links.map((link) =>
      checkPageLink(link, {
        jobId,
        baseUrl,
        sourceUrl: pageUrl,
        maxDepth,
        depth,
        ignore,
        queue,
        onResult,
      }),
    ),
  );
}

// Internal — check one link, enqueue if internal page
async function checkPageLink(link, context) {
  const { href, type, isBinary } = link;
  const {
    jobId,
    baseUrl,
    sourceUrl,
    maxDepth,
    depth,
    ignore,
    queue,
    onResult,
  } = context;

  const job = getJob(jobId);
  if (!job || isCancelled(jobId)) return;

  // Already checked this link across any page
  if (job.checkedLinks.has(href)) return;
  job.checkedLinks.add(href);

  // Ignore patterns
  if (shouldIgnore(href, ignore)) return;

  const result = await checkLink(href);

  const fullResult = { ...result, sourceUrl, linkType: type, depth };
  addResult(jobId, fullResult);
  onResult(fullResult);

  // Enqueue for further crawling only if:
  // - internal link
  // - within depth budget
  // - not yet visited
  // - alive (not broken/error)
  // - not a binary asset (nothing to parse)
  const isInternal = isSameDomain(href, baseUrl);
  const withinDepth = depth < maxDepth;
  const notVisited = !job.visitedUrls.has(href);
  const isAlive = ['live', 'redirect'].includes(result.type);
  const notBinary = !isBinary;

  if (isInternal && withinDepth && notVisited && isAlive && notBinary) {
    queue.push({ pageUrl: href, depth: depth + 1 });
  }
}
