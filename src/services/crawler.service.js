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
import { isSameDomain, shouldIgnore } from '../utils/urlNormalizer.js';

/**
 * Start a full crawl.
 *
 * @param {string} url         - Seed URL
 * @param {object} options     - depth, concurrency, timeout, ignore, noRobots
 * @param {function} onResult  - Called with each link result as it comes in
 * @returns {object}           - Final job state { stats, results }
 */
export async function startCrawl(url, options = {}, onResult = () => {}) {
  const { depth = 2, concurrency = 5, ignore = [], noRobots = false } = options;

  const jobId = createJob(url, options);
  const job = getJob(jobId);

  updateJob(jobId, { status: 'running', startedAt: new Date() });

  // BFS queue — each entry tracks which depth it's at
  const queue = [{ pageUrl: url, depth: 0 }];
  const limit = pLimit(concurrency);

  // BFS loop
  while (queue.length > 0) {
    if (isCancelled(jobId)) break;

    // Pull everything at the current depth level and process in parallel
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
          }),
        ),
      ),
    );
  }

  // Finalise
  const finalJob = getJob(jobId);
  updateJob(jobId, {
    status: 'complete',
    completedAt: new Date(),
  });

  return {
    stats: finalJob.stats,
    results: finalJob.results,
  };
}

// Internal — process one page
async function crawlPage(entry, context) {
  const { pageUrl, depth } = entry;
  const { jobId, baseUrl, maxDepth, ignore, noRobots, queue, onResult } =
    context;

  const job = getJob(jobId);
  if (!job || isCancelled(jobId)) return;

  // Skip pages already crawled
  if (job.visitedUrls.has(pageUrl)) return;
  job.visitedUrls.add(pageUrl);

  // Robots.txt check for this page
  if (!noRobots) {
    const allowed = await isAllowed(pageUrl);
    if (!allowed) return;
  }

  // Fetch and parse the page
  const { links, error: parseError } = await parsePage(pageUrl, baseUrl);

  if (parseError) {
    // Page itself failed — record it and move on
    const result = {
      url: pageUrl,
      sourceUrl: pageUrl,
      status: null,
      type: 'error',
      finalUrl: null,
      responseTime: 0,
      error: parseError,
      depth,
    };
    addResult(jobId, result);
    onResult(result);
    return;
  }

  // Check each link found on this page
  await Promise.all(
    links.map((link) =>
      checkPageLink(link, {
        jobId,
        baseUrl,
        sourceUrl: pageUrl,
        maxDepth,
        depth,
        ignore,
        noRobots,
        queue,
        onResult,
      }),
    ),
  );
}

// Internal — check one link, enqueue if internal
async function checkPageLink(link, context) {
  const { href, type } = link;
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

  // Skip already-checked links (across all pages)
  if (job.checkedLinks.has(href)) return;
  job.checkedLinks.add(href);

  // Skip ignored patterns
  if (shouldIgnore(href, ignore)) return;

  // Ping the link
  const result = await checkLink(href);

  const fullResult = {
    ...result,
    sourceUrl,
    linkType: type, // internal | external
    depth,
  };

  addResult(jobId, fullResult);
  onResult(fullResult);

  // Enqueue internal pages for further crawling if within depth
  const isInternal = isSameDomain(href, baseUrl);
  const withinDepth = depth < maxDepth;
  const notVisited = !job.visitedUrls.has(href);
  const isLiveOrRedirect = ['live', 'redirect'].includes(result.type);

  if (isInternal && withinDepth && notVisited && isLiveOrRedirect) {
    queue.push({ pageUrl: href, depth: depth + 1 });
  }
}
