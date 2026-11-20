(() => {
  const core = globalThis.WordRootsCore;
  const seed = globalThis.WordRootsSeed;
  const runningOnFile = location.protocol === 'file:';
  let legacyDictionary = [];
  const bridgeEntries = new Map();
  let checkingEntry = null;
  let lookupNote = '';
  let remoteSuggestions = [];
  let modelStatus = 'disabled';
  let modelReady;
  let checkingAnalysis = null;
  let aiAnalysis = null;
  let aiNote = '';
  let chatMessages = [];
  let chatRequest = null;
  let chatNote = '';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const sourceLink = url => typeof url === 'string' && /^https:\/\//.test(url)
    ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">查看来源</a>' : '';
  const id = () => 'user:' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const posOptions = [['n.', '名词'], ['v.', '动词'], ['adj.', '形容词'], ['adv.', '副词'], ['', '其他或未标注']];
  const own = (obj, key) => Object.hasOwn(obj, key) ? obj[key] : undefined;
  const cacheKey = 'word-roots-e-v1';
  let database;
  let data = core.emptyState();
  let index;
  let activePage = 'search';
  let queried = 'collaboration';
  let selectedSense = '';
  let selectedMorph = '';
  let relatedExpanded = false;
  let usePersonal = true;
  let candidateIndex = -1;
  let selectedRelatives = new Set();
  let reveal = new Set();
  let cardFilter = 'all';
  let toastTimer;

  function openDatabase() {
    return new Promise(resolve => {
      if (location.protocol === 'file:' || !globalThis.indexedDB) return resolve(null);
      const request = indexedDB.open(cacheKey, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('personal');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    });
  }

  function readFallback() {
    try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); }
    catch { return null; }
  }

  function readPersonal() {
    if (!database) return Promise.resolve(readFallback());
    return new Promise(resolve => {
      const operation = database.transaction('personal').objectStore('personal').get('state');
      operation.onsuccess = () => resolve(operation.result ?? readFallback());
      operation.onerror = () => resolve(readFallback());
    });
  }

  function keepFallback() {
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); }
    catch { notice('浏览器无法保存数据，请从「我的词卡」导出备份。'); }
  }

  function persist() {
    if (database) {
      const transaction = database.transaction('personal', 'readwrite');
      transaction.objectStore('personal').put(data, 'state');
      transaction.onerror = keepFallback;
    } else {
      keepFallback();
    }
    reindex();
  }

  function reindex() {
    index = core.indexed(seed, runningOnFile ? legacyDictionary : [...bridgeEntries.values()], data);
    const count = Object.keys(data.cards).length;
    $('#card-count').hidden = count === 0;
    $('#card-count').textContent = count;
  }

  function notice(message) {
    const box = $('#notice');
    clearTimeout(toastTimer);
    box.textContent = message;
    box.hidden = false;
    toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  function context() {
    const result = core.lookup(index, queried);
    const entry = result.entries.find(item => item.id === selectedSense) ?? result.entries[0]
      ?? { word: result.word, segments: [], gloss: '' };
    const personal = entry.id ? own(data.analyses, entry.id) : null;
    const analysis = usePersonal && personal ? personal : null;
    const matching = !entry.segments.length && !analysis && !result.invalid
      ? core.matchCandidate(index, entry.word, entry.pos) : [];
    const candidate = matching[candidateIndex] ?? (matching.length === 1 ? matching[0] : null);
    const segments = analysis?.segments ?? candidate?.segments ?? entry.segments;
    const mode = analysis ? '个人拆词' : candidate ? '候选拆法' : entry.mode ?? '构词';
    return { result, entry, personal, matching, segments, mode, candidate };
  }

  function goTo(page) {
    activePage = page;
    for (const type of ['search', 'cards', 'lexicon', 'chat']) $('#' + type + '-page').hidden = type !== page;
    for (const button of document.querySelectorAll('nav [data-page]')) {
      if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (page === 'search') renderSearch();
    if (page === 'cards') renderCards();
    if (page === 'lexicon') renderLexicon();
    if (page === 'chat') renderChat();
  }

  function query(input, sense = '') {
    checkingEntry?.abort();
    checkingEntry = null;
    checkingAnalysis?.abort();
    checkingAnalysis = null;
    aiAnalysis = null;
    aiNote = '';
    lookupNote = '';
    remoteSuggestions = [];
    queried = core.normalize(input);
    selectedSense = sense;
    selectedMorph = '';
    relatedExpanded = false;
    usePersonal = true;
    candidateIndex = -1;
    selectedRelatives = new Set();
    $('#query').value = input;
    goTo('search');
    if (!runningOnFile && core.validWord(queried) && !core.lookup(index, queried).entries.length) {
      fetchEntry(queried, $('#online-lookup').checked);
    } else {
      analyzeIfNeeded();
    }
  }

  async function fetchEntry(word, online) {
    const request = new AbortController();
    checkingEntry = request;
    lookupNote = online ? '正在查询词库，缺词时会联网补查。' : '正在查询本机 SQLite 词库。';
    renderSearch();
    try {
      const url = '/api/lookup?word=' + encodeURIComponent(word) + (online ? '&online=1' : '');
      const response = await fetch(url, { signal: request.signal });
      const result = await response.json();
      if (request !== checkingEntry) return;
      if (result.status === 'hit') {
        const entry = result.entry;
        const aliases = new Set(bridgeEntries.get(entry.word)?.[3] ?? []);
        if (word !== entry.word) aliases.add(word);
        bridgeEntries.delete(entry.word);
        bridgeEntries.set(entry.word, [entry.word, entry.phonetic, entry.gloss, [...aliases], {
          pos: entry.pos, source: entry.link, sourceLabel: entry.label, topic: entry.topic, license: entry.license
        }]);
        if (bridgeEntries.size > 60) bridgeEntries.delete(bridgeEntries.keys().next().value);
        reindex();
      }
      remoteSuggestions = result.suggestions ?? [];
      lookupNote = result.status === 'unavailable'
        ? (online ? '联网词典暂不可用。可以查看候选拆法或手动添加。' : '本机词库暂不可用。')
        : result.status === 'not-found'
          ? (online ? '本机和联网词典都未收录此词。' : '本机词库未收录此词，可开启联网补查。')
          : '';
    } catch (error) {
      if (request !== checkingEntry || error.name === 'AbortError') return;
      lookupNote = '连接本机词库失败。';
    } finally {
      if (request === checkingEntry) {
        checkingEntry = null;
        if (activePage === 'search') renderSearch();
        analyzeIfNeeded();
      }
    }
  }

  const modelLabels = {
    ready: 'AI 已配置',
    disabled: '配置 .env 并重启服务后即可使用 AI。',
    misconfigured: '请检查 .env 中的模型地址和模型 ID，再重启服务。',
    unreachable: '无法读取 AI 配置，请确认本机服务已升级至 v0.3。'
  };

  async function loadModelStatus() {
    if (runningOnFile) return;
    try {
      const response = await fetch('/api/ai/status');
      const result = response.ok ? await response.json() : {};
      modelStatus = Object.hasOwn(modelLabels, result.status) ? result.status : 'unreachable';
    } catch {
      modelStatus = 'unreachable';
    }
    $('#model-summary').textContent = modelLabels[modelStatus];
    if (activePage === 'chat') renderChat();
  }

  async function requestModel(operation, payload, signal) {
    const response = await fetch('/api/ai/' + operation, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal
    });
    return response.json();
  }

  function modelError(result) {
    if (result.reason === 'auth') return '模型服务拒绝了请求，请检查 API 密钥和模型权限。';
    if (result.reason === 'rate-limit') return '模型服务达到请求限额，请稍后再试。';
    if (result.reason === 'timeout') return '模型响应超时，请稍后再试。';
    if (result.status === 'busy') return 'AI 正在处理其他请求，请稍后再试。';
    if (result.status === 'invalid-response') return '模型返回的内容未通过校验。';
    return '暂时无法连接模型服务，请检查模型地址和网络。';
  }

  async function analyzeIfNeeded() {
    if (runningOnFile) return;
    const { result, entry, matching, personal } = context();
    if (result.invalid || entry.segments.length || personal || matching.length === 1) return;
    const controller = new AbortController();
    checkingAnalysis = controller;
    await modelReady;
    if (controller !== checkingAnalysis) return;
    if (modelStatus !== 'ready') {
      checkingAnalysis = null;
      return;
    }
    aiNote = 'AI 正在比对词义和拆词规则…';
    if (activePage === 'search') renderSearch();
    try {
      const morphemes = data.morphemes.filter(rule => entry.word.includes(rule.form)).slice(0, 64);
      const analysis = await requestModel('analyze', { word: entry.word, pos: entry.pos, gloss: entry.gloss, morphemes }, controller.signal);
      if (controller !== checkingAnalysis) return;
      if (analysis.status === 'hit') {
        aiAnalysis = analysis;
        aiNote = '';
      } else {
        aiNote = analysis.status === 'no-analysis' ? 'AI 未找到可靠的拆法。' : modelError(analysis);
      }
    } catch {
      if (controller === checkingAnalysis) aiNote = '连接 AI 接口失败。';
    } finally {
      if (controller === checkingAnalysis) {
        checkingAnalysis = null;
        if (activePage === 'search') renderSearch();
      }
    }
  }

  function renderChat() {
    $('#chat-log').innerHTML = chatMessages.map(message => '<li data-role="' + message.role
      + '"><strong>' + (message.role === 'user' ? '你' : 'AI') + '</strong>' + esc(message.content) + '</li>').join('');
    $('#chat-status').textContent = chatNote || (runningOnFile ? '请用 npm run dev 启动后打开服务地址。'
      : modelStatus === 'ready' ? '' : modelLabels[modelStatus]);
    $('#chat-send').disabled = modelStatus !== 'ready' || !!chatRequest;
  }

  async function sendChat() {
    const field = $('#chat-input');
    const content = field.value.trim();
    if (!content || chatRequest || modelStatus !== 'ready') return;
    const controller = new AbortController();
    const message = { role: 'user', content };
    chatRequest = controller;
    chatMessages.push(message);
    field.value = '';
    chatNote = '正在等待回复…';
    renderChat();
    try {
      const response = await requestModel('chat', { messages: chatMessages.slice(-11) }, controller.signal);
      if (controller !== chatRequest) return;
      if (response.status === 'hit') {
        chatMessages.push({ role: 'assistant', content: response.reply });
        chatNote = '';
      } else {
        chatNote = modelError(response);
      }
    } catch {
      if (controller === chatRequest) chatNote = '连接 AI 接口失败。';
    } finally {
      if (controller === chatRequest) {
        if (chatMessages.at(-1) === message) {
          chatMessages.pop();
          if (!field.value) field.value = content;
        }
        chatRequest = null;
        renderChat();
      }
    }
  }

  function compact(segs) {
    return segs.map(({ id: morphId }) => {
      const m = index.morphemes.get(morphId);
      return '<b class="' + esc(m.role) + '">' + esc(core.shownForm(m)) + '</b> ' + esc(m.gloss);
    }).join(' <span aria-hidden="true">＋</span> ');
  }

  function renderAIAnalysis() {
    if (!aiAnalysis) return aiNote ? '<p class="word-extra" role="status">' + esc(aiNote) + '</p>' : '';
    const allRegistered = aiAnalysis.parts.every(part => part.id && index.morphemes.has(part.id));
    return '<div class="ai-analysis"><span class="status candidate">AI 候选拆法</span>'
      + '<div class="tiles">' + aiAnalysis.parts.map(part => {
        const form = core.shownForm({ form: part.text, role: part.role });
        return '<span class="tile ' + esc(part.role) + '"><span class="role">'
          + esc(core.roles[part.role] + (part.id ? '' : ' · AI 推测')) + '</span><strong lang="en">'
          + esc(form) + '</strong><span class="meaning">' + esc(part.meaning) + '</span></span>';
      }).join('') + '</div>'
      + (aiAnalysis.reason ? '<p class="word-extra">' + esc(aiAnalysis.reason) + '</p>' : '')
      + (allRegistered ? '<button class="text-button detail" data-action="review-ai">检查并采用此拆法</button>' : '')
      + '</div>';
  }

  function tiles(word, segments) {
    let cursor = 0;
    const items = [];
    function gap(end) {
      if (cursor < end) items.push('<span class="tile"><span class="role">原拼写</span><strong>' + esc(word.slice(cursor, end)) + '</strong><span class="meaning">未标注</span></span>');
    }
    for (const segment of segments) {
      const m = index.morphemes.get(segment.id);
      gap(segment.start);
      items.push('<button class="tile ' + esc(m.role) + '" data-morph="' + esc(m.id) + '" aria-pressed="' + (selectedMorph === m.id) + '">'
        + '<span class="role">' + esc(core.roles[m.role]) + '</span><strong>' + esc(core.shownForm(m))
        + '</strong><span class="meaning">' + esc(m.gloss) + '</span></button>');
      cursor = segment.end;
    }
    gap(word.length);
    return '<div class="tiles">' + items.join('') + '</div>';
  }

  function showMorph(m, entry) {
    if (!m) return '';
    const labels = m.tags.map(type => index.types.get(type)?.name).filter(Boolean);
    const siblings = index.byRole[m.role].filter(item => item.id !== m.id
      && (item.form === m.form || core.relationKey(item) === core.relationKey(m)));
    const examples = [...new Map((index.relations.get(core.relationKey(m)) ?? [])
      .filter(item => item.word !== entry.word).map(item => [item.word, item])).values()].slice(0, 8);
    const mnemonics = m.id === 'pre-bene'
      ? '<p class="subtle detail">熟词联想 <button class="text-button" data-word="fine">fine</button> · 好的</p>' : '';
    return '<section class="panel ' + esc(m.role) + '"><h3>词素详情</h3><p class="morph-form">' + esc(core.shownForm(m)) + '</p>'
      + '<p class="meaning">' + esc(core.roles[m.role]) + ' · ' + esc(m.gloss) + '</p>'
      + labels.map(label => '<span class="status">' + esc(label) + '</span> ').join('')
      + (m.base ? '<p class="detail">来源形式 <b>' + esc(m.base) + (m.role === 'prefix' ? '-' : '') + '</b></p>' : '')
      + (m.note ? '<p class="detail">' + esc(m.note) + '</p>' : '') + mnemonics
      + (siblings.length ? '<div class="side-list" aria-label="其他用法或词形">' + siblings.map(item =>
        '<button class="chip" data-morph="' + esc(item.id) + '">' + esc(core.shownForm(item) + ' · ' + item.gloss) + '</button>').join('') + '</div>' : '')
      + (examples.length ? '<div class="side-list">' + examples.map(item =>
        '<button class="text-button" data-sense-word="' + esc(item.word) + '" data-sense-id="' + esc(item.id) + '">' + esc(item.word) + '</button>').join('') + '</div>' : '')
      + '</section>';
  }

  function renderSearch() {
    const c = context();
    const { result, entry, matching, segments, mode } = c;
    const output = $('#results');
    if (result.invalid) {
      output.innerHTML = '<section class="panel standalone"><h2>输入英语单词</h2><p class="muted">例如 collaboration 或 benevolent。</p></section>';
      return;
    }
    if (selectedMorph === '') selectedMorph = segments[0]?.id ?? '';
    const known = entry.id !== undefined;
    const saved = known && own(data.cards, entry.id);
    const displayRelations = known && mode !== '候选拆法' ? core.related(index, entry, segments) : [];
    const limit = segments.some(segment => segment.id === 'pre-bene') ? 10 : 8;
    const list = relatedExpanded ? displayRelations : displayRelations.slice(0, limit);
    const suggestions = !known ? [...new Set([...core.suggestions(index, entry.word), ...remoteSuggestions])].slice(0, 8) : [];

    const header = '<div class="word-heading"><h2 lang="en">' + esc(entry.word) + '</h2><div class="actions">'
      + (known ? '<button class="secondary" data-speak="' + esc(entry.word) + '">播放发音</button>' : '')
      + '<button class="primary" data-action="' + (saved ? 'view-cards' : known ? 'save-active' : 'edit-analysis') + '"' + (checkingEntry ? ' disabled' : '') + '>'
      + (saved ? '查看词卡' : known ? '保存卡片' : '添加生词') + '</button></div></div>';
    const tabs = result.entries.length > 1 ? '<div class="sense-tabs" aria-label="选择义项">'
      + result.entries.map(item => '<button class="chip" data-sense="' + esc(item.id) + '" aria-pressed="' + (item.id === entry.id)
        + '">' + esc((item.pos ?? '') + ' ' + (item.gloss ?? '词典释义').split(/[；，\n]/)[0]) + '</button>').join('') + '</div>' : '';
    const gloss = (entry.pos ? '<span class="muted">' + esc(entry.pos) + '</span> ' : '')
      + (entry.gloss ? esc(entry.gloss).replace(/\n/g, '<br>') : '词库暂无释义。');
    const candidateList = matching.length ? '<details class="detail"' + (candidateIndex >= 0 ? ' open' : '') + '><summary>查看候选拆法</summary>'
      + matching.map((item, i) => '<p><button class="text-button" data-candidate="' + i + '">' + compact(item.segments) + '</button></p>').join('') + '</details>' : '';
    const current = '<section class="panel word-panel">' + header + tabs + '<p class="gloss">' + gloss + '</p>'
      + (entry.phonetic ? '<p class="word-extra">' + esc(entry.phonetic) + '</p>' : '')
      + (entry.sourceLabel ? '<p class="word-extra">' + esc([entry.sourceLabel, entry.topic, entry.license].filter(Boolean).join(' · ')) + '</p>' : '')
      + (lookupNote ? '<p class="word-extra" role="status">' + esc(lookupNote) + '</p>' : '')
      + (result.alias ? '<p class="word-extra">输入词形 ' + esc(result.word) + ' · 原形 ' + esc(entry.word) + '</p>' : '')
      + '<div class="analysis"><div class="panel-head"><h3>构词分析 '
      + (segments.length ? '<span class="status' + (c.candidate ? ' candidate' : '') + '">' + esc(mode) + '</span>' : '')
      + '</h3><div class="actions">'
      + (c.personal ? '<button class="text-button" data-action="toggle-analysis">' + (usePersonal ? '查看词库拆词' : '查看个人拆词') + '</button>' : '')
      + (known ? '<button class="text-button" data-action="edit-analysis">编辑我的拆词</button>' : '') + '</div></div>'
      + (segments.length ? tiles(entry.word, segments) : aiAnalysis ? '' : '<p class="muted">暂无已标注的拆词。</p>')
      + candidateList
      + (usePersonal && c.personal ? '' : renderAIAnalysis())
      + (entry.note || entry.source ? '<details class="detail"><summary>词源与出处</summary>'
        + (entry.note ? '<p>' + esc(entry.note) + '</p>' : '') + '<p>' + sourceLink(entry.source) + '</p></details>' : '')
      + (entry.example ? '<p class="word-extra" lang="en">' + esc(entry.example) + '</p>' : '')
      + (suggestions.length ? '<p class="detail">相近拼写</p><div class="side-list">' + suggestions.map(word =>
        '<button class="chip" data-word="' + esc(word) + '">' + esc(word) + '</button>').join('') + '</div>' : '')
      + '</div></section>';
    const relationUI = displayRelations.length ? '<section class="panel"><div class="panel-head"><h3>相关单词'
      + ' <span class="subtle">' + displayRelations.length + '</span></h3><button class="secondary" data-action="save-related" '
      + (selectedRelatives.size ? '' : 'disabled') + '>保存所选</button></div><div class="section-list">'
      + list.map(({ entry: item, relation }) => {
        const key = esc(item.id);
        const added = own(data.cards, item.id);
        const shownSegments = own(data.analyses, item.id)?.segments ?? item.segments;
        return '<div class="relative"><input type="checkbox" aria-label="选择 ' + esc(item.word) + '" data-relative="' + key + '" '
          + (added ? 'checked disabled' : selectedRelatives.has(item.id) ? 'checked' : '') + '><div><div class="relative-line">'
          + '<button class="text-button relative-word" lang="en" data-sense-word="' + esc(item.word) + '" data-sense-id="' + key + '">' + esc(item.word)
          + '</button><span class="subtle">' + esc((item.pos ?? '') + ' ' + item.gloss) + '</span><span class="status">' + esc(relation)
          + '</span></div>' + (shownSegments.length ? '<p class="compact-parts">' + compact(shownSegments) + '</p>' : '') + '</div></div>';
      }).join('') + '</div>'
      + (displayRelations.length > limit ? '<button class="text-button detail" data-action="expand-related">'
        + (relatedExpanded ? '收起相关词' : '查看全部相关词') + '</button>' : '') + '</section>' : '';
    const morphUI = showMorph(index.morphemes.get(selectedMorph), entry);
    const mnemonic = entry.mnemonic ? '<section class="panel"><h3>字母联想</h3><p class="subtle">'
      + esc(entry.mnemonic) + '</p>' + (entry.mnemonicSource ? '<p class="detail">' + sourceLink(entry.mnemonicSource) + '</p>' : '') + '</section>' : '';
    const aside = morphUI + mnemonic;
    output.innerHTML = aside ? '<div class="result-layout"><div class="result-main">' + current + relationUI
      + '</div><aside class="aside">' + aside + '</aside></div>' : '<div class="standalone result-main">' + current + relationUI + '</div>';
  }

  function renderCards() {
    const cards = Object.values(data.cards).sort((a, b) => a.due - b.due || b.created - a.created);
    const due = cards.filter(card => card.due <= Date.now());
    const visible = cardFilter === 'due' ? due : cards;
    const fmt = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#cards-page').innerHTML = '<div class="page-wrap"><div class="page-head"><div><h1>我的词卡</h1><p class="muted">'
      + cards.length + ' 张卡片 · ' + due.length + ' 张待复习</p></div><div class="actions"><button class="secondary" data-action="export">导出备份</button>'
      + '<button class="secondary" data-action="import">导入备份</button></div></div>'
      + (cards.length ? '<div class="actions panel-head"><button class="chip" data-card-filter="all" aria-pressed="' + (cardFilter === 'all') + '">全部</button>'
        + '<button class="chip" data-card-filter="due" aria-pressed="' + (cardFilter === 'due') + '">待复习</button></div>' : '')
      + (visible.length ? '<div class="spread">' + visible.map(card => {
        const key = esc(card.id);
        const open = reveal.has(card.id);
        const pieces = card.pieces.map(piece => '<b class="' + esc(piece.role) + '">' + esc(piece.form) + '</b> ' + esc(piece.gloss)).join(' ＋ ');
        return '<article class="panel saved-card"><div class="panel-head"><h2 lang="en">' + esc(card.word) + '</h2>'
          + '<button class="text-button" data-speak="' + esc(card.word) + '">播放发音</button></div>'
          + (card.phonetic ? '<p class="subtle">' + esc(card.phonetic) + '</p>' : '')
          + (open ? '<div><p>' + esc((card.pos ?? '') + ' ' + card.gloss) + '</p>'
            + (pieces && card.mode ? '<span class="status' + (card.mode === '候选拆法' ? ' candidate' : '') + '">' + esc(card.mode) + '</span>' : '')
            + (pieces ? '<p class="compact-parts">' + pieces + '</p>' : '')
            + (card.example ? '<p class="subtle" lang="en">' + esc(card.example) + '</p>' : '')
            + (card.sourceLabel ? '<p class="subtle">' + esc([card.sourceLabel, card.license].filter(Boolean).join(' · ')) + ' ' + sourceLink(card.source) + '</p>' : '')
            + (card.note ? '<p class="subtle highlight">' + esc(card.note) + '</p>' : '') + '</div>'
            + '<div class="actions review-tools"><button class="primary" data-grade="known" data-card="' + key + '">认识</button>'
            + '<button class="secondary" data-grade="again" data-card="' + key + '">还要练</button></div>'
            : '<button class="secondary" data-flip="' + key + '">查看卡片背面</button>')
          + '<p class="subtle">' + (card.due <= Date.now() ? '待复习' : '下次复习 ' + esc(fmt.format(card.due))) + '</p>'
          + '<div class="actions"><button class="text-button" data-card-note="' + key + '">备注</button>'
          + '<button class="text-button" data-sense-word="' + esc(card.word) + '" data-sense-id="' + key + '">查词</button>'
          + '<button class="text-button" data-card-remove="' + key + '">移除</button></div></article>';
      }).join('') + '</div>' : '<section class="panel"><p>' + (cards.length ? '暂时没有到期待复习的卡片。' : '在查词页保存的单词会出现在这里。') + '</p></section>') + '</div>';
  }

  function renderLexicon() {
    const edited = data.morphemes;
    $('#lexicon-page').innerHTML = '<div class="page-wrap"><div class="page-head"><h1>我的词素</h1><div class="actions">'
      + '<button class="primary" data-action="new-morph">添加词素</button><button class="secondary" data-action="new-type">添加类型</button></div></div>'
      + '<div class="lexicon-layout"><section class="panel"><div class="panel-head"><h2 class="panel-heading">个人词素</h2></div>'
      + (edited.length ? '<ul class="edit-list">' + edited.map(m => '<li><b class="morph-form ' + esc(m.role) + '">'
        + esc(core.shownForm(m)) + '</b><span>' + esc(core.roles[m.role] + ' · ' + m.gloss) + '</span><div class="actions">'
        + '<button class="text-button" data-edit-morph="' + esc(m.id) + '">编辑</button></div></li>').join('') + '</ul>'
        : '<p class="muted">可添加前缀、词根、后缀及同形异义的用法。</p>') + '</section>'
      + '<section class="panel"><div class="panel-head"><h2 class="panel-heading">可用类型</h2></div>'
      + Object.entries(core.roles).map(([role, label]) => '<p class="meaning"><b>' + esc(label) + '</b></p><div class="side-list">'
        + [...index.types.values()].filter(item => item.role === role).map(item => '<span class="status">' + esc(item.name) + '</span>').join('') + '</div>').join('')
      + '</section></div></div>';
  }

  function openEditor(title, body, save, onOpen) {
    const dialog = $('#editor');
    dialog.innerHTML = '<form id="editor-form"><h2>' + esc(title) + '</h2>' + body + '<p class="form-error" hidden></p>'
      + '<div class="actions"><button type="submit" class="primary">保存</button><button type="button" class="secondary" data-action="close-editor">取消</button></div></form>';
    const form = $('#editor-form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const next = save(new FormData(form), form);
        dialog.close();
        persist();
        if (typeof next === 'function') next();
        else goTo(activePage);
        notice('已保存');
      } catch (error) {
        const message = form.querySelector('.form-error');
        message.hidden = false;
        message.textContent = error.message;
      }
    });
    dialog.showModal();
    onOpen?.(form);
  }

  function addType() {
    openEditor('添加词素类型', '<label>类型名称<input name="name" required maxlength="24"></label>'
      + '<label>用于<select name="role">' + Object.entries(core.roles).map(([key, name]) =>
        '<option value="' + key + '">' + name + '</option>').join('') + '</select></label>', fields => {
      const name = fields.get('name').trim();
      const role = fields.get('role');
      if (!name) throw new Error('请输入类型名称。');
      if ([...index.types.values()].some(type => type.role === role && type.name === name)) throw new Error('该词素类别下已有同名类型。');
      data.types.push({ id: id(), name, role });
    });
  }

  function morphEditor(existing) {
    const role = existing?.role ?? 'prefix';
    openEditor(existing ? '编辑词素' : '添加词素', '<div class="fields">'
      + '<label>词素类别<select name="role"' + (existing ? ' disabled' : '') + '>' + Object.entries(core.roles).map(([key, name]) =>
        '<option value="' + key + '"' + (role === key ? ' selected' : '') + '>' + name + '</option>').join('') + '</select></label>'
      + '<label>写法<input name="form" value="' + esc(existing?.form) + '" required maxlength="30"' + (existing ? ' readonly' : '') + '></label>'
      + '<label>含义或功能<input name="gloss" value="' + esc(existing?.gloss) + '" required maxlength="70"></label>'
      + '<label>来源形式（选填）<input name="base" value="' + esc(existing?.base) + '" maxlength="30"></label>'
      + '<label>后续首字母限制（选填）<input name="condition" value="' + esc(existing?.condition) + '" maxlength="26" placeholder="例如 l 或 aeiou"></label>'
      + '<label>形成的词性（选填）<select name="pos"><option value="">未指定</option>' + posOptions.filter(([value]) => value).map(([value, label]) =>
        '<option value="' + value + '"' + (existing?.pos === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label></div>'
      + '<fieldset><legend>可选类型</legend><div id="tag-options"></div></fieldset>'
      + '<label>说明<input name="note" value="' + esc(existing?.note) + '" maxlength="160"></label>', fields => {
      const form = core.normalize(fields.get('form')).replace(/^-|-$/g, '');
      const gloss = fields.get('gloss').trim();
      const kind = existing?.role ?? fields.get('role');
      const base = core.normalize(fields.get('base')).replace(/^-|-$/g, '');
      const condition = core.normalize(fields.get('condition'));
      if (!/^[a-z]+$/.test(form) || !gloss) throw new Error('词素写法请用英文字母，并填写含义。');
      if ((base && !/^[a-z]+$/.test(base)) || (condition && !/^[a-z]+$/.test(condition))) throw new Error('来源形式和首字母限制请使用英文字母。');
      const possibleBase = index.byRole[kind].find(item => item.form === base && item.gloss === gloss)
        ?? index.byRole[kind].find(item => item.form === base);
      const morph = { id: existing?.id ?? id(), role: kind, form, gloss, base, condition: kind === 'prefix' ? condition : '',
        group: possibleBase?.group ?? possibleBase?.id, pos: kind === 'suffix' ? fields.get('pos') : '',
        tags: fields.getAll('tag'), note: fields.get('note').trim() };
      data.morphemes = [...data.morphemes.filter(item => item.id !== morph.id), morph];
    }, form => {
      function show() {
        const kind = form.elements.role.value;
        const options = [...index.types.values()].filter(type => type.role === kind);
        $('#tag-options').innerHTML = options.length ? options.map(type => '<label class="check"><input type="checkbox" name="tag" value="'
          + esc(type.id) + '"' + (existing?.tags.includes(type.id) ? ' checked' : '') + '>' + esc(type.name) + '</label>').join('')
          : '<span class="subtle">此类别暂无类型，可在「我的词素」中添加。</span>';
        form.elements.condition.disabled = kind !== 'prefix';
        form.elements.pos.disabled = kind !== 'suffix';
      }
      form.elements.role.addEventListener('change', show);
      show();
    });
  }

  function analysisEditor(suggested) {
    const c = context();
    const { entry } = c;
    const known = Boolean(entry.id);
    const options = [...index.morphemes.values()].sort((a, b) => a.form.localeCompare(b.form));
    const renderRow = ({ id: morphId, start, end } = {}) => '<div class="segment-edit"><label>起始位<input class="seg-start" type="number" min="1" max="'
      + entry.word.length + '" value="' + (start === undefined ? '' : start + 1) + '" required></label><label>结束位<input class="seg-end" type="number" min="1" max="'
      + entry.word.length + '" value="' + (end ?? '') + '" required></label><label>词素<select class="seg-id" required><option value="">选择词素</option>'
      + options.map(m => '<option value="' + esc(m.id) + '"' + (m.id === morphId ? ' selected' : '') + '>'
        + esc(core.shownForm(m) + ' · ' + core.roles[m.role] + ' · ' + m.gloss) + '</option>').join('')
      + '</select></label><button type="button" class="text-button remove-segment">移除</button></div>';
    openEditor(known ? '编辑我的拆词' : '添加生词', '<label>单词<input id="selectable-word" lang="en" readonly value="' + esc(entry.word) + '"></label>'
      + (known ? '' : '<div class="fields"><label>中文释义<input name="gloss" required maxlength="150"></label>'
        + '<label>词性<select name="pos">' + posOptions.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('') + '</select></label></div>')
      + '<p class="subtle">可先选中单词里的字母再添加片段，也可手动填写位置。首字母为第 1 位。</p>'
      + '<div id="segment-rows">' + (suggested ?? c.personal?.segments ?? c.segments).map(renderRow).join('') + '</div>'
      + '<div class="actions"><button type="button" class="text-button" id="add-segment">添加片段</button></div>', (fields, form) => {
      const segments = [...form.querySelectorAll('.segment-edit')].map(row => ({
        id: row.querySelector('.seg-id').value, start: Number(row.querySelector('.seg-start').value) - 1, end: Number(row.querySelector('.seg-end').value)
      }));
      const sorted = core.validateSegments(entry.word, segments, index.morphemes);
      const key = entry.id ?? id();
      if (!known) {
        const gloss = fields.get('gloss').trim();
        if (!gloss) throw new Error('请填写中文释义。');
        data.words.push({ id: key, word: entry.word, pos: fields.get('pos'), gloss, segments: [], mode: '个人词条' });
      }
      data.analyses[key] = { segments: sorted };
      return () => query(entry.word, key);
    }, form => {
      form.querySelector('#add-segment').addEventListener('click', () => {
        const holder = form.querySelector('#segment-rows');
        const spelling = form.querySelector('#selectable-word');
        const start = spelling.selectionStart;
        const end = spelling.selectionEnd;
        if (holder.childElementCount >= entry.word.length) return;
        const matches = options.filter(m => m.form === spelling.value.slice(start, end));
        const row = end > start ? { start, end, id: matches.length === 1 ? matches[0].id : undefined } : {};
        holder.insertAdjacentHTML('beforeend', renderRow(row));
        holder.lastElementChild.querySelector(end > start ? 'select' : 'input').focus();
      });
      form.addEventListener('click', event => {
        if (event.target.matches('.remove-segment')) event.target.closest('.segment-edit').remove();
      });
    });
  }

  function saveCard(entry, segments, mode) {
    if (own(data.cards, entry.id)) return false;
    data.cards[entry.id] = core.makeCard(entry, segments, index, mode);
    return true;
  }

  function speak(word) {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return notice('浏览器没有可用的发音功能。');
    const speech = new SpeechSynthesisUtterance(word);
    speech.lang = 'en-US';
    speech.onerror = event => { if (event.error !== 'interrupted' && event.error !== 'canceled') notice('当前设备没有可用的英语语音。'); };
    speechSynthesis.cancel();
    speechSynthesis.speak(speech);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'word-rootsE-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importBackup(file) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MB。');
      const imported = core.requireShape(JSON.parse(await file.text()), seed);
      const merge = (current, restored) => [...new Map([...restored, ...current].map(item => [item.id, item])).values()];
      const combined = { version: 1, types: merge(data.types, imported.types), morphemes: merge(data.morphemes, imported.morphemes),
        words: merge(data.words, imported.words), analyses: { ...imported.analyses, ...data.analyses }, cards: { ...imported.cards, ...data.cards } };
      data = core.requireShape(combined, seed);
      persist();
      goTo(activePage);
      notice('备份已合并，保留本机已有的项目。');
    } catch (error) {
      notice(error instanceof SyntaxError ? '备份不是有效的 JSON。' : error.message);
    }
  }

  function handleAction(action) {
    if (action === 'view-cards') goTo('cards');
    if (action === 'edit-analysis') analysisEditor();
    if (action === 'review-ai' && aiAnalysis?.parts.every(part => part.id && index.morphemes.has(part.id))) {
      analysisEditor(aiAnalysis.parts);
    }
    if (action === 'clear-chat') {
      chatRequest?.abort();
      chatRequest = null;
      chatMessages = [];
      chatNote = '';
      $('#chat-input').value = '';
      renderChat();
      $('#chat-input').focus();
    }
    if (action === 'close-editor') $('#editor').close();
    if (action === 'export') exportBackup();
    if (action === 'import') $('#backup-input').click();
    if (action === 'new-morph') morphEditor();
    if (action === 'new-type') addType();
    if (action === 'expand-related') {
      relatedExpanded = !relatedExpanded;
      renderSearch();
    }
    if (action === 'toggle-analysis') {
      usePersonal = !usePersonal;
      candidateIndex = -1;
      selectedMorph = '';
      renderSearch();
    }
    if (action === 'save-active') {
      const c = context();
      if (saveCard(c.entry, c.segments, c.mode)) {
        persist();
        renderSearch();
        notice('已加入我的词卡');
      }
    }
    if (action === 'save-related') {
      let saved = 0;
      for (const key of selectedRelatives) {
        const entry = index.entries.get(key);
        const ownAnalysis = own(data.analyses, key);
        if (entry && saveCard(entry, ownAnalysis?.segments ?? entry.segments, ownAnalysis ? '个人拆词' : entry.mode)) saved++;
      }
      selectedRelatives.clear();
      persist();
      renderSearch();
      notice('已保存 ' + saved + ' 张词卡');
    }
  }

  function attach() {
    $('#online-lookup').addEventListener('change', () => {
      if (core.validWord(queried) && !core.lookup(index, queried).entries.length) query(queried);
    });
    $('#search-form').addEventListener('submit', event => {
      event.preventDefault();
      const field = $('#query');
      const draft = core.chatCommand(field.value);
      if (draft === null) {
        query(field.value);
        return;
      }
      field.value = queried;
      goTo('chat');
      if (draft) $('#chat-input').value = draft;
      $('#chat-input').focus();
    });
    $('#chat-form').addEventListener('submit', event => {
      event.preventDefault();
      sendChat();
    });
    $('#backup-input').addEventListener('change', event => {
      const [file] = event.target.files;
      if (file) importBackup(file);
      event.target.value = '';
    });
    document.addEventListener('change', event => {
      const key = event.target.dataset.relative;
      if (!key) return;
      if (event.target.checked) selectedRelatives.add(key);
      else selectedRelatives.delete(key);
      $('[data-action="save-related"]').disabled = selectedRelatives.size === 0;
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      const action = button.dataset;
      if (action.page) goTo(action.page);
      if (action.word) query(action.word);
      if (action.senseWord) query(action.senseWord, action.senseId);
      if (action.sense) query(queried, action.sense);
      if (action.morph) {
        selectedMorph = action.morph;
        renderSearch();
        const focused = [...document.querySelectorAll('[data-morph]')].find(item => item.dataset.morph === selectedMorph);
        focused?.focus({ preventScroll: true });
      }
      if (action.candidate !== undefined) {
        candidateIndex = Number(action.candidate);
        selectedMorph = '';
        renderSearch();
      }
      if (action.speak) speak(action.speak);
      if (action.action) handleAction(action.action);
      if (action.cardFilter) {
        cardFilter = action.cardFilter;
        renderCards();
      }
      if (action.flip) {
        reveal.add(action.flip);
        renderCards();
      }
      if (action.grade) {
        const card = own(data.cards, action.card);
        if (card) {
          data.cards[card.id] = core.grade(card, action.grade === 'known');
          persist();
          reveal.delete(card.id);
          renderCards();
          notice('已安排下次复习');
        }
      }
      if (action.cardNote) {
        const card = own(data.cards, action.cardNote);
        if (card) openEditor('卡片备注', '<label>我的备注<textarea name="note" maxlength="500">' + esc(card.note) + '</textarea></label>',
          fields => { card.note = fields.get('note').trim(); });
      }
      if (action.cardRemove) {
        const card = own(data.cards, action.cardRemove);
        if (card && confirm('移除词卡 ' + card.word + '？')) {
          delete data.cards[card.id];
          reveal.delete(card.id);
          persist();
          renderCards();
        }
      }
      if (action.editMorph) {
        const m = data.morphemes.find(item => item.id === action.editMorph);
        if (m) morphEditor(m);
      }
    });
  }

  async function start() {
    if (runningOnFile) {
      const script = document.createElement('script');
      script.src = 'data/dictionary.js';
      await new Promise(resolve => {
        script.onload = script.onerror = resolve;
        document.head.append(script);
      });
      legacyDictionary = globalThis.WordRootsDictionary ?? [];
    }
    database = await openDatabase();
    const saved = await readPersonal();
    if (saved?.version === 1) data = saved;
    reindex();
    const words = new Set(seed.entries.map(entry => entry.word)).size;
    const starterSummary = '内置 ' + words + ' 个构词示例';
    $('#dataset-summary').textContent = starterSummary + (legacyDictionary.length ? ' · 旧版词典 ' + legacyDictionary.length + ' 条' : '');
    $('#online-option').hidden = runningOnFile;
    attach();
    modelReady = loadModelStatus();
    query(queried);
    if (!runningOnFile) {
      try {
        const response = await fetch('/api/info');
        if (!response.ok) return;
        const stats = await response.json();
        const labels = { starter: '雅思起步', atlas: '词光', ecdict: 'ECDICT' };
        $('#dataset-summary').textContent = [starterSummary, ...Object.entries(stats)
          .filter(([key]) => Object.hasOwn(labels, key)).map(([key, count]) => labels[key] + ' ' + count + ' 条')].join(' · ');
      } catch { /* 查词页会展示连接状态 */ }
    }
  }

  start();
})();
