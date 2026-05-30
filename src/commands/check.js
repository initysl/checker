import ora from 'ora';
import * as logger from '../utils/logger.js';
import { isValid } from '../utils/urlNormalizer.js';
import { startCrawl } from '../services/crawler.service.js';

export async function runCheck(url, options) {
  // Validate
  if (!isValid(url)) {
    logger.error(`Invalid URL: "${url}"`);
    logger.dim('Usage: checker <url> [options]');
    process.exit(1);
  }

  const opts = {
    depth: Number(options.depth),
    concurrency: Number(options.concurrency),
    timeout: Number(options.timeout),
    ignore: options.ignore ?? [],
    noRobots: options.robots === false,
    output: options.output ?? null,
    onlyBroken: options.onlyBroken ?? false,
    exitCode: options.exitCode ?? false,
  };

  // Header
  logger.blank();
  logger.info(`Target      : ${url}`);
  logger.dim(`Depth       : ${opts.depth}`);
  logger.dim(`Concurrency : ${opts.concurrency}`);
  logger.dim(`Timeout     : ${opts.timeout}ms`);
  if (opts.ignore.length) logger.dim(`Ignoring    : ${opts.ignore.join(', ')}`);
  logger.blank();

  // Spinner + live results
  const spinner = ora('Starting crawl...').start();
  let checked = 0;

  function onResult(result) {
    checked++;
    spinner.text = `Checking links... ${checked} found`;

    // Print result below spinner if broken/error (always show) or if not --only-broken
    if (
      !opts.onlyBroken ||
      result.type === 'broken' ||
      result.type === 'error'
    ) {
      spinner.clear();
      logger.live(result);
      spinner.render();
    }
  }

  // Run crawler
  let stats, results;

  try {
    ({ stats, results } = await startCrawl(url, opts, onResult));
    spinner.succeed(`Done — ${checked} links checked`);
  } catch (err) {
    spinner.fail(`Crawl failed: ${err.message}`);
    process.exit(1);
  }

  // Summary
  logger.blank();
  logger.dim('─'.repeat(45));
  logger.info('Summary');
  logger.dim('─'.repeat(45));
  console.log(`  Total checked : ${stats.total}`);
  console.log(`  ✅ Live       : ${stats.live}`);
  console.log(`  ❌ Broken     : ${stats.broken}`);
  console.log(`  ⚠️  Redirects  : ${stats.redirects}`);
  console.log(`  💥 Errors     : ${stats.errors}`);
  logger.blank();

  // JSON export
  if (opts.output) {
    const { writeFile } = await import('fs/promises');
    const report = {
      url,
      options: opts,
      stats,
      results,
      generatedAt: new Date(),
    };
    await writeFile(opts.output, JSON.stringify(report, null, 2));
    logger.info(`Report saved to ${opts.output}`);
    logger.blank();
  }

  // Exit code for CI/CD
  if (opts.exitCode && stats.broken > 0) {
    process.exit(1);
  }
}
