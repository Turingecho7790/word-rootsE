import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const defaultDatabase = fileURLToPath(new URL('./data/dictionary.sqlite', import.meta.url));
export const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑]/g, '-');
export const validWord = value => typeof value === 'string' && value.length <= 96 && /^[a-z]+(?:[-'][a-z]+)*$/.test(value);
export const sources = {
  starter: { label: '雅思主题起步词表', link: 'README.md' },
  atlas: { label: '词光 · Word Atlas', link: 'https://github.com/designfuchen/word-atlas/blob/main/README.en.md', license: 'CC BY 4.0' },
  ecdict: { label: 'ECDICT', link: 'https://github.com/skywind3000/ECDICT' }
};

export function openDictionary(filename = defaultDatabase) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS word (
      word TEXT NOT NULL, source TEXT NOT NULL, phonetic TEXT NOT NULL,
      gloss TEXT NOT NULL, pos TEXT NOT NULL, topic TEXT NOT NULL,
      PRIMARY KEY (word, source)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS form (
      spelling TEXT NOT NULL, word TEXT NOT NULL, source TEXT NOT NULL,
      PRIMARY KEY (spelling, word, source),
      FOREIGN KEY (word, source) REFERENCES word(word, source) ON DELETE CASCADE
    ) WITHOUT ROWID;
  `);
  const upsert = db.prepare(`
    INSERT INTO word (word,source,phonetic,gloss,pos,topic) VALUES (?,?,?,?,?,?)
    ON CONFLICT(word,source) DO UPDATE SET phonetic=excluded.phonetic, gloss=excluded.gloss,
      pos=excluded.pos, topic=excluded.topic
  `);
  const addForm = db.prepare('INSERT OR IGNORE INTO form (spelling,word,source) VALUES (?,?,?)');
  const priority = "CASE source WHEN 'atlas' THEN 0 WHEN 'ecdict' THEN 1 ELSE 2 END";
  const exact = db.prepare('SELECT * FROM word WHERE word=? ORDER BY ' + priority + ' LIMIT 1');
  const alias = db.prepare('SELECT word.* FROM form JOIN word USING(word,source) WHERE form.spelling=? ORDER BY ' + priority + ', word.word LIMIT 1');
  const suggest = db.prepare('SELECT DISTINCT word FROM word WHERE word>=? AND word<? ORDER BY word LIMIT 9');
  const hasSource = db.prepare('SELECT 1 FROM word WHERE source=? LIMIT 1');

  function importRows(source, rows) {
    if (!Object.hasOwn(sources, source)) throw new Error('未知词库来源。');
    let processed = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const word = normalize(row.word);
        if (!validWord(word) || typeof row.gloss !== 'string' || !row.gloss.trim()) continue;
        upsert.run(word, source, row.phonetic ?? '', row.gloss.trim(), row.pos ?? '', row.topic ?? '');
        for (const value of row.forms ?? []) {
          const form = normalize(value);
          if (validWord(form) && form !== word) addForm.run(form, word, source);
        }
        processed++;
      }
      db.exec('COMMIT');
      return processed;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function ensureStarter() {
    if (hasSource.get('starter')) return;
    const lines = readFileSync(new URL('./data/ielts-starter.tsv', import.meta.url), 'utf8').trim().split(/\r?\n/);
    const rows = lines.slice(1).map(line => {
      const [word, pos, gloss, topic, forms = ''] = line.split('\t');
      return { word, pos, gloss, topic, forms: forms.split('|') };
    });
    importRows('starter', rows);
  }

  function ensureAtlas() {
    if (hasSource.get('atlas')) return;
    const snapshot = readFileSync(new URL('./data/word-atlas-base.jsonl', import.meta.url), 'utf8');
    const rows = snapshot.trimEnd().split(/\r?\n/).map(line => {
      const [word, pos, gloss, phonetic, topic] = JSON.parse(line);
      return { word, pos, gloss, phonetic, topic };
    });
    importRows('atlas', rows);
  }

  function lookup(word) {
    let row = exact.get(word);
    if (!row) {
      const match = alias.get(word);
      if (match) row = exact.get(match.word) ?? match;
    }
    return row ? { ...row, ...sources[row.source] } : null;
  }

  function suggestions(word) {
    const prefix = word.slice(0, Math.max(2, Math.min(word.length - 1, 4)));
    if (prefix.length < 2) return [];
    return suggest.all(prefix, prefix + '\uffff').map(row => row.word).filter(value => value !== word).slice(0, 6);
  }

  function info() {
    const counts = db.prepare('SELECT source,COUNT(*) AS count FROM word GROUP BY source').all();
    return Object.fromEntries(counts.map(row => [row.source, row.count]));
  }

  return { importRows, ensureStarter, ensureAtlas, lookup, suggestions, info, close: () => db.close() };
}
