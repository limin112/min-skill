---
name: wechat-publish-template
description: 把 Markdown 文章转成"个人技术风"公众号 HTML（橙黑赛博朋克风格）。用户提供 .md 文件路径，或贴一段 Markdown，并说"转成公众号"/"做成公众号排版"/"套公众号模板"时触发。产物是单一 HTML 文件，全 inline style，可直接在浏览器打开后全选复制粘贴到微信公众号编辑器。不要在用户只是问"如何写公众号"或"公众号选题"这类非排版问题时触发。
version: 0.2.0
---

# wechat-publish-template

把 Markdown 草稿转成可直接粘贴进微信公众号编辑器的 HTML，使用统一的"个人技术风"视觉系统（主橙 #FF5722 + 深黑 #0A0A0A + 浅灰 #F5F5F5）。

## 何时触发

✅ 触发：
- 用户给一个 `.md` 路径并说"转公众号 / 转成公众号 HTML / 套模板 / 排版"
- 用户贴一段 Markdown 文本并说"做成公众号文章"
- 用户说"用我的公众号模板"且当前 skill 已装

❌ **不要**触发：
- 用户问"公众号选题怎么选"——这是写作建议，不是排版
- 用户问"公众号怎么涨粉"——同上
- 用户要求别的视觉风格（极简、Notion 风等）——本 skill 只输出橙黑赛博朋克风
- 用户要求把公众号文章反向转成 MD

## 工作流

### Step 1：读输入

- 如果给了文件路径：`Read` 该 `.md` 文件
- 如果直接贴的文本：直接用
- 同时 `Read` `references/wechat-html-constraints.md` 了解可用/不可用 HTML 特性
- `Read` `assets/template.html` 拿到所有 block 的标准写法

### Step 2：拆 MD 结构 → 选 block

按下表把 MD 结构映射到模板 block：

| MD 模式                          | 对应 block               | 说明                          |
| ------------------------------ | ---------------------- | --------------------------- |
| 文档第一个 `# 标题`                   | `cover`                | 大标题封面，副标题用 tagline          |
| 紧跟在标题后的 1-3 句开场                | `intro`                | 套"导语"标签                     |
| `## 二级标题`                      | `numbered-heading`     | 自动编号 01/02/03…，编号取章节顺序      |
| 普通段落                           | `paragraph`            | 默认正文                        |
| `> 引用块`                        | `quote`                | 套"引用块"装饰                    |
| 段落中含"**结论 / 重点 / 一句话**"等关键词    | `callout-key`          | 升级成"重点结论"卡片                 |
| ` ```代码 ``` `                  | `code`                 | 行号 + 深色配色                   |
| 数字列表 + "第一步/第二步" 或 1-3 步骤      | `steps`                | 三列卡片，最多 3 个；超过则降级为 ordered list |
| `![alt](url)` 图片                | `figure`               | 提醒用户**在公众号编辑器里手动替换**为上传后 URL |
| `- [x]` 任务列表 或 项目数 ≥ 4 的并列短句     | `checklist`            | 双列勾选                        |
| 文末"## 总结 / 最后 / 写在最后"          | `summary`              | 套"总结"卡片                     |
| 文末关注引导                         | `cta-follow`           | 黑底关注 CTA，二维码占位              |

### Step 3：拼装

按 MD 章节顺序把 block 拼起来，包在最外层 `<section style="max-width:677px;margin:0 auto;...">` 里。`max-width:677px` 是公众号正文宽度的最佳值。

### Step 4：输出

- 默认输出到 MD 同目录，文件名 `<原文件名>.wechat.html`
- 如果用户没给文件路径，输出到 `./output.wechat.html`
- 输出后**告诉用户三件事**：
  1. HTML 文件路径
  2. 使用流程：浏览器打开 → 全选复制 → 公众号编辑器粘贴
  3. 图片需要在公众号编辑器里手动重新上传

## 同步到微信公众号（wechatsync CLI）

排版好的 HTML 可以用 `wechatsync` CLI 直接同步到公众号草稿箱，免去手动复制粘贴。

> ⚠️ **平台 key 是 `weixin`，不是 `wechat`。** wechatsync 体系里微信公众号的 driver 名就叫 `weixin`，用 `wechat` 会报「找不到平台」。而且 `sync` 不写 `-p` 时默认发去 `zhihu,juejin`，所以发公众号**必须显式** `-p weixin`。

```bash
wechatsync sync "<文件名>.wechatsync.html" -p weixin --timeout 60000
```

**前提（缺一不可）：**
- 常用 Chrome 里装了扩展「文章同步助手」(Wechatsync)，且已登录公众号后台
- 扩展的「同步桥接」开关打开
- CLI ↔ 扩展走 WebSocket **9527** 端口：**CLI 是监听方、扩展是连接方**——必须先跑 `wechatsync sync`（它才起 9527 监听），扩展再自动连上来。光点扩展图标不会同步本地 HTML。**命令一直卡住不返回 = 扩展没连上**（没装 / 没开桥接 / 常用 Chrome 没开）。

**`.wechatsync.html` vs `.wechat.html`：**
- `.wechat.html`：`<img src>` 留空，走"浏览器打开 → 全选复制 → 编辑器粘贴"的手动流（见 Step 4）
- `.wechatsync.html`：`<img src>` 填**本地绝对路径**，交给扩展自动上传到素材库。要走 CLI 同步就额外生成这个变体。

同步过去通常落在**草稿箱**，不会直接群发。

## 必守规则

1. **全部 inline style**——禁止生成 `<style>` 块或 `class` 属性
2. **不要 JS / 不要伪元素 / 不要 transform**——参见 `references/wechat-html-constraints.md`
3. **保留 emoji**——但装饰用的几何字符（▶ ★ ◎ ⚡）只能在 `<section>` 内做装饰，不要靠它承载语义
4. **图片 `src` 留空**或填 `"REPLACE_IN_WECHAT_EDITOR"`——`.wechat.html`（手动粘贴流）里绝不嵌入本地路径或外链。**例外**：要走 wechatsync CLI 同步时，另存一份 `.wechatsync.html`，`src` 填本地绝对路径供扩展上传（见上节「同步到微信公众号」）
5. **链接保留但提示**——告诉用户公众号会剥外链
6. **色板锁死**：主橙 `#FF5722`、深黑 `#0A0A0A`、文字 `#1A1A1A`、浅灰 `#F5F5F5`，不要自创颜色

## 调用示例

用户："把 `/path/to/draft.md` 转成公众号"
→ 读文件 → 拆结构 → 拼 block → 写到 `/path/to/draft.wechat.html` → 报告

用户："这段贴一下：[一段 MD]，做成公众号"
→ 直接拆 → 拼 → 写到 `./output.wechat.html` → 报告

## 资源

- `assets/template.html`：完整模板（所有 block 的标准写法 + HTML 注释里的 block 名）
- `references/wechat-html-constraints.md`：公众号编辑器 HTML 限制速查
- `evals/evals.json`：测试用例（用 Anthropic skill-creator 的评测流程跑）
