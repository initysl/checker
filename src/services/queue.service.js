import { v4 as uuidv4 } from 'uuid';

// In-memory job store
const jobs = new Map();

// Create a new crawl job and retune its ID
export function createJob(url, options) {
  const jobId = uuidv4();

  jobs.set(jobId, {
    jobId,
    url,
    oprions,
    status: 'pending', // pending | running | complete | cancelled | error
    results: [],
    stats: {
      total: 0,
      live: 0,
      broken: 0,
      redirects: 0,
      errors: 0,
    },
    visitedUrls: new Set(), // pages already crawled (internal)
    checkedLinks: new Set(), // links already pinged (internal + external)
    startedAt: null,
    completedAt: null,
  });

  return jobId;
}

export function getJob(jobId) {
  return jobs.get(jobId) ?? null;
}

export function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.set(jobId, { ...job, ...patch });
}

//  Push a single link result into the job and update stats
export function addResult(jobId, result) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.results.push(result);
  job.stats.total++;

  const key = {
    live: 'live',
    broken: 'broken',
    redirect: 'redirects',
    error: 'errors',
  }[result.type];
  if (key) job.stats[key]++;
}

export function cancelJob(jobId) {
  updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
}

export function isCancelled(jobId) {
  return getJob(jobId)?.status === 'cancelled';
}
