import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openDictionary, normalize, validWord } from './dictionary.mjs';
import { lookupOnline } from './online.mjs';
import { createModel } from './ai.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/data/dictionary.js', ['data/dictionary.js', 'text/javascript; charset=utf-8']],
  ['/data/seed.js', ['data/seed.js', 'text/javascript; charset=utf-8']],
  ['/core.js', ['core.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function json(response, code, body) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

export function createDictionaryServer(dictionary, onlineLookup = lookupOnline, model = createModel()) {
  const info = dictionary.info();
  return createServer((request, response) =>
    serve(request, response, dictionary, info, onlineLookup, model));
}

async function serve(request, response, dictionary, info, onlineLookup, model) {
  let url;
  try { url = new URL(request.url ?? '/', 'http://127.0.0.1'); }
  catch {
    json(response, 400, { status: 'invalid' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/info') {
    json(response, 200, info);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/ai/status') {
    json(response, 200, { status: model.status });
    return;
  }
  if (request.method === 'POST' && ['/api/ai/analyze', '/api/ai/chat'].includes(url.pathname)) {
    await serveModel(request, response, model, url.pathname === '/api/ai/chat' ? 'chat' : 'analyze');
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/lookup') {
    const word = normalize(url.searchParams.get('word'));
    if (!validWord(word)) {
      json(response, 400, { status: 'invalid' });
      return;
    }
    try {
      const entry = dictionary.lookup(word);
      if (entry) {
        json(response, 200, { status: 'hit', entry });
        return;
      }
      const result = url.searchParams.get('online') === '1' ? await onlineLookup(word) : { status: 'not-found' };
      json(response, 200, { ...result, suggestions: result.status === 'hit' ? [] : dictionary.suggestions(word) });
    } catch {
      json(response, 500, { status: 'unavailable' });
    }
    return;
  }
  const file = assets.get(url.pathname);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const contents = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(500).end('Unable to load the requested file');
  }
}

async function serveModel(request, response, model, operation) {
  const { host, origin, 'content-type': type } = request.headers;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host ?? '')
    || (origin && origin !== 'http://' + host)) {
    json(response, 403, { status: 'forbidden' });
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(type ?? '')) {
    json(response, 415, { status: 'invalid' });
    return;
  }
  if (model.status !== 'ready') {
    json(response, 503, { status: model.status });
    return;
  }
  const controller = new AbortController();
  response.once('close', () => controller.abort());
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      bytes += chunk.length;
      if (bytes > 64 * 1024) {
        request.resume();
        json(response, 413, { status: 'invalid' });
        return;
      }
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = await model[operation](input, controller.signal);
    if (!response.destroyed) json(response, result.status === 'invalid' ? 400 : 200, result);
  } catch {
    if (!response.destroyed) json(response, 400, { status: 'invalid' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.WORD_ROOTS_PORT || 4173);
  const dictionary = openDictionary();
  dictionary.ensureStarter();
  dictionary.ensureAtlas();
  createDictionaryServer(dictionary).listen(port, '127.0.0.1', () => {
    console.log('词源笔记  http://127.0.0.1:' + port);
  });
}
