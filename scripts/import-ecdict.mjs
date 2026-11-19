import { createReadStream } from 'node:fs';
import { openDictionary } from '../dictionary.mjs';

// ECDICT accepts quoted fields containing commas, escaped quotes or line breaks.
async function* csvRows(path) {
  let row = [];
  let field = '';
  let quoted = false;
  let quotePending = false;
  let atStart = true;
  for await (let chunk of createReadStream(path, { encoding: 'utf8' })) {
    if (atStart) chunk = chunk.replace(/^\uFEFF/, '');
    atStart = false;
    for (const char of chunk) {
      if (quotePending) {
        quotePending = false;
        if (char === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }
      if (quoted) {
        if (char === '"') quotePending = true;
        else field += char;
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        yield row;
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }
  if (quoted && !quotePending) throw new Error('CSV 存在未闭合的引号。');
  if (row.length || field) yield [...row, field.replace(/\r$/, '')];
}

const standardWord = text => String(text ?? '').trim().toLowerCase().replace(/[’‘]/g, "'");
const validWord = text => /^[a-z]+(?:[-'][a-z]+)*$/.test(text) && text.length <= 96;
const clean = value => String(value ?? '').replace(/\\n/g, '\n').trim();
const allowedForms = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);

async function importEcdict(path, limit) {
  const entries = new Map();
  const aliasByLemma = new Map();
  let headers;
  for await (const row of csvRows(path)) {
    if (!headers) {
      headers = new Map(row.map((name, position) => [name.trim().toLowerCase(), position]));
      if (!headers.has('word') || !headers.has('translation')) throw new Error('CSV 必须包含 word 和 translation 两列。');
      continue;
    }
    const word = standardWord(row[headers.get('word')]);
    const translation = clean(row[headers.get('translation')]);
    if (!validWord(word)) continue;
    const aliases = new Set();
    for (const value of (row[headers.get('exchange')] ?? '').split('/')) {
      const [, kind, name] = /^(\w+):(.*)$/.exec(value) ?? [];
      const form = standardWord(name);
      if (!validWord(form) || form === word) continue;
      if (allowedForms.has(kind)) aliases.add(form);
      if (kind === '0') {
        if (!aliasByLemma.has(form)) aliasByLemma.set(form, new Set());
        aliasByLemma.get(form).add(word);
      }
    }
    if (translation && !entries.has(word) && entries.size < limit) {
      entries.set(word, [word, clean(row[headers.get('phonetic')]), translation, aliases]);
    }
  }
  if (!entries.size) throw new Error('没有找到带中文释义的词条。');
  const db = openDictionary();
  try {
    db.importRows('ecdict', [...entries.values()].map(([word, phonetic, gloss, aliases]) => ({
      word, phonetic, gloss, forms: [...new Set([...aliases, ...(aliasByLemma.get(word) ?? [])])]
    })));
  } finally {
    db.close();
  }
  console.log('已导入 ' + entries.size + ' 条 ECDICT 释义。请使用本机服务查词。');
}

const [source, rawLimit] = process.argv.slice(2);
const limit = rawLimit === undefined ? Infinity : Number(rawLimit);
if (!source || !(limit === Infinity || (Number.isInteger(limit) && limit > 0))) {
  console.error('用法  node scripts/import-ecdict.mjs <ECDICT CSV 路径> [最多导入条数]');
  process.exitCode = 1;
} else {
  try {
    await importEcdict(source, limit);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
