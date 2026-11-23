# FreeToken-Bots v1.1

**免费模型雷达 + 额度管理 + 零费用路由**，覆盖 OpenRouter 和 OpenCode Zen。

两个平台的免费模型，官方允许的用法不一样，FreeToken-Bots 按各自的规则接入：

| 来源 | 官方规则 | FreeToken-Bots 怎么用 |
|---|---|---|
| **OpenRouter** 免费模型（`:free`） | 用自己的 API key，任何客户端都可以调用 | 本地 OpenAI 兼容**路由**：任何 Agent 都能接，额度用完/限流/宕机时只在免费模型之间自动切换，**永远不会切到收费模型** |
| **OpenCode Zen** 免费模型（`*-free`、`big-pickle`） | 官方文档：「Free-tier chat models require OpenCode; use paid models or Go from other clients.」只能在 OpenCode 客户端里用，不需要 key | 安装 **OpenCode** 直接用；其他 Agent 用 `ftb delegate "任务"` 把**整个任务**交给 OpenCode 去做 |

另外每天扫描两个平台，记录新增免费、取消免费、限时活动、匿名模型，并生成日报。

- 只用 Python 标准库，Python ≥ 3.9，不用 `pip install`
- 不依赖任何收费的模型目录或监控服务，数据全部来自两个平台的官方公开 API
- 默认只监听 `127.0.0.1`，不会改你的 Agent 配置（除非你明确确认）
- 不冒充 OpenCode 客户端，不把 Zen 免费模型包装成 API 给别的 Agent 用

---

## 目录

- [5 分钟上手](#5-分钟上手)
- [三种用法](#三种用法)
- [命令一览](#命令一览)
- [接入各个 Agent](#接入各个-agent)
- [ftb delegate：让任何 Agent 用上 Zen 免费模型](#ftb-delegate让任何-agent-用上-zen-免费模型)
- [免费额度：哪些是实测，哪些是文档，哪些未知](#免费额度哪些是实测哪些是文档哪些未知)
- [安全设计：为什么不会花钱](#安全设计为什么不会花钱)
- [每日报告和定时扫描](#每日报告和定时扫描)
- [配置](#配置)
- [已知限制](#已知限制)
- [测试](#测试)

---

## 5 分钟上手

```bash
# 1. 拿到代码（只要这个文件夹）
git clone https://github.com/limin112/min-skill.git
cd min-skill/skills/FreeToken-Bots
ln -s "$PWD/bin/ftb" ~/.local/bin/ftb      # 可选：把 ftb 放进 PATH；否则用 python3 scripts/ftb.py

# 2. 首次安装：配置 OpenRouter key + 安装 OpenCode（都会先问你）
ftb setup

# 3. 扫描、查看
ftb scan
ftb models                                 # 哪些能走路由、哪些只能在 OpenCode 里用
ftb doctor

# 4a. OpenRouter 免费模型：启动路由，任何 Agent 都能接
ftb serve                                  # http://127.0.0.1:8787/v1，模型填 auto
ftb run codex -- exec "解释一下这个仓库"     # 或者不起服务，直接 ftb run

# 4b. Zen 免费模型：在 OpenCode 里用，或者让别的 Agent 委托给 OpenCode
opencode                                   # /models 里选 opencode/*-free
ftb delegate "给 README 加一节安装说明" --dir ~/my-repo
```

### 首次安装：`ftb setup`

1. **OpenRouter API key**：会问要不要在浏览器打开 https://openrouter.ai/settings/keys ，然后粘贴 key（不回显），保存到 `~/.freetoken-bots/keys.env`（权限 600），并通过 `GET /api/v1/key` 免费校验一次。
2. **OpenCode**：没装的话问你要不要安装（有 npm 用 `npm install -g opencode-ai`，否则用官方脚本 `curl -fsSL https://opencode.ai/install | bash`）。**Zen 免费模型在 OpenCode 里不需要任何 key。**

- 第一次运行任何 `ftb` 命令时会提示运行 `ftb setup`；作为 skill 使用时，Agent 也会在首次安装时问你。
- 环境变量 `OPENROUTER_API_KEY` 优先于 `keys.env`；已经 export 了可以用 `ftb setup --from-env` 存进去。存进 `keys.env` 的好处是 cron / launchd 也能读到。
- 不配 OpenRouter key：它的免费模型照样扫描、进报告，只是不参与路由。

> 关于 OpenCode 的 API key（https://opencode.ai/console/account → Personal API Keys）：它是给**付费** Console 模型和 OpenCode Go 用的。官方明确免费模型不能从其他客户端调用，所以 FreeToken-Bots 不需要、也不会使用这个 key。

## 三种用法

```
             ┌──────────────── OpenRouter 免费模型（需要 key）
 任何 Agent ──┤ ftb 路由（auto，免费模型之间自动切换）
             │
 OpenCode ───┼──────────────── OpenCode Zen 免费模型（OpenCode 内置，不需要 key）
             └── 也可以通过 ftb 路由用 OpenRouter 免费模型（ftb opencode setup）

 Pi / Codex / Hermes / Grokbot / Claude Code ...
   └─ shell: ftb delegate "任务" ──> OpenCode 用 Zen 免费模型完成整个任务，返回结果
```

1. **任何 Agent → 路由 → OpenRouter 免费模型**：Agent 自己的对话循环用免费模型。
2. **直接用 OpenCode**：Zen 免费模型原生可用；`ftb opencode setup` 后 OpenCode 里还能选 `freetoken/auto`（OpenRouter 免费模型）。
3. **其他 Agent 委托给 OpenCode**：`ftb delegate` 把一个完整任务交给 OpenCode，OpenCode 用自己的工具在指定目录里干活，结果打印出来。主 Agent 负责拆任务、看结果。

## 命令一览

| 命令 | 作用 |
|---|---|
| `ftb setup [--from-env] [--no-browser]` | 首次安装：OpenRouter key + 安装 OpenCode |
| `ftb scan [--provider openrouter\|opencode]` | 拉取目录、记录变化、生成当天报告 |
| `ftb models [--tools] [--provider p] [--all] [--json]` | 免费模型列表：工具调用、上下文、截止日期、能否走路由 / 只能在 OpenCode 里用 |
| `ftb report [--hours 24] [--json]` | 变化报告 |
| `ftb quota [--no-live] [--json]` | 各平台额度状态，每项都标明数据来源 |
| `ftb probe --model <key> [--tools]` / `ftb probe --all [--limit N]` | 真实试调用 OpenRouter 免费模型 |
| `ftb route [--tools] [--model m]` | 只显示切换顺序，不发请求 |
| `ftb serve [--host h] [--port p]` | 启动路由 |
| `ftb status` | 路由运行状态、各平台是否可用、冷却中的模型 |
| `ftb opencode status\|install\|setup [--yes]` | OpenCode 安装情况、客户端里能用的 Zen 免费模型；`setup` = 安装 + 把 OpenRouter 免费模型加进 OpenCode |
| `ftb delegate "任务" [--dir d] [--model m] [--json]` | 把整个任务交给 OpenCode 用免费模型完成 |
| `ftb agents` | Agent 支持矩阵 |
| `ftb agent <id> [--apply [--dry-run] [--target f] [--force]]` | 打印某个 Agent 的接入配置；`--apply` 合并进它的 JSON 配置 |
| `ftb run <agent\|命令> -- <参数>` | 让 Agent 走路由运行，不改配置文件 |
| `ftb schedule [--time 08:00] [--install cron\|launchd]` | 每日扫描定时任务 |
| `ftb init` | 生成 `~/.freetoken-bots/config.json` |

### 路由服务的接口

| 接口 | 说明 |
|---|---|
| `GET /v1/models` | `auto` + 所有当前可调用的 OpenRouter 免费模型（ID 形如 `openrouter/xxx:free`） |
| `POST /v1/chat/completions` | OpenAI Chat Completions，支持流式、工具调用、图片输入 |
| `POST /v1/responses` | OpenAI Responses API（Codex CLI 用），内部转成 Chat Completions |
| `GET /ftb/status` | 各平台可用性、冷却中的模型、今天的用量 |
| `GET /health` | 健康检查 |
| `POST /v1/messages` | 返回 501，Anthropic Messages 还没实现 |

模型名可以写：
- `auto`：自动选最合适的免费模型
- 具体的 key，如 `openrouter/google/gemma-4-31b-it:free`：优先用它，不可用时默认切到其他免费模型（`routing.pinned_fallback: false` 可关掉）
- Agent 自带的默认名（如 Codex 默认发 `gpt-5`）：不认识的名字按 `auto` 处理，候选全是免费模型
- 已知的**收费**模型：返回 400；Zen 免费模型（`opencode/...`）：返回 400 并说明「只能在 OpenCode 里用」

每个响应带 `x-ftb-model`（实际用的模型）和 `x-ftb-attempts`（尝试了几次）响应头。

## 接入各个 Agent

| Agent | 路由（OpenRouter 免费） | 协议 | Zen 免费模型 |
|---|---|---|---|
| **OpenCode** | ✅ 实测（1.19.6） | Chat Completions | ✅ 原生，实测 |
| **Pi** | ✅ 实测（1.6.0） | Chat Completions | 通过 `ftb delegate` |
| **Codex CLI** | ✅ 实测（0.163.0） | Responses API | 通过 `ftb delegate` |
| 任意 OpenAI 兼容客户端 / SDK | ✅ 实测（curl、Python） | Chat Completions | — |
| 任何能执行 shell 的 Agent（Grokbot、Muse、Dot、Hermes、Claude Code…） | 视其是否支持自定义 OpenAI 接口 | — | ✅ `ftb delegate`，实测（OpenCode 1.19.6 + 真实 Zen `beam-free`） |
| Aider | 📄 按官方文档配置，本机未跑 | Chat Completions | 通过 `ftb delegate` |
| Cline / Roo Code | 📄 按官方文档配置，本机未跑 | Chat Completions | 通过 `ftb delegate` |
| Hermes Agent | 📄 按官方文档配置，本机未跑 | Chat Completions | 通过 `ftb delegate` |
| Gemini CLI | ❌ 只认 Gemini API，未实现 | — | 通过 `ftb delegate` |
| Claude Code | ❌ 需要 Anthropic Messages 适配，暂不做 | — | 通过 `ftb delegate` |

路由「实测」指 `tests/integration_agents.py` 里真实运行这个 Agent 的二进制：假模型让 Agent 用它自己的 shell 工具执行 `echo FTB_TOOL_OK`，Agent 执行后把结果发回，整个工具调用循环走通才算通过。每个 Agent 都在隔离的 HOME 里跑，不会读写你的真实配置。

先 `ftb serve`（或者用 `ftb run`）。路由默认不要求 key，Agent 那边填任意值即可（例如 `ftb-local`）；设置了 `FTB_ROUTER_KEY` 时路由会校验它。

### OpenCode

```bash
ftb opencode setup                 # 没装就安装；有 OpenRouter key 时把 provider "freetoken" 加进 opencode.json（先确认、先备份）
opencode                           # /models：opencode/*-free（Zen 免费）或 freetoken/auto（OpenRouter 免费，需要 ftb serve）
ftb run opencode -- run "解释这个仓库"   # 不改任何文件的方式（OPENCODE_CONFIG_CONTENT 注入）
```

示例：[examples/opencode.json](examples/opencode.json)。

### Pi

```bash
ftb agent pi --apply --dry-run     # 先看会写什么
ftb agent pi --apply               # 合并进 ~/.pi/agent/models.json（自动备份，只加 freetoken 这一项）
pi --provider freetoken --model auto
```

生成的 provider 用 `api: "openai-completions"`，所有模型 `cost` 都是 0。示例：[examples/pi-models.json](examples/pi-models.json)。

### Codex CLI

Codex 0.16x 起只支持 `wire_api = "responses"`（`chat` 会直接报错），所以路由内置了 Responses ↔ Chat Completions 的转换：文本、图片、函数工具、custom（自由格式）工具、工具调用结果、流式输出、用量都会转换；`web_search` 等托管工具和工具命名空间会被丢弃。

```bash
ftb run codex -- exec "列出这个目录的文件"   # 不改配置文件
```

写进配置文件（Codex 0.16x 的 profile 要放在单独的 `<名字>.config.toml` 里，写在 `config.toml` 的 `[profiles.x]` 会被拒绝）：

```toml
# ~/.codex/config.toml 追加
[model_providers.freetoken]
name = "FreeToken-Bots"
base_url = "http://127.0.0.1:8787/v1"
wire_api = "responses"
env_key = "FTB_ROUTER_KEY"
```

```toml
# ~/.codex/free.config.toml
model_provider = "freetoken"
model = "auto"
model_context_window = 128000
```

```bash
export FTB_ROUTER_KEY=ftb-local
codex --profile free
```

### Aider / Cline / Roo Code / Hermes Agent / 其他

```bash
ftb run aider      # = aider --model openai/auto --openai-api-base http://127.0.0.1:8787/v1 --openai-api-key ftb-local
```

- Cline / Roo Code：设置 → API Provider 选 **OpenAI Compatible**，Base URL `http://127.0.0.1:8787/v1`，API Key `ftb-local`，Model ID `auto`。
- Hermes Agent：`hermes model` 选自定义 OpenAI 兼容端点，填同样的地址和模型 `auto`（配置格式未在本机验证）。
- 其他：`export OPENAI_BASE_URL=http://127.0.0.1:8787/v1 OPENAI_API_KEY=ftb-local`，模型填 `auto`；或 `ftb run <命令>`。示例：[examples/curl.sh](examples/curl.sh)、[examples/openai_sdk.py](examples/openai_sdk.py)。

**新增一个 Agent**：在 [freetoken_bots/agents.py](freetoken_bots/agents.py) 的 `AGENTS` 里加一条，路由和核心逻辑都不用动。

## ftb delegate：让任何 Agent 用上 Zen 免费模型

```bash
ftb delegate "修复 tests/test_api.py 里失败的测试" --dir ~/my-repo
ftb delegate "总结 docs/ 目录" --dir ~/my-repo --json      # 输出 {ok, model, output, attempts}，方便 Agent 解析
ftb delegate "..." --model opencode/big-pickle            # 指定模型（必须是最新目录里的免费模型）
```

- OpenCode 在 `--dir` 里用自己的工具完成整个任务（读写文件、跑命令），然后把最终回答打印到 stdout。
- 默认选模型：最新 Zen 目录里的免费模型 ∩ 本机 OpenCode 客户端提供的模型，支持工具调用的优先。失败（额度用完、限流、服务器错误）就换下一个免费模型；配了 OpenRouter key 时最后再试 `freetoken/auto`。
- **已经开始干活之后失败，不会换模型重跑**（可能已经改了文件），直接返回失败让主 Agent 决定。
- 只接受免费模型；`--model` 指定收费模型会被拒绝。
- 适合把整块工作交出去（「实现这个功能」「修这个 bug」），不适合逐句调用模型。
- 给 Grokbot / Hermes / Claude Code 等用：在它的规则或提示里写「需要省 token 的子任务，用 shell 运行 `ftb delegate "<任务>" --dir <仓库> --json`」。

为什么不把 Zen 免费模型做成 API 给其他 Agent 直接调：官方明确免费模型只能在 OpenCode 里用。`ftb delegate` 是 OpenCode 自己在干活，符合规则；把 OpenCode 当成模型代理、或者冒充 OpenCode 客户端，就是在绕过平台限制，这里不做。

## 免费额度：哪些是实测，哪些是文档，哪些未知

`ftb quota` 每一项都标了来源：

| 数据 | OpenRouter | OpenCode Zen |
|---|---|---|
| 实时额度（API） | `GET /api/v1/key`：limit、usage、limit_remaining、is_free_tier 等 | **没有**额度 API |
| 限流/耗尽（响应里学到的） | 429 `free-models-per-day` → 整平台暂停到 `X-RateLimit-Reset`；`free-models-per-min` → 整平台暂停约 60 秒；其他 429 → 只冷却该模型 | `ftb delegate` 遇到限额会换下一个免费模型 |
| 本地计数（路由实测） | 当天请求数、成功/失败、token | — |
| 文档政策（仅供参考） | 免费模型 20 次/分钟；每天 50 次（买过 ≥ $10 额度的账号 1000 次） | 只能在 OpenCode 客户端里用；额度未公布 |

2026-11-23 实测：在 OpenCode 外直接调用 Zen 免费模型，返回 `429 FreeUsageLimitError`，提示「Free models work in OpenCode」；同一台机器在 OpenCode 客户端里，不登录、不配 key，`big-pickle`、`beam-free` 都能正常用。

**数据使用**：Zen 文档的 Privacy 部分写明，部分免费模型在免费期间会保留数据或用于改进模型（如 Big Pickle、Tidepool Alpha Free、Iceman Free、Flint 40B Free）。敏感代码请先看条款。

## 安全设计：为什么不会花钱

1. **免费只认官方目录**：每一个价格字段（包括缓存、按次、图片、联网搜索、阶梯价、按日期生效的价格规则）都必须严格等于 0；看不懂的字段一律当收费处理。Zen 的 `jev-1.13` 输出价 0、输入价 $0.042，被正确判为收费。
2. **每次调用前复查**：每次发请求、每次切换到下一个模型之前，都会用最新目录再核对一次免费状态。目录超过 24 小时没更新就拒绝路由（fail-closed）。
3. **过滤可能触发收费的字段**：去掉 OpenRouter `models`、`provider`、`plugins`（联网插件收费）、`web_search_options`、`service_tier` 等；OpenRouter 请求额外带 `provider.max_price = 0`。
4. **收费模型名直接 400**；OpenRouter 漏写 `:free` 的 ID 会自动纠正到免费版并给出警告（不带 `:free` 的是收费版）。
5. **402 绝不重试付费**：402 会把整个平台暂停 1 小时。
6. **路由从不调用 Zen**，也不保存 OpenCode key；`ftb delegate` 只会选最新目录里价格为 0 的 Zen 模型。
7. **不改你的配置**：`ftb run` 不写文件；`--apply` / `ftb opencode setup` 先确认、先备份、只加 `freetoken` 这一项，保留原文件权限。
8. **默认只监听本机**：绑定非 127.0.0.1 时必须设置 `FTB_ROUTER_KEY`，否则拒绝启动。

## 每日报告和定时扫描

免费名单变化很快，**每天扫描是必需的**。skill 自己不会定时跑：

```bash
ftb schedule                        # 打印 cron / launchd / systemd 写法
ftb schedule --install cron         # 加一条 crontab（每天 08:00，保留你已有的其他条目）
ftb schedule --install launchd      # macOS
```

`ftb serve` 运行期间每 6 小时也会自动重新扫描。报告在 `~/.freetoken-bots/reports/YYYY-MM-DD.md`（本地日期），变化事件追加在 `~/.freetoken-bots/changes.jsonl`。内容：

- 新增免费模型（标注匿名、只能在 OpenCode 里用）
- 取消免费 / 下架
- 7 天内结束的限时免费，以及所有已公布的截止日期
- 免费条件变化
- OpenCode Zen 免费模型列表（只能在 OpenCode 里用）
- 匿名 / 未公开底模的模型（启发式）
- 免费但不是对话模型的（音频输出、决策模型等）

某个平台扫描失败时，不会把它的模型误报成「下架」。

## 配置

`ftb init` 生成 `~/.freetoken-bots/config.json`，只写想改的项也行（会和默认值合并）。完整默认值见 [examples/config.example.json](examples/config.example.json)。

| 键 | 默认 | 说明 |
|---|---|---|
| `routing.prefer` | `[]` | 优先使用的模型（完整 key 或子串），按顺序 |
| `routing.exclude` | `[]` | 永不使用的模型（子串） |
| `routing.min_context` | `32000` | 上下文小于这个值的模型不参与自动选择 |
| `routing.pinned_fallback` | `true` | 指定了具体模型时，它不可用是否切到其他免费模型 |
| `routing.allow_meta_router` | `true` | 是否把 `openrouter/free`（OpenRouter 自带的免费路由）作为最后兜底 |
| `router.port` | `8787` | 端口 |
| `router.catalog_max_age_hours` | `24` | 目录超过这个时间就拒绝路由 |
| `router.max_attempts` | `6` | 单个请求最多尝试几个模型 |
| `router.unknown_model` | `auto` | 不认识的模型名：`auto` 或 `reject` |
| `providers.openrouter.enforce_max_price` | `true` | 是否给 OpenRouter 请求加 `max_price = 0` |
| `providers.*.enabled` | `true` | 关掉某个平台的扫描 |

环境变量：`OPENROUTER_API_KEY`（也可由 `ftb setup` 存到 `keys.env`，环境变量优先）、`FTB_ROUTER_KEY`、`FTB_HOME`（数据目录，默认 `~/.freetoken-bots`）、`FTB_CONFIG`（配置文件路径）。

自动选择的排序：`prefer` → 非 meta 路由优先 → 最近失败少的优先 → 参数量（已核实的 ≥100B 优先；名字里的数字只用于排序）→ 上下文更长的优先。带工具的请求只选支持工具调用的模型，带图片的只选支持图片输入的模型。

## 已知限制

- **还没有用真实 OpenRouter key 跑过路由**：开发环境没有 key。目录发现、价格判断是对真实 API 实测的；路由、切换、流式、Responses 转换、三个 Agent 是对模拟上游实测的（按 OpenRouter 的目录和错误格式实现）。拿到 key 后建议先跑 `ftb probe --all --tools --limit 5`。
- `provider.max_price = 0` 来自 OpenRouter 文档，未用真实 key 验证；如果因此返回「no endpoints found」，设 `providers.openrouter.enforce_max_price: false`（免费判断本身仍然生效）。
- Zen 免费模型只能通过 OpenCode 使用（官方规定）。`ftb delegate` 是任务级委托，不能当作逐条调用的模型 API；OpenCode 客户端内的限额未公布。
- `ftb delegate` 判断成功与否靠 OpenCode 的退出码；失败后是否换模型重跑靠「是否已有输出」判断，已有输出就不重跑。
- Claude Code（需要 Anthropic Messages 入口）、Gemini CLI（需要 Gemini 协议入口）暂不支持接路由，但都可以用 `ftb delegate`。
- Responses API 转换不支持托管工具（web_search、file_search 等）、工具命名空间、跨模型回放加密推理内容。
- 流式输出开始之后上游再出错，没法无缝切换，只能把错误传给客户端。
- 「匿名模型」是启发式判断。

## 测试

```bash
python3 -m unittest discover -s tests           # 75 个单元 + 集成测试，约 20 秒，不需要网络和 key
python3 tests/integration_agents.py             # 真实 Agent 端到端（PATH 上有哪个测哪个）
```

`tests/mock_upstream.py` 模拟 OpenRouter 和 Zen 的目录和对话接口，可以让每个模型返回额度耗尽、402、限流、5xx、流式首包报错等情况，并记录所有发往上游的模型 ID。测试断言**没有任何收费模型 ID 被发出去，路由也从不调用 Zen**。`tests/test_opencode.py` 用一个假的 `opencode` 可执行文件测试 `ftb delegate` 的选模型、换模型、不重跑、`--dir` 传递。

本次结果（2026-11-23）：

```
单元/集成测试   75 passed
pi             PASS  1.6.0             完整工具调用循环（路由）
codex          PASS  codex-cli 0.163.0 ftb run（-c 覆盖）
codex-profile  PASS  codex-cli 0.163.0 config.toml + free.config.toml
opencode       PASS  1.19.6            ftb run（OPENCODE_CONFIG_CONTENT）
opencode-file  PASS  1.19.6            ftb agent opencode --apply
发往上游的收费模型 ID：none
ftb delegate   PASS  真实 OpenCode 1.19.6 + 真实 Zen beam-free，在 --dir 里创建了文件
```

## 从 v0.2 升级

- `scripts/radar.py`（scan / status / probe / sync）保留，老的 cron 不用改；价格判断换成了更严格的新版本。
- 新功能都在 `ftb` 里，数据目录从 `~/.pi/agent/freetoken-bots.json` 换成 `~/.freetoken-bots/`。
- 不再要求先装 Pi；推荐装 OpenCode（Zen 免费模型只能在它里面用）。

## 文件结构

```
freetoken_bots/
  providers.py      两个平台的目录适配：免费判断、协议、能力、截止日期、匿名识别
  catalog.py        扫描、存储、变化检测、报告、模型 ID 解析
  quota.py          用量/冷却/平台暂停状态、错误分类、额度信息
  routing.py        选模型、免费复查、请求清洗、上游调用、自动切换（只路由 OpenRouter）
  responses_api.py  Responses API <-> Chat Completions
  server.py         HTTP 服务
  opencode.py       OpenCode 安装/状态、Zen 免费模型选择、ftb delegate
  agents.py         各 Agent 的接入配置（数据驱动）
  cli.py            ftb 命令
scripts/ftb.py      入口       scripts/radar.py  v0.2 兼容入口
bin/ftb             shell 包装
examples/           配置示例
tests/              单元测试、模拟上游、Agent 端到端测试
```
