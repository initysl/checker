import { program } from 'commander';
import { runCheck } from './commands/check.js';

program
  .name('checker')
  .description('Crawl a website and identify broken links')
  .version('1.0.0');

program
  .argument('<url>', 'URL to crawl')
  .option('-d, --depth <number>', 'Max crawl depth', '2')
  .option('-c, --concurrency <number>', 'Parallel requests', '5')
  .option('-t, --timeout <number>', 'Request timeout in ms', '8000')
  .option('-o, --output <file>', 'Export results to JSON file')
  .option('--ignore <patterns...>', 'URL patterns to ignore')
  .option('--only-broken', 'Only show broken links in output')
  .option('--exit-code', 'Exit with code 1 if broken links found')
  .option('--no-robots', 'Skip robots.txt rules')
  .action(runCheck);

program.parse();
