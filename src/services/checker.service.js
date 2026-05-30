import axios from 'axios';
import { config } from '../config.js';

function classify(status) {
  if (status >= 200 && status < 300) return 'live';
  if (status >= 300 && status < 400) return 'redirect';
  return 'broken';
}

/**
 * Ping a single URL and return a structured result.
 * Uses HEAD first, GET fallback on 405/501.
 * Detects redirects by disabling auto-follow and catching the 3xx directly.
 */
export async function checkLink(url) {
  const start = Date.now();

  // maxRedirects: 0 so we see the raw 3xx status instead of the followed 200
  const axiosOptions = {
    timeout: config.timeout,
    maxRedirects: 0,
    headers: { 'User-Agent': config.userAgent },
    validateStatus: () => true, // never throw on any status
  };

  let res = null;
  let error = null;

  try {
    res = await axios.head(url, axiosOptions);

    // Fallback to GET if HEAD not supported
    if (res.status === 405 || res.status === 501) {
      res = await axios.get(url, { ...axiosOptions, responseType: 'stream' });
      res.data?.destroy?.();
    }
  } catch (err) {
    // axios throws on maxRedirects: 0 when it hits a redirect —
    // extract the real status from the response if available
    if (err.response) {
      res = err.response;
    } else {
      error = err.code ?? err.message;
    }
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

  const status = res.status;
  const type = classify(status);
  const finalUrl = type === 'redirect' ? (res.headers?.location ?? null) : null;

  return { url, status, type, finalUrl, responseTime, error: null };
}
