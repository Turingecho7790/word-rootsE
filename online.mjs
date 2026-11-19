const endpoint = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const source = 'https://en.wiktionary.org/wiki/';
const cache = new Map();
const inFlight = new Map();
const poses = new Map([['noun', 'n.'], ['proper noun', 'n.'], ['verb', 'v.'], ['adjective', 'adj.'], ['adverb', 'adv.']]);
const entities = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' ']]);

function plainText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&(\w+|#\d+|#x[\da-f]+);/gi, (entity, name) => {
    if (entities.has(name)) return entities.get(name);
    if (!name.startsWith('#')) return entity;
    const hex = name[1]?.toLowerCase() === 'x';
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).replace(/\s+/g, ' ').trim();
}

export async function lookupOnline(word) {
  const existing = cache.get(word);
  if (existing?.until > Date.now()) return existing.result;
  if (inFlight.has(word)) return inFlight.get(word);
  const pending = request(word).finally(() => inFlight.delete(word));
  inFlight.set(word, pending);
  return pending;
}

function remember(word, result, duration) {
  cache.delete(word);
  cache.set(word, { result, until: Date.now() + duration });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return result;
}

async function request(word) {
  try {
    const response = await fetch(endpoint + encodeURIComponent(word), { signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (response.status === 404) return remember(word, { status: 'not-found' }, 5 * 60000);
    if (!response.ok) return { status: 'unavailable' };
    const result = await response.json();
    const entries = result?.en;
    if (!Array.isArray(entries)) return remember(word, { status: 'not-found' }, 5 * 60000);
    const definitions = entries.slice(0, 6).flatMap(entry =>
      (Array.isArray(entry?.definitions) ? entry.definitions.slice(0, 2) : [])
        .filter(item => typeof item?.definition === 'string')
        .map(item => ({ pos: poses.get(String(entry.partOfSpeech).toLowerCase()) ?? '', text: plainText(item.definition).slice(0, 500) }))
        .filter(item => item.text));
    if (!definitions.length) return remember(word, { status: 'not-found' }, 5 * 60000);
    const pos = definitions.every(item => item.pos === definitions[0].pos) ? definitions[0].pos : '';
    return remember(word, {
      status: 'hit', entry: {
        word, pos, phonetic: '', gloss: definitions.map(item => [item.pos, item.text].filter(Boolean).join(' ')).join('\n'),
        label: 'Wiktionary · 英文释义', link: source + encodeURIComponent(word), license: 'CC BY-SA 4.0', topic: ''
      }
    }, 10 * 60000);
  } catch {
    return { status: 'unavailable' };
  }
}
