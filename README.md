# 词源笔记

英语构词查询、个人词素与复习卡片。新版用本机 Node.js 服务按词查询 SQLite，网页只接收当前需要的条目。项目无需安装 npm 依赖。

## 打开

在项目目录执行 `npm run dev`，打开终端显示的地址，默认是 `http://127.0.0.1:4173`。使用 Node.js 24 或更新版本。首次启动时，本机会把随附的雅思起步词表和词光词表写入 `data/dictionary.sqlite`。此步骤可离线完成。

可搜 `hypotheses` 验证词形索引，搜 `habitat` 查雅思词库，搜 `unhelpful` 展开候选拆法，再搜 `collaboration` 对照已核对的历史构词。基础界面也可双击 `index.html` 打开，便于使用旧版页面的个人词卡备份。

## 查词与复习

- 词条可以切换义项、查看来源或点开词素，了解用法、变体及例词。
- 在「我的词素」添加类型和词素。回到查词页选择「编辑我的拆词」，选中单词中的字母后点击「添加片段」，再选择对应词素。也可手动填写片段首尾位置，从 1 开始且包含首尾字母。
- 可保存当前词，或勾选相关词后批量保存。到「我的词卡」翻看背面并提交复习反馈。
- SQLite 释义、候选拆词和复习可离线使用。程序优先显示自建词库和个人条目。启动后可选中「本地查不到时联网补查英文释义」，缺词时会把该单词发送给 [英文 Wiktionary](https://en.wiktionary.org/)。查询和收藏内容会显示来源及许可。网络超时后可继续手动添加。浏览器发音使用系统语音合成。
- HTTP 模式个人数据优先存入 IndexedDB，直接打开文件时使用浏览器本地存储。初次从旧版切换时，先在原地址进入「我的词卡」导出 JSON，然后在本机服务的页面导入。以后继续用同一个浏览器、地址和端口。

## 雅思词库

随附的 `data/ielts-starter.tsv` 是项目自编的雅思主题起步词表，覆盖学术研究、教育工作、环境、健康、科技、经济和城市文化。可通过下方命令下载并导入规模更大的词库。

```powershell
npm run import:ielts
```

Git 仓库中的 `data/word-atlas-base.jsonl` 收录了从原始 7,298 条记录提取的 7,279 个可查询单词，仅保留拼写、词性、中文释义、音标和主题。上方命令可从 [词光 Word Atlas 词库](https://github.com/designfuchen/word-atlas/blob/main/data/word-atlas.json) 下载新版数据。词汇文本由 Word Atlas contributors（词光）提供，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。词表是雅思学习资料，详情见 [词光项目说明](https://github.com/designfuchen/word-atlas/blob/main/README.en.md)。

如果用浏览器下载，执行 `npm run import:ielts -- "E:\Downloads\word-atlas.json"` 导入本地文件。导入后重启服务，页脚会显示收录数。

## 接入 ECDICT

从 [ECDICT](https://github.com/skywind3000/ECDICT) 下载 `ecdict.csv`，执行 `npm run import:ecdict -- "E:\Downloads\ecdict.csv"`。可在路径后加条数以快速试导入。导入脚本读取 `word`、`translation`、`phonetic` 与 `exchange`，将单词及其词形写入 SQLite。原先导入过 `dictionary.js` 的用户也可用自己的原始 CSV 重导一次。

## 文件

- `data/seed.js` 保存示例释义、词素、分析和出处。
- `core.js` 负责标准化、查词、候选、推荐、复习和备份校验。
- `app.js` 管理交互及持久化，`index.html` 和 `styles.css` 控制界面。
- `serve.mjs` 启动本机服务，`dictionary.mjs` 实现 SQLite 查询，`online.mjs` 提供可选的联网补查。
- `.gitignore` 排除运行时数据库及其日志、导入下载、个人词卡备份、环境配置和构建产物。
