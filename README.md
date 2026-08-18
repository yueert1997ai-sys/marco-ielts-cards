# Marco IELTS Cards

一个极简、手机端优先的 IELTS 随机单词卡。打开即抽卡，先回忆英文含义，再翻面核对中文、可靠改写和必要搭配。

词库的唯一源文件是飞书文档 `Marco IELTS Core Vocabulary`。仓库中的 `source/feishu_export.json` 与 `data/words.json` 都是用于静态网页发布的构建快照，不应在里面手工维护词条。

## 如何本地打开

在项目目录运行：

```bash
python -m http.server 8000
```

浏览器访问 `http://localhost:8000/`。不要直接双击 `index.html`，浏览器会阻止页面读取 `data/words.json`。

## 如何更新词库

先把飞书主文档的最新读取结果保存为 `source/feishu_export.json`，然后运行：

```bash
python scripts/build_words.py
python scripts/validate_words.py
```

如果电脑已安装并登录 `lark-cli`，可以读取同一篇主文档：

```bash
lark-cli docs +fetch --doc "https://my.feishu.cn/docx/X1zhd3t8PoPlPMxx4eTcoyzRnE0"
```

把命令的完整 JSON 输出保存到 `source/feishu_export.json`。也可以直接让 Codex 使用 `$marco-ielts-vocabulary` 更新飞书后，再重新生成网页数据。

## 本地记录

“不会的”、当前模式、S/A/B筛选和随机队列位置保存在浏览器 `localStorage`。同一台手机刷新页面不会丢失；清除浏览器网站数据或换设备后不会自动同步。

网页链接本身不携带进度。别人打开同一个链接，会在对方自己的浏览器里生成独立记录，不会修改你的记录。需要换手机或防止误清缓存时，展开网页底部“进度管理”，先下载 JSON 备份；在新设备用“恢复进度”选择该文件。

## 卡片字段

- S/A/B 重要性来自飞书主词库并显示在卡片背面。
- “同义词 / 可靠改写”来自飞书的“可靠改写”列；没有可靠内容时明确显示暂未收录，不用主题相关词凑数。
- 当前飞书表没有独立词性列。网页和构建脚本已经支持 `partOfSpeech` 字段及带“词性”列的七列表格；在主词库补齐前，单词显示“词性待补充”，多词表达显示“词组”。

## 如何部署 GitHub Pages

1. 将项目推送到 GitHub 仓库 `marco-ielts-cards` 的 `main` 分支。
2. 打开仓库 `Settings > Pages`。
3. 在 `Build and deployment` 中选择 `Deploy from a branch`。
4. 选择 `main` 和 `/ (root)`，保存。
5. 部署完成后访问：`https://<你的用户名>.github.io/marco-ielts-cards/`。

项目是纯静态文件，不需要构建命令、服务器、数据库或环境变量。
