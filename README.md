# checker

A fast, zero-config CLI tool that crawls a website and identifies broken links — locally or in production.

```
  ❌ [404] https://mysite.com/old-post           12ms
  ⚠️  [301] https://mysite.com/moved-page         8ms
  ✅ [200] https://mysite.com/about              11ms

  ─────────────────────────────────────────
  Summary
  ─────────────────────────────────────────
  Total checked  : 47
  ✅ Live         : 41
  ❌ Broken       : 4
  ⚠️  Redirects    : 2
  💥 Errors       : 0

  Completed in 4.2s
```

---

## Install

```bash
# Run without installing
npx @initysl/checker https://yoursite.com

# Install globally
npm install -g @initysl/checker
checker https://yoursite.com
```

---

## Usage

```bash
checker <url> [options]
```

### Options

| Flag                     | Default | Description                  |
| ------------------------ | ------- | ---------------------------- |
| `-d, --depth <n>`        | `2`     | Max crawl depth              |
| `-c, --concurrency <n>`  | `5`     | Parallel requests            |
| `-t, --timeout <ms>`     | `8000`  | Request timeout              |
| `-o, --output <file>`    | —       | Export results to JSON       |
| `--ignore <patterns...>` | —       | URL patterns to skip         |
| `--only-broken`          | `false` | Only show broken links       |
| `--exit-code`            | `false` | Exit 1 if broken links found |
| `--no-robots`            | `false` | Skip robots.txt rules        |

---

## Examples

```bash
# Basic crawl
checker https://mysite.com

# Localhost before deploying
checker http://localhost:3000 --depth 2

# Only show broken links
checker https://mysite.com --only-broken

# Ignore API routes and admin pages
checker https://mysite.com --ignore "/api/*" "/admin/*"

# Export full report to JSON
checker https://mysite.com --output report.json

# CI/CD — exit 1 if any broken links found
checker https://mysite.com --exit-code
```

---

## Localhost

Works out of the box against any local dev server — no restrictions, no rate limits:

```bash
# Next.js
npm run dev
checker http://localhost:3000 --depth 2

# Astro / Hugo / Jekyll
npm run build && npm run preview
checker http://localhost:4321

# Any static server
npx serve ./dist
checker http://localhost:3000
```

---

## CI/CD — GitHub Actions

Drop this into your workflow to automatically block deploys with broken links:

```yaml
name: Check for broken links

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  broken-links:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run checker
        run: npx @initysl/checker https://yoursite.com --depth 2 --only-broken --exit-code
```

> The `--exit-code` flag causes the job to fail if any broken links are found, blocking the PR from merging.

### Against a staging environment

```yaml
- name: Deploy to staging
  run: # your deploy step

- name: Check broken links on staging
  run: npx @initysl/checker ${{ secrets.STAGING_URL }} --exit-code --ignore "/api/*"
```

### Save report as artifact

```yaml
- name: Check broken links
  run: npx @initysl/checker https://yoursite.com --output report.json --exit-code || true

- name: Upload report
  uses: actions/upload-artifact@v4
  with:
    name: broken-links-report
    path: report.json
```

---

## JSON Report

Use `--output` to export a full structured report:

```bash
checker https://mysite.com --output report.json
```

```json
{
  "meta": {
    "url": "https://mysite.com",
    "generatedAt": "2026-05-30T10:00:00.000Z",
    "elapsedMs": 4231,
    "options": {
      "depth": 2,
      "concurrency": 5,
      "timeout": 8000,
      "ignore": []
    }
  },
  "stats": {
    "total": 47,
    "live": 41,
    "broken": 4,
    "redirects": 2,
    "errors": 0
  },
  "results": [
    {
      "url": "https://mysite.com/old-post",
      "status": 404,
      "type": "broken",
      "linkType": "internal",
      "sourceUrl": "https://mysite.com/blog",
      "finalUrl": null,
      "responseTime": 12,
      "depth": 1,
      "error": null
    }
  ]
}
```

---

## How it works

```
Seed URL
   ↓
Fetch page → Parse all <a href> links
   ↓
For each link → HEAD request (GET fallback)
   ↓
Classify → live / broken / redirect / error
   ↓
Internal links within depth → enqueue → repeat
```

- **BFS crawl** with configurable depth and concurrency
- **HEAD first** for speed, falls back to GET on `405`
- **Deduplication** — each URL checked exactly once across all pages
- **Binary detection** — images, PDFs, fonts checked but not crawled
- **robots.txt** respected by default
- **Readable errors** — `DNS lookup failed`, `Connection refused`, `Request timed out`

---

## Development

```bash
git clone https://github.com/initysl/checker
cd checker
npm install

# Run
node bin/checker.js https://example.com

# Test
npm test:test

# Test individual phases
npm run test:phase3   # services
npm run test:phase4   # crawler
npm run test:phase5-6 # reporters
npm run test:phase7   # edge cases
```

---

## License

MIT © [initysl](https://github.com/initysl)
