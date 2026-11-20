import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createModel } from '../ai.mjs';
import { createDictionaryServer } from '../serve.mjs';
import { openDictionary } from '../dictionary.mjs';

const core = globalThis.WordRootsCore;
const seed = globalThis.WordRootsSeed;
const configuration = {
  WORD_ROOTS_AI_BASE_URL: 'https://model.example/v1',
  WORD_ROOTS_AI_MODEL: 'test-model',
  WORD_ROOTS_AI_API_KEY: 'test-key'
};

test('stacked suffixes use the outer suffix for whole-word part of speech', () => {
  const index = core.indexed(seed, [], core.emptyState());
  const candidates = core.matchCandidate(index, 'unhelpfulness', 'n.');
  assert.deepEqual(candidates.map(candidate => candidate.segments.map(({ id }) => id)),
    [['pre-un', 'root-help', 'suf-ful', 'suf-ness']]);
  assert.deepEqual(core.matchCandidate(index, 'unhelpfulness', 'adj.'), []);
  assert.equal(core.matchCandidate(index, 'unhelpful', 'adj.')[0].segments.length, 3);
});

test('commands switch to chat while English headwords stay searchable', () => {
  assert.equal(core.chatCommand('聊天对话'), '');
  assert.equal(core.chatCommand('开启对话模式：你好'), '你好');
  assert.equal(core.chatCommand('/chat hello'), 'hello');
  assert.equal(core.chatCommand('chat'), null);
  assert.equal(core.chatCommand('conversation'), null);
});

test('dictionary lookup, AI validation and plain chat work through their HTTP routes', async t => {
  const calls = [];
  const model = createModel(configuration, async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, headers: options.headers, payload });
    const last = payload.messages.at(-1).content;
    let content = '你好！可以聊聊英语学习。';
    if (last.startsWith('{')) {
      const { word, rules } = JSON.parse(last);
      assert.ok(rules.some(rule => rule.id === 'user:counter'));
      const text = word === 'counterintuitive' ? 'intuitive' : 'wrong';
      content = JSON.stringify({
        parts: [
          { text: 'counter', role: 'prefix', id: 'user:counter', meaning: '忽略模型对已登记词素的释义' },
          { text, role: 'root', id: '', meaning: '直觉的' }
        ],
        reason: '按现有前缀和词义拆分。'
      });
    }
    return Response.json({ choices: [{ message: { content } }] });
  });
  const db = openDictionary(':memory:');
  db.ensureStarter();
  db.ensureAtlas();
  const server = createDictionaryServer(db, async word => ({
    status: 'hit', entry: { word, pos: 'adj.', gloss: 'Contrary to intuition.' }
  }), model).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const get = async path => (await fetch(url + path)).json();
  const post = (path, input, origin = url) => fetch(url + path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });

  assert.deepEqual(await get('/api/ai/status'), { status: 'ready' });
  assert.equal((await get('/api/lookup?word=habitat')).entry.source, 'atlas');
  assert.equal((await get('/api/lookup?word=counterintuitive')).status, 'not-found');
  const { entry } = await get('/api/lookup?word=counterintuitive&online=1');
  const morphemes = [{ id: 'user:counter', role: 'prefix', form: 'counter', gloss: '相反、反对' }];
  const payload = { word: entry.word, pos: entry.pos, gloss: entry.gloss, morphemes };

  assert.equal((await post('/api/ai/analyze', payload, 'https://unrelated.example')).status, 403);
  const split = await (await post('/api/ai/analyze', payload)).json();
  assert.equal(split.status, 'hit');
  assert.deepEqual(split.parts.map(({ text, meaning, start, end }) => ({ text, meaning, start, end })), [
    { text: 'counter', meaning: '相反、反对', start: 0, end: 7 },
    { text: 'intuitive', meaning: '直觉的', start: 7, end: 16 }
  ]);
  assert.equal(calls[0].url, 'https://model.example/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
  assert.match(calls[0].payload.messages[0].content, /最外层后缀/);
  assert.equal(JSON.parse(calls[0].payload.messages[1].content).gloss, entry.gloss);

  const invalid = await (await post('/api/ai/analyze', { ...payload, word: 'counterproductive' })).json();
  assert.equal(invalid.status, 'invalid-response');
  const messages = [
    { role: 'user', content: '你好' }, { role: 'assistant', content: '你好呀' },
    { role: 'user', content: '聊聊英语学习' }
  ];
  const chat = await (await post('/api/ai/chat', { messages })).json();
  assert.equal(chat.reply, '你好！可以聊聊英语学习。');
  assert.match(calls.at(-1).payload.messages[0].content, /自然对话/);
  assert.deepEqual(calls.at(-1).payload.messages.slice(1), messages);
});
