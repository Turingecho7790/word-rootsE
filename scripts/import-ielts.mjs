import { readFile, writeFile } from 'node:fs/promises';
import { openDictionary } from '../dictionary.mjs';

const url = 'https://raw.githubusercontent.com/designfuchen/word-atlas/main/data/word-atlas.json';
const posNames = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.' };

async function importAtlas(file) {
  let payload;
  if (file) {
    payload = await readFile(file, 'utf8');
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('词光下载失败（HTTP ' + response.status + '）。');
    payload = await response.text();
  }
  const items = JSON.parse(payload.replace(/^\uFEFF/, ''));
  if (!Array.isArray(items)) throw new Error('此文件不是词光的公开 JSON 词库。');
  const rows = items.flatMap(item => {
    if (!item || !Array.isArray(item.senses)) return [];
    const senses = item.senses.filter(sense => typeof sense?.zh === 'string' && sense.zh.trim());
    if (!senses.length) return [];
    const poses = senses.map(sense => posNames[sense.pos] ?? sense.pos ?? '');
    const word = item.w ?? item.word;
    if (typeof word !== 'string') return [];
    return [{
      word, pos: poses.every(pos => pos === poses[0]) ? poses[0] : '',
      phonetic: typeof item.uk === 'string' ? item.uk : '', topic: typeof item.topic === 'string' ? item.topic : '',
      gloss: senses.map(sense => sense.zh.trim()).join('；')
    }];
  });
  if (!rows.length) throw new Error('未找到有效的中英词条，现有数据库未修改。');
  const db = openDictionary();
  try {
    const count = db.importRows('atlas', rows);
    if (!count) throw new Error('未找到可查的英语单词。');
    if (!file) await writeFile(new URL('../data/word-atlas.download.json', import.meta.url), payload, 'utf8');
    console.log('已导入 ' + db.info().atlas + ' 条词光词条（CC BY 4.0）。如果服务正在运行，请重启以更新词库统计。');
  } finally { db.close(); }
}

try {
  await importAtlas(process.argv[2]);
} catch (error) {
  console.error('导入词光失败。' + error.message);
  console.error('也可在浏览器下载 JSON 后执行 npm run import:ielts -- "词库文件路径"。');
  process.exitCode = 1;
}
