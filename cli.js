#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;
const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open the original URL in your browser
  snip help         Show this help

Set SNIP_API to change the backend URL (default: ${DEFAULT_API_URL}).
`;

function parseCommand(args) {
  if (args.length === 0 || args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    return { name: 'help' };
  }

  const [name, ...values] = args;
  if (name === 'add' && values.length === 1) return { name, value: values[0] };
  if (name === 'ls' && values.length === 0) return { name };
  if (name === 'open' && values.length === 1) return { name, value: values[0] };

  throw new Error(`Invalid command or arguments.\n${USAGE.trimEnd()}`);
}

function validateHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('URL must use HTTP or HTTPS.');
  }
  return url.href;
}

function normalizeApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SNIP_API must use HTTP or HTTPS.');
  }
  return url.href.replace(/\/+$/, '');
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    return {
      response,
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request to the Snip API timed out after ${timeoutMs} ms.`);
    }
    clearTimeout(timer);
    throw new Error(`Could not reach the Snip API: ${error.message}`);
  }
}

async function readJson(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('The Snip API returned invalid JSON.');
  }
}

async function responseError(response) {
  const body = await response.text();
  let detail = body.trim();
  if (body) {
    try {
      const payload = JSON.parse(body);
      if (typeof payload.error === 'string') detail = payload.error;
    } catch {
      // Plain-text API errors are reported as-is.
    }
  }
  return new Error(detail ? `API error (${response.status}): ${detail}` : `API error (${response.status}).`);
}

function validateLink(link) {
  if (!link || typeof link !== 'object'
      || typeof link.code !== 'string'
      || typeof link.url !== 'string'
      || typeof link.shortUrl !== 'string'
      || !Number.isInteger(link.hits)
      || typeof link.createdAt !== 'string') {
    throw new Error('The Snip API returned a link with an invalid shape.');
  }
  return link;
}

function formatLinks(links) {
  if (links.length === 0) return 'No links yet.\n';
  const codeWidth = Math.max(4, ...links.map((link) => link.code.length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  const rows = [
    `${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`,
    ...links.map((link) => `${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`),
  ];
  return `${rows.join('\n')}\n`;
}

function browserCommand(platform, url) {
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '""', url] };
  }
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

function launchBrowser(url, platform = process.platform, spawnImpl = spawn) {
  const { command, args } = browserCommand(platform, url);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function run(args, options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const writeError = (error) => {
    stderr.write(`Error: ${error.message}\n`);
    return 1;
  };

  let command;
  try {
    command = parseCommand(args);
    if (command.name === 'help') {
      stdout.write(USAGE);
      return 0;
    }

    const apiUrl = normalizeApiUrl(options.apiUrl || process.env.SNIP_API || DEFAULT_API_URL);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;

    if (command.name === 'add') {
      const url = validateHttpUrl(command.value);
      const request = await fetchWithTimeout(fetchImpl, `${apiUrl}/api/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      }, timeoutMs);
      try {
        if (request.response.status !== 201) throw await responseError(request.response);
        const link = validateLink(await readJson(request.response));
        stdout.write(`${link.shortUrl}\n`);
        return 0;
      } catch (error) {
        if (request.signal.aborted) {
          throw new Error(`Request to the Snip API timed out after ${timeoutMs} ms.`);
        }
        throw error;
      } finally {
        request.cleanup();
      }
    }

    if (command.name === 'ls') {
      const request = await fetchWithTimeout(fetchImpl, `${apiUrl}/api/links`, {}, timeoutMs);
      try {
        if (request.response.status !== 200) throw await responseError(request.response);
        const links = await readJson(request.response);
        if (!Array.isArray(links)) throw new Error('The Snip API returned an invalid links list.');
        stdout.write(formatLinks(links.map(validateLink)));
        return 0;
      } catch (error) {
        if (request.signal.aborted) {
          throw new Error(`Request to the Snip API timed out after ${timeoutMs} ms.`);
        }
        throw error;
      } finally {
        request.cleanup();
      }
    }

    if (!/^[A-Za-z0-9]{6}$/.test(command.value)) {
      throw new Error('Code must be exactly six alphanumeric characters.');
    }
    const request = await fetchWithTimeout(fetchImpl, `${apiUrl}/${encodeURIComponent(command.value)}`, {
      redirect: 'manual',
    }, timeoutMs);
    try {
      if (request.response.status === 404) throw new Error(`Unknown short code: ${command.value}`);
      if (request.response.status !== 302) throw await responseError(request.response);
      const location = request.response.headers.get('location');
      if (!location) throw new Error('The Snip API redirect did not include a Location header.');
      let target;
      try {
        target = new URL(location, `${apiUrl}/`);
      } catch {
        throw new Error('The Snip API returned an invalid redirect URL.');
      }
      if (!['http:', 'https:'].includes(target.protocol)) {
        throw new Error('The Snip API redirect must use HTTP or HTTPS.');
      }
      await (options.launchBrowser || launchBrowser)(target.href);
      stdout.write(`Opened ${target.href}\n`);
      return 0;
    } catch (error) {
      if (request.signal.aborted) {
        throw new Error(`Request to the Snip API timed out after ${timeoutMs} ms.`);
      }
      throw error;
    } finally {
      request.cleanup();
    }
  } catch (error) {
    return writeError(error instanceof Error ? error : new Error(String(error)));
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  browserCommand,
  formatLinks,
  normalizeApiUrl,
  run,
  validateHttpUrl,
};
