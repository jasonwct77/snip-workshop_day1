'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer } = require('node:http');
const {
  browserCommand,
  formatLinks,
  run,
  validateHttpUrl,
} = require('./cli');

let server;
let apiUrl;
let createCount = 0;
let redirectCount = 0;
let links = [];

before(async () => {
  server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/links') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const { url } = JSON.parse(body);
      const link = {
        code: 'Ab12Cd',
        url,
        shortUrl: `http://localhost:${server.address().port}/Ab12Cd`,
        hits: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      links.push(link);
      createCount += 1;
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(link));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/links') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(links));
      return;
    }
    if (request.method === 'GET' && request.url === '/Ab12Cd') {
      redirectCount += 1;
      response.writeHead(302, { location: 'https://example.com/original' });
      response.end();
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function capture() {
  return {
    stdout: { value: '', write(text) { this.value += text; } },
    stderr: { value: '', write(text) { this.value += text; } },
  };
}

test('no arguments prints usage and succeeds', async () => {
  const io = capture();
  assert.equal(await run([], io), 0);
  assert.match(io.stdout.value, /Usage:/);
  assert.equal(io.stderr.value, '');
});

test('rejects invalid URLs without calling the API', async () => {
  const initialCount = createCount;
  const io = capture();
  assert.equal(await run(['add', 'file:///tmp/file'], { ...io, apiUrl }), 1);
  assert.match(io.stderr.value, /HTTP or HTTPS/);
  assert.equal(createCount, initialCount);
  assert.equal(validateHttpUrl('https://example.com'), 'https://example.com/');
});

test('add posts a URL and prints the short URL', async () => {
  links = [];
  const io = capture();
  assert.equal(await run(['add', 'https://example.com/path'], { ...io, apiUrl }), 0);
  assert.match(io.stdout.value, /^http:\/\/localhost:\d+\/Ab12Cd\n$/);
  assert.equal(links[0].url, 'https://example.com/path');
});

test('ls prints an aligned table and handles an empty list', async () => {
  const io = capture();
  assert.equal(await run(['ls'], { ...io, apiUrl }), 0);
  assert.match(io.stdout.value, /CODE\s+HITS\s+URL/);
  assert.match(io.stdout.value, /Ab12Cd\s+0\s+https:\/\/example\.com\/path/);

  links = [];
  const empty = capture();
  assert.equal(await run(['ls'], { ...empty, apiUrl }), 0);
  assert.equal(empty.stdout.value, 'No links yet.\n');
});

test('open reads the redirect manually and launches its Location target', async () => {
  redirectCount = 0;
  let opened;
  const io = capture();
  assert.equal(await run(['open', 'Ab12Cd'], {
    ...io,
    apiUrl,
    launchBrowser: async (url) => { opened = url; },
  }), 0);
  assert.equal(opened, 'https://example.com/original');
  assert.equal(redirectCount, 1);
  assert.match(io.stdout.value, /Opened https:\/\/example\.com\/original/);
});

test('unknown code and unreachable API fail with stderr and exit 1', async () => {
  const unknown = capture();
  assert.equal(await run(['open', 'Xy98Zq'], { ...unknown, apiUrl }), 1);
  assert.match(unknown.stderr.value, /Unknown short code/);

  const unreachable = capture();
  assert.equal(await run(['ls'], {
    ...unreachable,
    apiUrl: 'http://127.0.0.1:1',
    timeoutMs: 100,
  }), 1);
  assert.match(unreachable.stderr.value, /Could not reach the Snip API/);
});

test('slow API requests time out with a clear error', async () => {
  const io = capture();
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  assert.equal(await run(['ls'], {
    ...io,
    apiUrl,
    fetchImpl,
    timeoutMs: 10,
  }), 1);
  assert.match(io.stderr.value, /timed out after 10 ms/);
});

test('browser launch uses the platform command', () => {
  assert.deepEqual(browserCommand('win32', 'https://example.com'), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'start', '""', 'https://example.com'],
  });
  assert.deepEqual(browserCommand('darwin', 'https://example.com'), {
    command: 'open',
    args: ['https://example.com'],
  });
  assert.deepEqual(browserCommand('linux', 'https://example.com'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  });
});

test('formats links into aligned code and hit columns', () => {
  assert.equal(formatLinks([{ code: 'A', hits: 12, url: 'https://x.test' }]),
    'CODE  HITS  URL\nA       12  https://x.test\n');
});
