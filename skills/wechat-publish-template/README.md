# wechat-publish-template

[![一个 Skill 减少 30 分钟排版 — 创建真正可用的 Skill 完整教程](assets/post-cover.jpg)](https://x.com/MinLiBuilds/status/2055980925452968351?s=20)

**配套教程**：[创建真正可用的 Skill 完整教程 — 拆解公众号排版](https://x.com/MinLiBuilds/status/2055980925452968351?s=20) · [@MinLiBuilds](https://x.com/MinLiBuilds)

把 Markdown 草稿一键转成可直接粘贴进微信公众号编辑器的 HTML，统一"个人技术风"视觉系统（橙黑赛博朋克：主橙 `#FF5722` + 深黑 `#0A0A0A` + 浅灰 `#F5F5F5`）。

这是一个 [Claude Code Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)，由 Claude 在识别到合适意图时自动触发。

> **说明**：本 skill 只内置一种风格（橙黑赛博朋克），主要作为**教学示例**，演示"如何把一套公众号视觉规范封装成 Claude Code Skill"。欢迎 fork 后改色板、改 block 模板、改触发词，做出你自己的风格——`SKILL.md` + `assets/template.html` + `references/wechat-html-constraints.md` 就是改造入口。

## 安装

这个 skill 是 [**minli-skill**](../../) 合集的一部分，跟着合集一起装：

```bash
cd ~
git clone https://github.com/limin112/minli-skill.git .claude/skills/minli-skill
```

只想要这一个 skill，就把本文件夹单独拷到 `~/.claude/skills/wechat-publish-template/` 下。

安装细节（含 Windows 注意事项）见[合集 README](../../README.md#安装)。下次启动 Claude Code 即生效。

## 使用

在 Claude Code 里说：

- "把 `/path/to/draft.md` 转成公众号"
- "套公众号模板 / 做公众号排版"
- 直接贴一段 Markdown 然后说"做成公众号文章"

产物：一个独立 HTML 文件（默认 `<原名>.wechat.html`），全 inline style，无 `<style>` / `<script>` / `class`。

发布流程：

1. 浏览器打开生成的 HTML
2. `Cmd+A` 全选 → `Cmd+C` 复制
3. 粘贴到公众号编辑器
4. 图片需要在编辑器里重新上传（HTML 里只是占位）

## 视觉风格

- **主色**：`#FF5722`（橙）
- **背景**：`#0A0A0A`（深黑） / `#F5F5F5`（浅灰）
- **正文文字**：`#1A1A1A`
- **正文宽度**：`max-width: 677px`（公众号最佳值）

本 skill 只输出这一种风格——这是有意的约束，让 Claude 不会在"风格自由发挥"上浪费 token。想要别的风格，**fork 一份改色板和 block 模板**就行（见上方"说明"）。

## Markdown → block 映射

| MD 模式 | 对应 block |
| --- | --- |
| 文档第一个 `#` 标题 | `cover`（封面） |
| 标题后 1-3 句开场 | `intro`（导语） |
| `##` 二级标题 | `numbered-heading`（自动编号 01/02/03） |
| 普通段落 | `paragraph` |
| `>` 引用 | `quote` |
| 含"结论 / 重点"关键词的段落 | `callout-key`（重点卡片） |
| ` ``` ` 代码块 | `code`（行号 + 深色） |
| 1-3 步骤的数字列表 | `steps`（三列卡片） |
| `![alt](url)` | `figure`（占位，需手动重传） |
| `- [x]` 任务列表 | `checklist`（双列勾选） |
| 文末"## 总结" | `summary` |
| 文末关注引导 | `cta-follow`（黑底 CTA） |

完整 block 标准写法见 `assets/template.html`。

## 文件结构

```
.
├── SKILL.md                              # skill 元数据 + 工作流（Claude 读这个）
├── assets/
│   └── template.html                     # 所有 block 的参考实现
├── references/
│   └── wechat-html-constraints.md        # 公众号编辑器 HTML 限制速查
└── evals/
    └── evals.json                        # skill-creator 评测用例
```

## 公众号 HTML 限制

公众号编辑器对 HTML 有严格限制，本 skill 已规避：

- 无 `<style>` 块、无外链 CSS、无 `class`（全 inline）
- 无 JS、无伪元素（`::before` / `::after`）、无 `transform`
- 图片必须用编辑器上传，外链会被剥
- 链接会被剥成纯文本（除微信白名单外）

详见 `references/wechat-html-constraints.md`。

## License

MIT
