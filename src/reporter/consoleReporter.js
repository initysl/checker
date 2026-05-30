import Table from 'cli-table3';
import chalk from 'chalk';

const TYPE_CONFIG = {
  live: { icon: '✅', color: chalk.green, label: 'LIVE' },
  broken: { icon: '❌', color: chalk.red, label: 'BROKEN' },
  redirect: { icon: '⚠️ ', color: chalk.yellow, label: 'REDIRECT' },
  error: { icon: '💥', color: chalk.red, label: 'ERROR' },
};

/**
 * Print the full results table + summary to terminal.
 *
 * @param {object} opts
 * @param {string}   opts.url        - Seed URL
 * @param {object}   opts.stats      - { total, live, broken, redirects, errors }
 * @param {object[]} opts.results    - Array of link results
 * @param {boolean}  opts.onlyBroken - Filter to broken/error only
 * @param {number}   opts.elapsed    - Total time in ms
 */
export function printReport({ url, stats, results, onlyBroken, elapsed }) {
  const filtered = onlyBroken
    ? results.filter((r) => r.type === 'broken' || r.type === 'error')
    : results;

  _printBanner(url);

  if (filtered.length === 0) {
    console.log(chalk.dim('  No results to display.'));
  } else {
    _printByType(filtered, onlyBroken);
  }

  _printSummary(stats, elapsed);
}

// Internal
function _printBanner(url) {
  console.log();
  console.log(chalk.bold('  Checker Report'));
  console.log(chalk.dim(`  ${url}`));
  console.log();
}

function _printByType(results, onlyBroken) {
  // Group results by type
  const groups = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  }

  // Print each group in order
  const order = onlyBroken
    ? ['broken', 'error']
    : ['broken', 'error', 'redirect', 'live'];

  for (const type of order) {
    if (!groups[type]?.length) continue;
    _printGroup(type, groups[type]);
  }
}

function _printGroup(type, results) {
  const { icon, color, label } = TYPE_CONFIG[type];

  console.log(color(`  ${icon}  ${label} (${results.length})`));
  console.log();

  const table = new Table({
    head: [
      chalk.dim('URL'),
      chalk.dim('Status'),
      chalk.dim('Found On'),
      chalk.dim('Time'),
    ],
    style: {
      head: [],
      border: ['dim'],
    },
    colWidths: [50, 10, 40, 10],
    wordWrap: true,
  });

  for (const r of results) {
    const status = r.status ? String(r.status) : 'ERR';
    const sourceUrl = r.sourceUrl
      ? r.sourceUrl.replace(/^https?:\/\/[^/]+/, '') || '/'
      : '—';
    const url = r.url.length > 48 ? r.url.slice(0, 45) + '...' : r.url;

    table.push([
      color(url),
      color(status),
      chalk.dim(sourceUrl),
      chalk.dim(`${r.responseTime}ms`),
    ]);
  }

  console.log(table.toString());
  console.log();
}

function _printSummary(stats, elapsed) {
  console.log(chalk.dim('  ' + '-'.repeat(43)));
  console.log(chalk.bold('  Summary'));
  console.log(chalk.dim('  ' + '-'.repeat(43)));
  console.log(`  Total checked  : ${chalk.bold(stats.total)}`);
  console.log(`  ${chalk.green('✅ Live')}         : ${stats.live}`);
  console.log(`  ${chalk.red('❌ Broken')}       : ${stats.broken}`);
  console.log(`  ${chalk.yellow('⚠️  Redirects')}    : ${stats.redirects}`);
  console.log(`  ${chalk.red('💥 Errors')}       : ${stats.errors}`);
  console.log();
  console.log(chalk.dim(`  Completed in ${(elapsed / 1000).toFixed(1)}s`));
  console.log();
}
