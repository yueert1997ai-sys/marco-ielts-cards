# Marco IELTS Cards

一个极简、手机端优先的 IELTS 随机单词卡。打开即抽卡，先回忆英文含义，再翻面核对中文、可靠改写和必要搭配。

“今日 50”训练模式会按手机本地日期，从完整 903 词中生成当天固定的 50 个词。系统先安排已经到期的复习词，再用尚未训练的词补足，并按 S → A → B 推进。答“认识”后会依次在 1、3、7、14、30、60 天后再次出现；答“不会”会重置为次日复习。只有“认识”或“不会”会计入完成，跳过的词会在当天再次出现。第二天自动生成新题单，首页保留到期数量、近 7 天完成日历与连续完成天数。

“认识 / 会了”或“不会”点错后，可以立即使用卡片下方的“撤销上一步”恢复该词和训练进度。撤销只保留最近一次评分，切换模式或主动跳到下一张后清除。

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

“不会的”、间隔复习排期、当前模式、S/A/B 筛选和每日训练记录保存在浏览器 `localStorage`。普通随机模式每次重新打开或刷新网页都会重新洗牌；每日训练会保留当天已完成的词，并按“到期复习优先、新词补足”的顺序继续。旧版本已有的弱词和训练记录会自动迁移到新的复习排期，不会清空。清除浏览器网站数据或换设备后，记录不会自动同步。

网页链接本身不携带进度。别人打开同一个链接，会在对方自己的浏览器里生成独立记录，不会修改你的记录。需要换手机或防止误清缓存时，展开网页底部“进度管理”，先下载 JSON 备份；在新设备用“恢复进度”选择该文件。

## 卡片字段

- S/A/B 重要性来自飞书主词库并显示在卡片背面。
- “同义词 / 可靠改写”来自飞书的“可靠改写”列；没有可靠内容时明确显示暂未收录，不用主题相关词凑数。
- 903 条词性来自飞书主文档末尾的“词性索引”。单词采用 `n. / v. / adj. / adv.` 等常见缩写，多词表达按动词短语、介词短语、形容词短语等语法功能标注。

## 如何部署 GitHub Pages

1. 将项目推送到 GitHub 仓库 `marco-ielts-cards` 的 `main` 分支。
2. 打开仓库 `Settings > Pages`。
3. 在 `Build and deployment` 中选择 `Deploy from a branch`。
4. 选择 `main` 和 `/ (root)`，保存。
5. 部署完成后访问：`https://<你的用户名>.github.io/marco-ielts-cards/`。

项目是纯静态文件，不需要构建命令、服务器、数据库或环境变量。
