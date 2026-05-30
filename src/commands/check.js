import * as logger from '../utils/logger.js';
import { isValid } from '../utils/urlNormalizer.js';

export async function runCheck(url, options) {
  // Validate URL immediately
  if (!isValid(url)) {
    logger.error(`Invalid URL: "${url}"`);
    logger.dim('Usage: checker <url> [options]');
    process.exit(1);
  }

  logger.blank();
  logger.info(`Target: ${url}`);
  logger.dim(
    `Depth: ${options.depth} | Concurrency: ${options.concurrency} | Timeout: ${options.timeout}ms`,
  );
  logger.blank();
  logger.warn('Crawler not implemented yet — Phase 3 coming next.');
  logger.blank();
}
