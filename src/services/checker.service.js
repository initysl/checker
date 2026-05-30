import axios from 'axios';
import { config } from '../config.js';

/**
 * Classify an HTTP status code into one of our result types.
 */
function classify(status) {
  if (status >= 200 && status < 300) return 'live';
  if (status >= 300 && status < 400) return 'redirect';
  return 'broken';
}

/**
 * Ping a single URL and return a structured result.
 * Uses HEAD first for speed, falls back to GET if server refuses HEAD.
 *
 * Returns:
 * {
 *   url, status, type, finalUrl, responseTime, error
 * }
 */
export async function checkLink(url) {
  const start = Date.now();

  const axiosOptions = {
    timeout: config.timeout,
    maxRedirects: config.maxRedirects,
    headers: { 'User-Agent': config.userAgent },
    // Don't throw on 4xx/5xx — we want to capture the status
    validateStatus: () => true,
  };

  let res = null;
  let error = null;

  // Try HEAD first
  try {
    res = await axios.head(url, axiosOptions);

    // Some servers return 405 Method Not Allowed for HEAD — fallback to GET
    if (res.status === 405 || res.status === 501) {
      res = await axios.get(url, { ...axiosOptions, responseType: 'stream' });
      // Destroy stream immediately — we only need headers
      res.data?.destroy?.();
    }
  } catch (err) {
    // Network-level error (DNS, timeout, connection refused)
    error = err.code ?? err.message;
  }

  const responseTime = Date.now() - start;

  if (error || !res) {
    return {
      url,
      status: null,
      type: 'error',
      finalUrl: null,
      responseTime,
      error,
    };
  }

  const finalUrl = res.request?.res?.responseUrl ?? url;
  const type = classify(res.status);

  return {
    url,
    status: res.status,
    type,
    finalUrl: type === 'redirect' ? finalUrl : null,
    responseTime,
    error: null,
  };
}
