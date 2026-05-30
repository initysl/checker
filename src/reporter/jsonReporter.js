import { writeFile } from 'fs/promises';

/**
 * Write full crawl results to a JSON file.
 *
 * @param {string} filepath  - Output file path
 * @param {object} opts
 * @param {string}   opts.url      - Seed URL
 * @param {object}   opts.options  - Crawl options used
 * @param {object}   opts.stats    - Summary stats
 * @param {object[]} opts.results  - Full results array
 * @param {number}   opts.elapsed  - Total time in ms
 */
export async function writeJson(
  filepath,
  { url, options, stats, results, elapsed },
) {
  const report = {
    meta: {
      url,
      generatedAt: new Date().toISOString(),
      elapsedMs: elapsed,
      options: {
        depth: options.depth,
        concurrency: options.concurrency,
        timeout: options.timeout,
        ignore: options.ignore,
      },
    },
    stats,
    results: results.map((r) => ({
      url: r.url,
      status: r.status,
      type: r.type,
      linkType: r.linkType,
      sourceUrl: r.sourceUrl,
      finalUrl: r.finalUrl,
      responseTime: r.responseTime,
      depth: r.depth,
      error: r.error ?? null,
    })),
  };

  await writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
}
