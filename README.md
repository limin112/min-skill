# minli-skill

我自己在用的 [Claude Code Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) 合集。
一次 clone，装好里面全部 skill。

by [@MinLiBuilds](https://x.com/MinLiBuilds)

## 内容

| Skill | 干什么 | 配套文章 |
|---|---|---|
| [**explain-video**](skills/explain-video) | 把一个概念做成**带旁白的讲解视频**：讨论 → 讲解框架 → HTML 幻灯 → 口播稿 → TTS 人声 → 字幕 → BGM → 录屏 → 合成 | 《从 0 手搓一条口播视频流水线》 |
| [**wechat-publish-template**](skills/wechat-publish-template) | 把 Markdown 转成可直接粘贴进公众号编辑器的 HTML（橙黑赛博朋克风） | [创建真正可用的 Skill 完整教程](https://x.com/MinLiBuilds/status/2055980925452968351?s=20) |

## 安装

先 `cd` 到用户目录，再用相对路径 clone（避开 `~` 在 Windows 不展开的坑）：

```bash
cd ~
git clone https://github.com/limin112/minli-skill.git .claude/skills/minli-skill
```

重启 Claude Code 即生效——两个 skill 会一起加载。验证一下：

```bash
claude plugin details minli-skill
#   Skills (2)  explain-video, wechat-publish-template
```

> **Windows cmd.exe 用户**：第 1 步改成 `cd /d %USERPROFILE%`，第 2 步原样跑就行（路径分隔符用 `/` 现代 git 也接受）。
>
> ⚠️ **不要写成 `git clone ... ~/...`**——`~` 在 Windows 的 cmd 和 PowerShell 里不会展开，会在当前目录下创建一个字面的 `~` 文件夹。
>
> 如果 clone 报错 `could not create work tree dir`，说明 `.claude/skills/` 不存在，先建一下：`mkdir -p .claude/skills`（cmd 用 `mkdir .claude\skills`），再 clone。

只想对**当前项目**生效，就 clone 到项目里（不用 cd）：

```bash
git clone https://github.com/limin112/minli-skill.git .claude/skills/minli-skill
```

更新：`cd ~/.claude/skills/minli-skill && git pull`。
不想要了：删掉这个目录就行（`claude plugin disable minli-skill@skills-dir` 可以只停用不删）。

## 怎么用

不用记命令，直接说需求，Claude 识别到就会触发：

- “帮我做一条讲解视频，主题是 XXX” → `explain-video`
- “把 `draft.md` 转成公众号” → `wechat-publish-template`

每个 skill 目录下的 README 有各自的详细用法、依赖和已知短板。

## 工具

`tools/` 下放的不是 skill，是独立的命令行工具，Claude Code 不会加载它们，按各自 README 手动安装。

| 工具 | 干什么 |
|---|---|
| [**uu-term-bridge**](tools/uu-term-bridge) | 让网易UU远程手机端的终端列表看到并接管 Mac 上 iTerm2 的每个标签，手机新开的终端在 Mac 自动弹窗。只适用于 macOS + iTerm2 + UU远程 |

## 这个仓库长什么样

```
minli-skill/
├── .claude-plugin/plugin.json      ← 让整个文件夹作为一个 skill 合集被加载
├── tools/
│   └── uu-term-bridge/             ← 独立工具，不是 skill：install.sh + bin/ + test/
└── skills/
    ├── explain-video/              ← SKILL.md + scripts/ + references/
    └── wechat-publish-template/    ← SKILL.md + assets/ + references/ + evals/
```

`skills/` 下每多一个带 `SKILL.md` 的文件夹，就多一个 skill，不用改任何配置。
想只要其中一个，把那一个文件夹单独拷到 `~/.claude/skills/` 下也能用。

> 这个仓库原来叫 `wechat-publish-template`（只有一个 skill，`SKILL.md` 在根目录）。
> 改成合集之后旧的 clone 路径不再自动加载，重新按上面装一次即可；
> GitHub 会把旧仓库地址自动重定向到这里。

## License

MIT
