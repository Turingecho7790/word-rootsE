(() => {
  const use = (id, role, form, gloss, tags = [], extra = {}) =>
    ({ id, role, form, gloss, tags, ...extra });

  const types = [
    ['direct', '直接表义', 'prefix'], ['variant', '变体', 'prefix'],
    ['intensive', '加强', 'prefix'], ['noun', '名词后缀', 'suffix'],
    ['adjective', '形容词后缀', 'suffix'], ['adverb', '副词后缀', 'suffix'],
    ['verb', '动词后缀', 'suffix'], ['agent', '表示人', 'suffix']
  ].map(([id, name, role]) => ({ id, name, role }));

  const morphemes = [
    use('pre-com', 'prefix', 'com', '共同', ['direct'], { group: 'pre-com' }),
    use('pre-col', 'prefix', 'col', '共同', ['direct', 'variant'], {
      base: 'com', group: 'pre-com', condition: 'l',
      note: '在这类拉丁语构词中，com- 遇到以 l 开头的词基，同化为 col-。'
    }),
    use('pre-co', 'prefix', 'co', '共同', ['direct', 'variant'], {
      base: 'com', group: 'pre-com', condition: 'aeiou',
      note: '这里对应一起、共同的用法。cooperate 源自拉丁语相关形式。'
    }),
    use('pre-com-intense', 'prefix', 'com', '可能表加强', ['intensive'], {
      note: '部分拉丁语词例中有加强作用。complete 的词源分析常采用这一解释。'
    }),
    use('pre-bene', 'prefix', 'bene', '好、善', ['direct'], {
      note: '来自拉丁语 bene，意为「好地、适当地」。可用熟词 fine 联想。'
    }),
    use('pre-re', 'prefix', 're', '再次', ['direct']),
    use('pre-in', 'prefix', 'in', '进入、使', ['direct']),
    use('pre-un', 'prefix', 'un', '否定、不', ['direct']),
    use('pre-dis', 'prefix', 'dis', '否定、相反', ['direct']),
    use('root-labor', 'root', 'labor', '工作、劳动'),
    use('root-oper', 'root', 'oper', '工作、运作'),
    use('root-vol', 'root', 'vol', '意愿'),
    use('root-fact', 'root', 'fact', '做', [], { group: 'root-facere' }),
    use('root-fic', 'root', 'fic', '做', [], { group: 'root-facere' }),
    use('root-dict', 'root', 'dict', '说'),
    use('root-nov', 'root', 'nov', '新', [], { note: '与英语 new 有共同的印欧语祖源。' }),
    use('root-vid', 'root', 'vid', '看', [], { group: 'root-see' }),
    use('root-vis', 'root', 'vis', '看', [], { group: 'root-see' }),
    use('root-ple', 'root', 'ple', '满、填满'),
    use('root-quick', 'root', 'quick', '快'),
    use('root-friend', 'root', 'friend', '朋友'),
    use('root-kind', 'root', 'kind', '亲切、善良'),
    use('root-help', 'root', 'help', '帮助'),
    use('root-care', 'root', 'care', '在意、照料'),
    use('root-use', 'root', 'use', '使用'),
    use('root-read', 'root', 'read', '读'),
    use('root-agree', 'root', 'agree', '同意'),
    use('root-fair', 'root', 'fair', '公平'),
    use('suf-ation', 'suffix', 'ation', '形成名词，常指动作或结果', ['noun'], { pos: 'n.' }),
    use('suf-ate', 'suffix', 'ate', '形成动词', ['verb'], { pos: 'v.' }),
    use('suf-ative', 'suffix', 'ative', '形成形容词', ['adjective'], { pos: 'adj.' }),
    use('suf-ator', 'suffix', 'ator', '从事某事的人', ['noun', 'agent'], { pos: 'n.' }),
    use('suf-ion', 'suffix', 'ion', '形成名词', ['noun'], { pos: 'n.' }),
    use('suf-or', 'suffix', 'or', '做某事的人', ['noun', 'agent'], { pos: 'n.' }),
    use('suf-ent', 'suffix', 'ent', '形容词词尾', ['adjective'], { pos: 'adj.' }),
    use('suf-al', 'suffix', 'al', '形容词词尾', ['adjective'], { pos: 'adj.' }),
    use('suf-ary', 'suffix', 'ary', '这里是历史词尾', ['noun']),
    use('suf-ible', 'suffix', 'ible', '可被……的', ['adjective'], { pos: 'adj.' }),
    use('suf-able', 'suffix', 'able', '可被……的', ['adjective'], { pos: 'adj.' }),
    use('suf-ly-adv', 'suffix', 'ly', '以……的方式', ['adverb'], { pos: 'adv.' }),
    use('suf-ly-adj', 'suffix', 'ly', '具有……特点的', ['adjective'], { pos: 'adj.' }),
    use('suf-ness', 'suffix', 'ness', '状态、性质', ['noun'], { pos: 'n.' }),
    use('suf-ful', 'suffix', 'ful', '有……的', ['adjective'], { pos: 'adj.' }),
    use('suf-less', 'suffix', 'less', '没有……的', ['adjective'], { pos: 'adj.' }),
    use('suf-ment', 'suffix', 'ment', '行为或结果', ['noun'], { pos: 'n.' }),
    use('suf-ty', 'suffix', 'ty', '名词词尾', ['noun'], { pos: 'n.' })
  ];

  const entries = [];
  const etym = word => 'https://www.etymonline.com/word/' + encodeURIComponent(word);
  const ahRoots = 'https://www.ahdictionary.com/word/indoeurop.html';
  const caSuffix = 'https://dictionary.cambridge.org/grammar/british-grammar/suffixes';
  const add = (word, pos, gloss, family, segments = [], extra = {}) => {
    const { id = word + ':' + pos, source = etym(word), ...rest } = extra;
    entries.push({ id, word, pos, gloss, family, segments, source, ...rest });
  };
  const history = (word, pos, gloss, family, segments, extra) =>
    add(word, pos, gloss, family, segments, { mode: '历史构词', ...extra });

  history('collaboration', 'n.', '合作；协作', 'collabor', ['pre-col', 'root-labor', 'suf-ation'], {
    phonetic: '/kəˌlæbəˈreɪʃən/', note: '拉丁语 collaborare「一起工作」经法语传入英语。',
    example: 'The two teams worked in close collaboration.'
  });
  history('collaborate', 'v.', '合作；协作', 'collabor', ['pre-col', 'root-labor', 'suf-ate'], {
    forms: ['collaborates', 'collaborated', 'collaborating']
  });
  history('collaborative', 'adj.', '合作的；协作的', 'collabor', ['pre-col', 'root-labor', 'suf-ative']);
  history('collaborator', 'n.', '合作者', 'collabor', ['pre-col', 'root-labor', 'suf-ator'], {
    forms: ['collaborators']
  });
  history('cooperation', 'n.', '合作；配合', 'cooper', ['pre-co', 'root-oper', 'suf-ation']);
  history('cooperate', 'v.', '合作；配合', 'cooper', ['pre-co', 'root-oper', 'suf-ate'], {
    forms: ['cooperated', 'cooperating', 'co-operate']
  });
  history('cooperative', 'adj.', '合作的；配合的', 'cooper', ['pre-co', 'root-oper', 'suf-ative']);
  history('labor', 'n.', '劳动；劳工', 'collabor', ['root-labor'], { forms: ['labour'] });

  history('benevolent', 'adj.', '仁慈的；善意的', 'benevol', ['pre-bene', 'root-vol', 'suf-ent'], {
    phonetic: '/bəˈnevələnt/', note: '可联想「愿他人好」。词源经法语关联拉丁语中的 bene「好地」和表示意愿的成分。'
  });
  history('benevolence', 'n.', '仁慈；善意', 'benevol', ['pre-bene', 'root-vol']);
  history('benefaction', 'n.', '善举；捐助', 'benefac', ['pre-bene', 'root-fact', 'suf-ion'], {
    source: 'https://www.ahdictionary.com/word/search.html?q=benefaction'
  });
  history('benefactor', 'n.', '施惠者；捐助人', 'benefac', ['pre-bene', 'root-fact', 'suf-or'], {
    forms: ['benefactors']
  });
  history('benefit', 'n.', '好处；益处；福利', 'benefic', ['pre-bene'], {
    phonetic: '/ˈbenɪfɪt/', note: '经英法语 benfet、古法语 bienfait 可追溯到拉丁语 benefactum「善举」。',
    forms: ['benefits']
  });
  history('benefit', 'v.', '受益；使受益', 'benefic', ['pre-bene'], {
    note: '动词义由英语名词 benefit 发展。', forms: ['benefits', 'benefited', 'benefiting', 'benefitted', 'benefitting']
  });
  history('beneficial', 'adj.', '有益的；有利的', 'benefic', ['pre-bene', 'root-fic', 'suf-al'], {
    note: '保留中间的 i。历史词形关联拉丁语 beneficium「好处、恩惠」。'
  });
  history('beneficent', 'adj.', '行善的，乐于助人的', 'benefic', ['pre-bene', 'root-fic', 'suf-ent'], {
    note: '可能仿照其他词从 beneficence 形成。彩色切分用来识别历史成分。'
  });
  history('beneficence', 'n.', '善行；仁慈', 'benefic', ['pre-bene', 'root-fic']);
  history('beneficiary', 'n.', '受益人', 'benefic', ['pre-bene', 'root-fic', 'suf-ary'], {
    note: '历史词基可追溯到拉丁语 beneficiarius 和 beneficium。', forms: ['beneficiaries']
  });
  history('benediction', 'n.', '祝福；祝祷', 'benedict', ['pre-bene', 'root-dict', 'suf-ion']);

  history('new', 'adj.', '新的；刚出现的', 'nov', [], {
    note: '经古英语继承自日耳曼语支，与拉丁语 novus 共享重建的印欧语祖形 *newo-。',
    example: 'We need a new approach.'
  });
  history('novel', 'adj.', '新颖的；前所未见的', 'nov', ['root-nov'], {
    note: '来自法语，向前可追溯到拉丁语 novellus 和 novus。'
  });
  history('novel', 'n.', '小说', 'nov', ['root-nov'], {
    note: '该义项经意大利语 novella 发展。', forms: ['novels']
  });
  history('novelty', 'n.', '新奇；新颖的事物', 'nov', ['root-nov', 'suf-ty'], {
    note: 'nov 与 -ty 之间保留 el，来自法语的历史词形可展开查看。'
  });
  history('novice', 'n.', '新手；初学者', 'nov', ['root-nov'], {
    note: '来自古法语 novice 和拉丁语 novicius「初来、没有经验的」。', forms: ['novices']
  });
  history('nova', 'n.', '新星', 'nov', ['root-nov'], {
    note: '拉丁语 nova stella 意为「新的星」。nova 是阴性形式。', forms: ['novae', 'novas']
  });
  history('innovate', 'v.', '创新；引入新方法', 'nov', ['pre-in', 'root-nov', 'suf-ate'], {
    forms: ['innovates', 'innovated', 'innovating']
  });
  history('innovation', 'n.', '创新；新方法', 'nov', ['pre-in', 'root-nov', 'suf-ation'], {
    phonetic: '/ˌɪnəˈveɪʃən/', forms: ['innovations']
  });
  history('innovative', 'adj.', '创新的；有创意的', 'nov', ['pre-in', 'root-nov', 'suf-ative']);
  history('renovate', 'v.', '翻新；整修', 'nov', ['pre-re', 'root-nov', 'suf-ate'], {
    forms: ['renovates', 'renovated', 'renovating']
  });
  history('renovation', 'n.', '翻新；整修', 'nov', ['pre-re', 'root-nov', 'suf-ation']);
  history('novation', 'n.', '债务更新；以新义务替代原义务', 'nov', ['root-nov', 'suf-ation'], {
    source: 'https://www.merriam-webster.com/dictionary/novation'
  });

  history('visible', 'adj.', '看得见的；可见的', 'vision', ['root-vis', 'suf-ible'], {
    phonetic: '/ˈvɪzəbəl/', example: 'The island is visible from the shore.'
  });
  history('vision', 'n.', '视力；景象；愿景', 'vision', ['root-vis', 'suf-ion'], { forms: ['visions'] });
  history('visual', 'adj.', '视觉的', 'vision', ['root-vis', 'suf-al']);
  history('video', 'n.', '视频；录像', 'vision', ['root-vid'], { forms: ['videos'], source: ahRoots });
  history('evident', 'adj.', '明显的；显而易见的', 'vision', ['root-vid', 'suf-ent']);
  history('evidence', 'n.', '证据；迹象', 'vision', ['root-vid']);
  history('revise', 'v.', '修改；修订；复习', 'vision', ['pre-re', 'root-vis'], { forms: ['revised', 'revising'] });
  history('revision', 'n.', '修改；修订版；复习', 'vision', ['pre-re', 'root-vis', 'suf-ion']);
  history('supervise', 'v.', '监督；主管', 'vision', ['root-vis'], { forms: ['supervised', 'supervising'] });
  history('envious', 'adj.', '妒忌的；羡慕的', 'vision', [], { note: '现代词族关联 envy。历史路径可追溯到与「看」有关的拉丁语构词。' });
  history('envy', 'n.', '羡慕；妒忌', 'vision', [], { note: '拉丁语 invidēre 早期含有「恶意地看」的意思。' });
  history('wit', 'n.', '机智；才智', 'vision', [], { source: ahRoots });
  history('wise', 'adj.', '明智的；有智慧的', 'vision', [], { source: ahRoots, forms: ['wiser', 'wisest'] });
  history('wisdom', 'n.', '智慧；明智', 'vision', [], { source: ahRoots });
  history('complete', 'adj.', '完整的；完全的', '', ['pre-com-intense', 'root-ple'], {
    note: 'com- 在这一拉丁语来源中可能起加强作用。'
  });

  for (const [word, pos, gloss, family, parts] of [
    ['quickly', 'adv.', '迅速地', 'quick', ['root-quick', 'suf-ly-adv']],
    ['friendly', 'adj.', '友好的', 'friend', ['root-friend', 'suf-ly-adj']],
    ['kindness', 'n.', '善意；仁慈', 'kind', ['root-kind', 'suf-ness']],
    ['helpful', 'adj.', '有帮助的', 'help', ['root-help', 'suf-ful']],
    ['careful', 'adj.', '小心的；仔细的', 'care', ['root-care', 'suf-ful']],
    ['careless', 'adj.', '粗心的', 'care', ['root-care', 'suf-less']],
    ['useful', 'adj.', '有用的', 'use', ['root-use', 'suf-ful']],
    ['useless', 'adj.', '无用的', 'use', ['root-use', 'suf-less']],
    ['readable', 'adj.', '可读的；易读的', 'read', ['root-read', 'suf-able']],
    ['unreadable', 'adj.', '无法辨认的；难读的', 'read', ['pre-un', 'root-read', 'suf-able']],
    ['agreement', 'n.', '协议；一致', 'agree', ['root-agree', 'suf-ment']],
    ['disagreement', 'n.', '分歧；意见不合', 'agree', ['pre-dis', 'root-agree', 'suf-ment']],
    ['unfair', 'adj.', '不公平的', 'fair', ['pre-un', 'root-fair']]
  ]) add(word, pos, gloss, family, parts, { mode: '现代构词', source: caSuffix });

  const mnemonicSource = 'https://www.metmuseum.org/exhibitions/listings/2014/assyria-to-iberia/blog/posts/alphabet';
  add('acute', 'adj.', '尖锐的；急性的；剧烈的', '', [], {
    mnemonic: '把 A 的两笔想成牛角的尖端，联想 acute angle「锐角」。', mnemonicSource
  });
  add('ache', 'n.', '持续的疼痛', '', [], {
    mnemonic: '把 A 想成疼痛时张开的嘴，联想 ache「疼」。',
    source: 'https://blog.oup.com/2012/01/etymological-headache-origin-word-ache/'
  });
  add('arrow', 'n.', '箭；箭头', '', [], {
    mnemonic: '把大写 A 的尖顶想成箭头。', forms: ['arrows']
  });
  add('uncle', 'n.', '叔叔；舅舅；伯父', '', [], { forms: ['uncles'] });
  add('fine', 'adj.', '好的；晴朗的；精细的', '', []);
  add('word', 'n.', '单词；话语', '', [], { forms: ['words'] });
  add('book', 'n.', '书；书籍', '', [], { forms: ['books'] });
  add('apple', 'n.', '苹果', '', [], { forms: ['apples'] });
  add('water', 'n.', '水', '', []);
  add('music', 'n.', '音乐', '', []);
  add('bicycle', 'n.', '自行车', '', [], { forms: ['bicycles'] });
  add('quick', 'adj.', '快的；迅速的', 'quick', ['root-quick']);
  add('friend', 'n.', '朋友', 'friend', ['root-friend'], { forms: ['friends'] });
  add('help', 'v.', '帮助', 'help', ['root-help']);
  add('care', 'v.', '在意；关心', 'care', ['root-care']);
  add('use', 'v.', '使用；利用', 'use', ['root-use']);
  add('read', 'v.', '读；阅读', 'read', ['root-read'], { forms: ['reads', 'reading'] });
  add('agree', 'v.', '同意；一致', 'agree', ['root-agree'], { forms: ['agreed', 'agreeing'] });

  globalThis.WordRootsSeed = { types, morphemes, entries };
})();
