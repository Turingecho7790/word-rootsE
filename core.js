(() => {
  const roles = { prefix: '前缀', root: '词根', suffix: '后缀' };
  const score = { family: 30, root: 20, prefix: 10, suffix: 5 };
  const names = { family: '同词族', root: '同词根', prefix: '同前缀用法', suffix: '同后缀用法' };
  const intervals = [1, 3, 7, 14, 30];
  const normalize = word => String(word ?? '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑]/g, '-');
  const validWord = word => typeof word === 'string' && word.length <= 96 && /^[a-z]+(?:[-'][a-z]+)*$/.test(word);
  const shownForm = morph => (morph.role === 'suffix' ? '-' : '') + morph.form + (morph.role === 'prefix' ? '-' : '');
  const emptyState = () => ({ version: 1, types: [], morphemes: [], words: [], analyses: {}, cards: {} });

  function placeSegments(word, ids, morphemes) {
    const segments = [];
    let cursor = 0;
    for (const id of ids) {
      const form = morphemes.get(id)?.form;
      const start = form ? word.indexOf(form, cursor) : -1;
      if (start < 0) throw new Error(word + ' 缺少词素 ' + id);
      cursor = start + form.length;
      segments.push({ id, start, end: cursor });
    }
    return segments;
  }

  function indexed(seed, dictionary, state) {
    const morphemes = new Map([...seed.morphemes, ...state.morphemes].map(item => [item.id, item]));
    const types = new Map([...seed.types, ...state.types].map(item => [item.id, item]));
    const entries = new Map();
    const exact = new Map();
    const forms = new Map();
    const relations = new Map();
    const definitions = new Map();

    function addRef(map, key, item) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }

    for (const item of [...seed.entries, ...state.words]) {
      const segments = placeSegments(item.word, item.segments ?? [], morphemes);
      const entry = { ...item, segments };
      entries.set(item.id, entry);
      addRef(exact, item.word, entry);
      for (const form of item.forms ?? []) addRef(forms, form, entry);
      if (item.family) addRef(relations, 'family:' + item.family, entry);
      for (const segment of state.analyses[item.id]?.segments ?? segments) {
        const morph = morphemes.get(segment.id);
        if (morph) addRef(relations, relationKey(morph), entry);
      }
    }
    for (const [word, phonetic, gloss, aliases, details] of dictionary) {
      const entry = { id: 'dict:' + word, word, phonetic, gloss, mode: '词典释义', segments: [],
        ...details, source: details?.source ?? (details ? '' : 'https://github.com/skywind3000/ECDICT') };
      const last = definitions.has(word);
      if (!last) {
        definitions.set(word, entry);
        entries.set(entry.id, entry);
        for (const segment of state.analyses[entry.id]?.segments ?? []) {
          const morph = morphemes.get(segment.id);
          if (morph) addRef(relations, relationKey(morph), entry);
        }
      }
      for (const alias of aliases ?? []) {
        if (!forms.has(alias) || forms.get(alias).every(found => found.id.startsWith('dict:'))) addRef(forms, alias, entry);
      }
    }
    const byRole = { prefix: [], root: [], suffix: [] };
    for (const morph of morphemes.values()) byRole[morph.role].push(morph);
    return { morphemes, types, entries, exact, forms, relations, definitions, byRole };
  }

  function relationKey(morph) {
    return morph.role + ':' + (morph.group ?? morph.id);
  }

  function lookup(index, input) {
    const word = normalize(input);
    if (!validWord(word)) return { word, entries: [], invalid: true };
    const exact = [...(index.exact.get(word) ?? [])];
    const aliases = [...new Map((index.forms.get(word) ?? []).map(entry => [entry.id, entry])).values()];
    if (exact.length) return { word, entries: exact };
    const knownAliases = aliases.filter(entry => !entry.id.startsWith('dict:'));
    if (knownAliases.length) return { word, entries: knownAliases, alias: true };
    if (index.definitions.has(word)) return { word, entries: [index.definitions.get(word)] };
    if (aliases.length) return { word, entries: aliases, alias: true };
    return { word, entries: [] };
  }

  function matchCandidate(index, word, pos = '') {
    const prefixes = index.byRole.prefix.filter(morph => word.startsWith(morph.form)
      && (!morph.condition || morph.condition.includes(word[morph.form.length])));
    const suffixes = index.byRole.suffix.filter(morph => morph.form && word.includes(morph.form));
    const longest = matches => matches.sort((a, b) => b.segments.length - a.segments.length).slice(0, 4);
    const matches = [];
    for (const pre of [null, ...prefixes]) {
      const start = pre?.form.length ?? 0;
      const memo = new Map();
      function endingAt(end) {
        if (memo.has(end)) return memo.get(end);
        const base = word.slice(start, end);
        const options = (pre || end < word.length) ? index.byRole.root
          .filter(morph => morph.form === base)
          .map(root => ({ segments: [{ id: root.id, start, end }] })) : [];
        for (const suffix of suffixes) {
          const offset = end - suffix.form.length;
          if (offset <= start || word.slice(offset, end) !== suffix.form) continue;
          // The outermost suffix determines the whole word's part of speech.
          if (end === word.length && pos && suffix.pos && suffix.pos !== pos) continue;
          for (const option of endingAt(offset)) {
            options.push({ segments: [...option.segments, { id: suffix.id, start: offset, end }] });
          }
        }
        const best = longest(options);
        memo.set(end, best);
        return best;
      }
      for (const option of endingAt(word.length)) {
        const segments = pre ? [{ id: pre.id, start: 0, end: start }, ...option.segments] : option.segments;
        matches.push({ segments });
      }
    }
    return longest(matches);
  }

  function chatCommand(input) {
    const match = String(input ?? '').trim().match(/^(?:\/?(?:进入|开启|开始|我想)?\s*(?:聊天对话|聊天|对话)(?:模式)?(?=[\s：:，,。！!]|$)|\/chat(?=[\s：:，,。！!]|$))[\s：:，,。！!]*/iu);
    return match ? String(input).trim().slice(match[0].length) : null;
  }

  function related(index, entry, segments) {
    const results = new Map();
    function add(entries, relation) {
      for (const match of entries ?? []) {
        if (match.word === entry.word) continue;
        const previous = results.get(match.word);
        if (!previous || previous.score < score[relation]) {
          results.set(match.word, { entry: match, relation: names[relation], score: score[relation] });
        }
      }
    }
    if (entry.family) add(index.relations.get('family:' + entry.family), 'family');
    for (const segment of segments) {
      const morph = index.morphemes.get(segment.id);
      if (morph) add(index.relations.get(relationKey(morph)), morph.role);
    }
    return [...results.values()].sort((a, b) => b.score - a.score || a.entry.word.localeCompare(b.entry.word));
  }

  function suggestions(index, word) {
    const unique = new Set([...index.exact.keys(), ...index.definitions.keys()]);
    const prefix = word.slice(0, Math.max(2, Math.min(word.length - 1, 4)));
    if (prefix.length < 2) return [];
    return [...unique].filter(item => item.startsWith(prefix) && item !== word)
      .sort((a, b) => Math.abs(a.length - word.length) - Math.abs(b.length - word.length) || a.localeCompare(b)).slice(0, 6);
  }

  function validateSegments(word, segments, morphemes) {
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    let cursor = 0;
    let previousRole = 'prefix';
    for (const [position, segment] of sorted.entries()) {
      const { start, end, id } = segment;
      const morph = morphemes.get(id);
      if (!morph || !Number.isInteger(start) || !Number.isInteger(end)
        || start < cursor || end <= start || end > word.length) throw new Error('请检查词素选择和字母位置，各片段不能重叠。');
      const text = word.slice(start, end);
      if (text !== morph.form) throw new Error(text + ' 与所选词素 ' + shownForm(morph) + ' 拼写不一致。请改选词素或新增变体。');
      if ((morph.role === 'prefix' && (start !== cursor || previousRole !== 'prefix'))
        || (morph.role === 'root' && previousRole === 'suffix')
        || (morph.role === 'suffix' && end !== word.length && sorted[position + 1]?.start !== end)) {
        throw new Error('请检查前缀、后缀的位置。');
      }
      cursor = end;
      previousRole = morph.role;
    }
    return sorted;
  }

  function makeCard(entry, segments, index, mode = '') {
    return {
      id: entry.id, word: entry.word, pos: entry.pos ?? '', gloss: entry.gloss ?? '',
      phonetic: entry.phonetic ?? '', example: entry.example ?? '', meaningNote: entry.note ?? '',
      source: entry.source ?? '', sourceLabel: entry.sourceLabel ?? '', license: entry.license ?? '',
      mode, pieces: segments.map(segment => {
        const morph = index.morphemes.get(segment.id);
        return { form: shownForm(morph), role: morph.role, gloss: morph.gloss };
      }),
      created: Date.now(), due: Date.now(), level: 0, note: ''
    };
  }

  function grade(card, known, now = Date.now()) {
    const level = Number.isInteger(card.level) ? Math.max(0, Math.min(card.level, intervals.length)) : 0;
    const wait = known ? intervals[Math.min(level, intervals.length - 1)] * 86400000 : 600000;
    return { ...card, level: known ? Math.min(level + 1, intervals.length) : 0, due: now + wait };
  }

  function requireShape(value, seed) {
    if (!value || value.version !== 1) throw new Error('请选择词源笔记导出的备份。');
    for (const key of ['types', 'morphemes', 'words']) {
      if (!Array.isArray(value[key]) || value[key].length > 10000) throw new Error('备份缺少有效的 ' + key + '。');
    }
    for (const key of ['analyses', 'cards']) {
      if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])
        || Object.keys(value[key]).length > 10000) throw new Error('备份缺少有效的 ' + key + '。');
    }
    const nonempty = text => typeof text === 'string' && text.trim().length > 0 && text.length <= 1000;
    const ids = new Set([...seed.types, ...seed.morphemes, ...seed.entries].map(item => item.id));
    for (const item of [...value.types, ...value.morphemes, ...value.words]) {
      if (!item || typeof item.id !== 'string' || !/^user:[a-z0-9:.-]+$/.test(item.id) || ids.has(item.id)) throw new Error('备份含无效或重复的 ID。');
      ids.add(item.id);
    }
    const types = new Map([...seed.types, ...value.types].map(item => [item.id, item]));
    for (const item of value.types) {
      if (!Object.hasOwn(roles, item.role) || !nonempty(item.name)) throw new Error('备份包含无效的词素类型。');
    }
    const morphemes = new Map([...seed.morphemes, ...value.morphemes].map(item => [item.id, item]));
    for (const item of value.morphemes) {
      if (!Object.hasOwn(roles, item.role) || !nonempty(item.form) || !/^[a-z]+$/.test(item.form) || !nonempty(item.gloss)
        || !Array.isArray(item.tags) || item.tags.some(tag => types.get(tag)?.role !== item.role)) {
        throw new Error('备份包含无效的词素。');
      }
    }
    const words = new Map([...seed.entries, ...value.words].map(item => [item.id, item]));
    for (const item of value.words) {
      if (!validWord(item.word) || !nonempty(item.gloss) || typeof item.pos !== 'string'
        || (item.segments?.length ?? 0) !== 0 || (item.forms?.length ?? 0) !== 0) {
        throw new Error('备份包含无效的个人词条。');
      }
    }
    for (const [id, analysis] of Object.entries(value.analyses)) {
      const word = words.get(id)?.word ?? (id.startsWith('dict:') && validWord(id.slice(5)) ? id.slice(5) : '');
      if (!word || !Array.isArray(analysis?.segments) || analysis.segments.length > 96) throw new Error('备份包含无法关联词条的拆词。');
      validateSegments(word, analysis.segments, morphemes);
    }
    for (const [id, card] of Object.entries(value.cards)) {
      if (!card || card.id !== id || typeof card.word !== 'string' || !validWord(card.word) || typeof card.gloss !== 'string' || !Number.isFinite(card.due)
        || Math.abs(card.due) > 8.64e15 || !Array.isArray(card.pieces) || card.pieces.some(piece => !piece
          || !Object.hasOwn(roles, piece.role) || !nonempty(piece.form) || !nonempty(piece.gloss))) {
        throw new Error('备份包含无效的词卡。');
      }
    }
    return value;
  }

  globalThis.WordRootsCore = { roles, normalize, validWord, shownForm, emptyState, indexed, lookup, matchCandidate, chatCommand, related,
    relationKey, suggestions, validateSegments, makeCard, grade, requireShape };
})();
