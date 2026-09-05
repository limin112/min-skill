# min-skill

我自己在用的 [Claude Code Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) 和命令行工具合集。按需挑，不用全装。

by [@MinLiBuilds](https://x.com/MinLiBuilds)

## 里面有什么

两类东西，装法不一样。

Skill：放在 `skills/` 下，Claude Code 加载后按需求自动触发。

| Skill | 干什么 | 配套文章 |
|---|---|---|
| [**explain-video**](skills/explain-video) | 把一个概念做成**带旁白的讲解视频**：讨论 → 讲解框架 → HTML 幻灯 → 口播稿 → TTS 人声 → 字幕 → BGM → 录屏 → 合成 | 《从 0 手搓一条口播视频流水线》 |
| [**wechat-publish-template**](skills/wechat-publish-template) | 把 Markdown 转成可直接粘贴进公众号编辑器的 HTML（橙黑赛博朋克风） | [创建真正可用的 Skill 完整教程](https://x.com/MinLiBuilds/status/2055980925452968351?s=20) |

工具：放在 `tools/` 下，是独立的命令行程序，Claude Code 不会加载它们，按各自 README 手动安装。

| 工具 | 干什么 | 适用 |
|---|---|---|
| [**uu-term-bridge**](tools/uu-term-bridge) | 让网易UU远程手机端的终端列表看到并接管 Mac 上 iTerm2 的每个标签，手机新开的终端在 Mac 自动弹窗 | [1 分钟，开源模型原生支持移动端](https://x.com/MinLiBuilds/status/2096238709381476424?s=20) |

## 安装

### 只要一个 skill

把那个文件夹拷到 `~/.claude/skills/` 下就行，不需要整个仓库：

```bash
cd ~
git clone https://github.com/limin112/min-skill.git /tmp/min-skill
mkdir -p .claude/skills
cp -r /tmp/min-skill/skills/explain-video .claude/skills/explain-video
```

换成 `wechat-publish-template` 同理。重启 Claude Code 生效。

### 全部 skill 一起装

先 `cd` 到用户目录，再用相对路径 clone（避开 `~` 在 Windows 不展开的坑）：

```bash
cd ~
git clone https://github.com/limin112/min-skill.git .claude/skills/minli-skill
```

重启 Claude Code 即生效，`skills/` 下的 skill 会一起加载，`tools/` 不会被加载。验证一下：

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
git clone https://github.com/limin112/min-skill.git .claude/skills/minli-skill
```

更新：`cd ~/.claude/skills/minli-skill && git pull`。
不想要了：删掉这个目录就行（`claude plugin disable minli-skill@skills-dir` 可以只停用不删）。

### 只要一个工具

clone 到任意位置，进那个工具的目录，看它的 README 装：

```bash
git clone https://github.com/limin112/min-skill.git
cd min-skill/tools/uu-term-bridge
./install.sh --dry-run   # 先看会做什么
./install.sh
```

每个工具都自带 `uninstall.sh`，不想要了跑一下就干净了。

## 怎么用

Skill 不用记命令，直接说需求，Claude 识别到就会触发：

- “帮我做一条讲解视频，主题是 XXX” → `explain-video`
- “把 `draft.md` 转成公众号” → `wechat-publish-template`

工具装完按它 README 里说的用，和 Claude Code 无关。

每个目录下的 README 有各自的详细用法、依赖和已知短板。

## 这个仓库长什么样

```
min-skill/
├── .claude-plugin/plugin.json      ← 让整个文件夹作为一个 skill 合集被加载
├── skills/                         ← Claude Code 加载的 skill
│   ├── explain-video/              ← SKILL.md + scripts/ + references/
│   └── wechat-publish-template/    ← SKILL.md + assets/ + references/ + evals/
└── tools/                          ← 独立工具，不是 skill，手动安装
    └── uu-term-bridge/             ← install.sh + bin/ + test/
```

`skills/` 下每多一个带 `SKILL.md` 的文件夹，就多一个 skill，不用改任何配置。`tools/` 下的东西不受这个机制影响。

> 这个仓库原来叫 `wechat-publish-template`，后来叫 `minli-skill`。旧地址 GitHub 会自动重定向到这里；
> 按旧方式 clone 到 `~/.claude/skills/minli-skill` 的，`git pull` 就能拿到最新的。

## License

MIT
