import chalk from 'chalk';

const ICONS = {
  live: '✅',
  broken: '❌',
  redirect: '⚠️ ',
  error: '💥',
  info: 'ℹ️ ',
  warn: '⚠️ ',
};

/**
 * Print a single link result as it comes in during crawl.
 */
export function live(result) {
  const { url, status, type, responseTime } = result;
  const icon = ICONS[type] ?? '•';
  const statusText = status ? chalk.dim(`[${status}]`) : chalk.dim('[ERR]');
  const time = chalk.dim(`${responseTime}ms`);

  const urlText =
    {
      live: chalk.green(url),
      broken: chalk.red(url),
      redirect: chalk.yellow(url),
      error: chalk.red(url),
    }[type] ?? url;

  console.log(`  ${icon} ${statusText} ${urlText} ${time}`);
}

export function info(msg) {
  console.log(chalk.cyan(`${ICONS.info}  ${msg}`));
}

export function warn(msg) {
  console.log(chalk.yellow(`${ICONS.warn}  ${msg}`));
}

export function error(msg) {
  console.log(chalk.red(`💥 ${msg}`));
}

export function dim(msg) {
  console.log(chalk.dim(msg));
}

export function blank() {
  console.log();
}
