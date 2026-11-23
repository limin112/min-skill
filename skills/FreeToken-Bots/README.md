# FreeToken-Bots v1.0

**免费模型雷达 + 额度管理 + 零费用路由**，覆盖 OpenRouter 和 OpenCode Zen。

每天自动发现两个平台的免费模型（新上线、取消免费、限时活动、匿名模型），记录免费额度和限流状态，并在本地起一个 OpenAI 兼容的路由服务：模型额度用完、被限流或宕机时，自动切到另一个**免费**模型，**永远不会切到收费模型**。

Pi、Codex CLI、OpenCode 已实测端到端可用；其他支持 OpenAI 兼容接口的 Agent（Aider、Cline、Roo Code、Hermes Agent……）按同样方式接入。

- 只用 Python 标准库，Python ≥ 3.9，不用 `pip install`
- 不依赖任何收费的模型目录或监控服务，数据全部来自两个平台的官方公开 API
- 默认只监听 `127.0.0.1`，不会改你的 Agent 配置（除非你显式加 `--apply`）

---

## 目录

- [它能做什么](#它能做什么)
- [5 分钟上手](#5-分钟上手)
- [命令一览](#命令一览)
- [接入各个 Agent](#接入各个-agent)
- [免费额度：哪些是实测，哪些是文档，哪些未知](#免费额度哪些是实测哪些是文档哪些未知)
- [安全设计：为什么不会花钱](#安全设计为什么不会花钱)
- [每日报告和定时扫描](#每日报告和定时扫描)
- [配置](#配置)
- [已知限制](#已知限制)
- [测试](#测试)
- [从 v0.2 升级](#从-v02-升级)

---

## 它能做什么

| 功能 | 说明 |
|---|---|
| 免费模型监控 | 扫描 OpenRouter `/api/v1/models` 和 OpenCode Zen `/zen/v1/models`。识别新上线免费模型、取消免费、下架、限时免费的截止日期（OpenRouter `expiration_date`，Zen 价格表里带日期的规则）、匿名/未公开底模的模型 |
| 区分「能调用」和「只能看」 | 免费但路由调不了的模型标成 **monitor-only** 并写明原因：非 chat 协议（如只支持 Anthropic Messages 的 `qwen4-max-free`）、输出是音频（Lyria）、非对话类模型等 |
| 额度管理 | OpenRouter 用 `GET /api/v1/key` 拿实时额度；两个平台都从 429/402 响应和 `retry-after` / `X-RateLimit-*` 头里学习限额和重置时间；路由服务自己记每天的请求数和 token 数。拿不到的数据明确写「unknown」 |
| 智能切换 | 统一入口 `model: "auto"`。遇到额度耗尽（整平台暂停到重置时间）、限流（单模型冷却）、5xx/超时（冷却 30 秒）、402（暂停平台，绝不付费重试）就换下一个免费模型。流式请求在第一个数据块之前出错也能切换 |
| 每日报告 | `~/.freetoken-bots/reports/YYYY-MM-DD.md`：新增免费、取消免费/下架、即将结束的限时免费、匿名模型、monitor-only 列表 |
| 多 Agent | 同时提供 OpenAI **Chat Completions** 和 **Responses API**（Codex CLI 只认 Responses）。新增 Agent 只需在 `agents.py` 加一条配置，不碰核心逻辑 |

实测 2026-11-23 的一次扫描：OpenRouter 477 个模型里 15 个免费，OpenCode Zen 106 个里 12 个免费，其中 23 个可以通过路由调用，4 个只能监控。

## 5 分钟上手

```bash
# 1. 拿到代码（只要这个文件夹）
git clone https://github.com/limin112/min-skill.git
cd min-skill/skills/FreeToken-Bots
ln -s "$PWD/bin/ftb" ~/.local/bin/ftb      # 可选：把 ftb 放进 PATH；否则用 python3 scripts/ftb.py

# 2. 扫描（不需要任何 key）
ftb scan
ftb models

# 3. 配 key（至少一个，能调用才需要；只看列表不需要）
export OPENROUTER_API_KEY=sk-or-...        # https://openrouter.ai/keys
export OPENCODE_API_KEY=...                # https://opencode.ai/auth  免费注册
ftb doctor                                 # 检查 key、目录新鲜度、Agent 安装情况
ftb probe --all --tools --limit 3          # 真实试调用 3 个免费模型的工具调用

# 4. 启动路由
ftb serve                                  # http://127.0.0.1:8787/v1

# 5. 让 Agent 走免费模型（任选）
ftb run codex -- exec "解释一下这个仓库"
ftb run opencode -- run "解释一下这个仓库"
```

`ftb run` 会检查 8787 端口有没有路由在跑，没有就临时起一个，Agent 退出后自动关掉。它通过命令行参数和环境变量注入配置，**不改任何配置文件**。

## 命令一览

| 命令 | 作用 |
|---|---|
| `ftb scan [--provider openrouter\|opencode]` | 拉取目录、记录变化、生成当天报告 |
| `ftb models [--tools] [--provider p] [--all] [--json]` | 免费模型列表：工具调用、上下文、截止日期、当前能否路由 |
| `ftb report [--hours 24] [--json]` | 变化报告 |
| `ftb quota [--no-live] [--json]` | 各平台额度状态，每项都标明数据来源 |
| `ftb probe --model <key> [--tools]` / `ftb probe --all [--limit N]` | 真实试调用（只会调免费模型） |
| `ftb route [--tools] [--model m]` | 只显示切换顺序，不发请求 |
| `ftb serve [--host h] [--port p]` | 启动路由 |
| `ftb status` | 路由运行状态、各平台是否可用、冷却中的模型 |
| `ftb agents` | Agent 支持矩阵 |
| `ftb agent <id> [--apply [--dry-run] [--target f] [--force]]` | 打印某个 Agent 的接入配置；`--apply` 合并进它的 JSON 配置 |
| `ftb run <agent\|命令> -- <参数>` | 让 Agent 走路由运行，不改配置文件 |
| `ftb schedule [--time 08:00] [--install cron\|launchd]` | 每日扫描定时任务 |
| `ftb init` | 生成 `~/.freetoken-bots/config.json` |

### 路由服务的接口

| 接口 | 说明 |
|---|---|
| `GET /v1/models` | `auto` + 所有当前可调用的免费模型（ID 形如 `openrouter/xxx:free`、`opencode/big-pickle`） |
| `POST /v1/chat/completions` | OpenAI Chat Completions，支持流式、工具调用、图片输入 |
| `POST /v1/responses` | OpenAI Responses API（Codex CLI 用），内部转成 Chat Completions |
| `GET /ftb/status` | 各平台可用性、冷却中的模型、今天的用量 |
| `GET /health` | 健康检查 |
| `POST /v1/messages` | 返回 501，Anthropic Messages 还没实现 |

模型名可以写：
- `auto`：自动选最合适的免费模型
- `auto-openrouter` / `auto-opencode`：只在某个平台里选
- 具体的 key，如 `opencode/big-pickle`：优先用它，不可用时默认切到其他免费模型（`routing.pinned_fallback: false` 可关掉）
- Agent 自带的默认名（如 Codex 默认发 `gpt-5`）：路由不认识的名字一律按 `auto` 处理，候选全是免费模型
- 已知的**收费**模型名：直接返回 400，不会调用

每个响应带 `x-ftb-model`（实际用的模型）和 `x-ftb-attempts`（尝试了几次）响应头。

## 接入各个 Agent

先 `ftb serve`（或者用 `ftb run`）。路由默认不要求 key，Agent 那边填任意值即可（例如 `ftb-local`）。如果设置了 `FTB_ROUTER_KEY`，路由会校验它。

| Agent | 状态 | 协议 | 接入方式 |
|---|---|---|---|
| **Pi** | ✅ 实测（pi 1.6.0） | Chat Completions | `ftb agent pi --apply` |
| **Codex CLI** | ✅ 实测（codex-cli 0.163.0） | Responses API | `ftb run codex` 或 profile 文件 |
| **OpenCode** | ✅ 实测（opencode 1.19.6） | Chat Completions | `ftb run opencode` 或 `ftb agent opencode --apply` |
| 任意 OpenAI 兼容客户端 / SDK | ✅ 实测（curl、Python） | Chat Completions | `OPENAI_BASE_URL` + 模型 `auto` |
| Aider | 📄 按官方文档配置，本机未跑 | Chat Completions | 见下文 |
| Cline / Roo Code | 📄 按官方文档配置，本机未跑 | Chat Completions | 见下文 |
| Hermes Agent | 📄 按官方文档配置，本机未跑 | Chat Completions | 见下文 |
| Gemini CLI | ❌ 不支持 | 只认 Gemini API | 需要 Gemini 协议适配层，未实现 |
| Claude Code | ❌ 暂不支持 | Anthropic Messages | 需要 Messages 适配层，本版先不做 |

「实测」指 `tests/integration_agents.py` 里真实运行这个 Agent 的二进制：假模型让 Agent 用它自己的 shell 工具执行 `echo FTB_TOOL_OK`，Agent 执行后把结果发回，整个工具调用循环走通才算通过。每个 Agent 都在隔离的 HOME 里跑，不会读写你的真实配置。

### Pi

```bash
ftb agent pi --apply --dry-run     # 先看会写什么
ftb agent pi --apply               # 合并进 ~/.pi/agent/models.json（自动备份，只加 freetoken 这一项）
pi --provider freetoken --model auto
```

生成的 provider 用 `api: "openai-completions"`，所有模型 `cost` 都是 0，除 `auto` 外也列出了每个支持工具调用的免费模型（如 `opencode/big-pickle`）。示例：[examples/pi-models.json](examples/pi-models.json)。

### Codex CLI

Codex 0.16x 起只支持 `wire_api = "responses"`（`chat` 会直接报错），所以路由内置了 Responses ↔ Chat Completions 的转换：文本、图片、函数工具、custom（自由格式）工具、工具调用结果、流式输出、用量都会转换；Codex 的 `web_search` 等托管工具和工具命名空间无法转给免费模型，会被丢弃。

不改配置文件：

```bash
ftb run codex -- exec "列出这个目录的文件"
ftb run codex                      # 交互模式
```

写进配置文件（注意 Codex 0.16x 的 profile 要放在单独的 `<名字>.config.toml` 里，写在 `config.toml` 的 `[profiles.x]` 会被拒绝）：

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

### OpenCode

```bash
ftb run opencode -- run "解释这个仓库"      # 通过 OPENCODE_CONFIG_CONTENT 注入，不改文件
# 或者写进 ~/.config/opencode/opencode.json（备份 + 只加 provider.freetoken）
ftb agent opencode --apply
opencode run -m freetoken/auto "解释这个仓库"
```

示例：[examples/opencode.json](examples/opencode.json)。OpenCode 本身就内置了 Zen 免费模型（产品内免费额度）；接上路由后，额外多了 OpenRouter 的免费模型和跨平台自动切换。

### Aider

```bash
ftb run aider                       # 等价于下面这行
aider --model openai/auto --openai-api-base http://127.0.0.1:8787/v1 --openai-api-key ftb-local
```

`openai/` 前缀是 LiteLLM 里「通用 OpenAI 兼容接口」的意思。Aider 需要 Python ≥ 3.10，本机没有，所以没有实际跑过。

### Cline / Roo Code（VS Code）

设置 → API Provider 选 **OpenAI Compatible**：
- Base URL：`http://127.0.0.1:8787/v1`
- API Key：`ftb-local`（或你的 `FTB_ROUTER_KEY`）
- Model ID：`auto`

### Hermes Agent

运行 `hermes model`，选择自定义 OpenAI 兼容端点，填 Base URL `http://127.0.0.1:8787/v1`、key `ftb-local`、模型 `auto`。配置文件格式没有在本机验证。

### 其他 Agent / SDK

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
export OPENAI_API_KEY=ftb-local
# 模型填 auto
```

或者 `ftb run <命令>`，会自动导出这两个变量。示例：[examples/curl.sh](examples/curl.sh)、[examples/openai_sdk.py](examples/openai_sdk.py)。

**新增一个 Agent**：在 [freetoken_bots/agents.py](freetoken_bots/agents.py) 的 `AGENTS` 里加一条（协议 + 配置生成函数），路由和核心逻辑都不用动。

## 免费额度：哪些是实测，哪些是文档，哪些未知

`ftb quota` 每一项都标了来源：

| 数据 | OpenRouter | OpenCode Zen |
|---|---|---|
| 实时额度（API） | `GET /api/v1/key`：limit、usage、limit_remaining、is_free_tier 等 | **没有**额度 API，显示 unknown |
| 限流/耗尽（响应里学到的） | 429 `free-models-per-day` → 整平台暂停到 `X-RateLimit-Reset`；`free-models-per-min` → 整平台暂停约 60 秒；其他 429 → 只冷却该模型 | 429 `FreeUsageLimitError` → 整平台暂停到 `retry-after` |
| 本地计数（路由实测） | 当天请求数、成功/失败、token | 同左 |
| 文档政策（仅供参考） | 免费模型 20 次/分钟；每天 50 次（买过 ≥ $10 额度的账号 1000 次） | 未公布 |

2026-11-23 实测：匿名调用 Zen 免费模型返回 `429 FreeUsageLimitError`，`retry-after` 约 14.8 小时。路由只发了 1 次请求就把整个 Zen 暂停到 2026-11-24 00:00 UTC，没有挨个去撞其他 Zen 模型，并返回 429 告诉客户端「免费池已耗尽，不会用收费模型兜底」。

### 免费 API 和产品内免费额度

- **免费 API**：能用 key 直接调用、价格表全是 0 的模型。路由只调这一类。
- **产品内免费额度**：比如 OpenCode 在自己客户端里给的免费额度。Zen 对匿名 API 调用限制很严，错误信息会提示「Free models work in OpenCode」。FreeToken-Bots **不会**冒充 OpenCode 客户端去绕过限制；匿名访问默认关闭（`providers.opencode.allow_anonymous`），正常做法是去 opencode.ai/auth 免费注册一个 Zen API key。
- 免费期间的数据可能被平台用于模型训练，敏感代码请自行查看各平台条款。

## 安全设计：为什么不会花钱

1. **免费只认官方目录**：每一个价格字段（包括缓存、按次、图片、联网搜索、阶梯价、按日期生效的价格规则）都必须严格等于 0；看不懂的字段一律当收费处理。Zen 的 `jev-1.13` 输出价 0、输入价 $0.042，被正确判为收费。
2. **每次调用前复查**：每次发请求、每次切换到下一个模型之前，都会用最新目录再核对一次免费状态。目录超过 24 小时没更新就拒绝路由（fail-closed）；扫描失败时旧目录只用于展示，不用于放行。
3. **过滤可能触发收费的字段**：去掉客户端传来的 OpenRouter `models`（它自己的备选列表可能含收费模型）、`provider`、`plugins`（联网插件收费）、`web_search_options`、`service_tier` 等；OpenRouter 请求额外带 `provider.max_price = 0`，让服务端也拒绝任何收费路由。
4. **收费模型名直接 400**；OpenRouter 漏写 `:free` 的 ID 会自动纠正到免费版并给出警告（不带 `:free` 的是收费版）。
5. **402 绝不重试付费**：402 会把整个平台暂停 1 小时，然后换别的免费平台。
6. **API key 只发给白名单域名**：Zen 目录里给出的 base_url 不在 `opencode.ai` 下就不调用，防止目录被篡改后 key 外泄。
7. **不改你的配置**：`ftb run` 不写文件；`--apply` 只对 JSON 配置生效，先备份、只加 `freetoken` 这一项、已存在且内容不同时拒绝（除非 `--force`），保留原文件权限。
8. **默认只监听本机**：绑定非 127.0.0.1 时必须设置 `FTB_ROUTER_KEY`，否则拒绝启动，避免成为公开代理消耗你的额度。

## 每日报告和定时扫描

免费名单变化很快，**每天扫描是必需的**。skill 自己不会定时跑：

```bash
ftb schedule                        # 打印 cron / launchd / systemd 写法
ftb schedule --install cron         # 加一条 crontab（每天 08:00，保留你已有的其他条目）
ftb schedule --install launchd      # macOS
```

`ftb serve` 运行期间每 6 小时也会自动重新扫描。

报告位置：`~/.freetoken-bots/reports/YYYY-MM-DD.md`（本地日期），变化事件追加在 `~/.freetoken-bots/changes.jsonl`。报告内容：

- 新增免费模型（标注匿名、monitor-only）
- 取消免费 / 下架
- 7 天内结束的限时免费，以及所有已公布的截止日期
- 免费条件变化
- 匿名 / 未公开底模的模型（启发式：OpenRouter 描述里的 stealth/cloaked、`openrouter/` 前缀；Zen 没有 canonical_id 且非开源权重）
- monitor-only 列表

某个平台扫描失败时，不会把它的模型误报成「下架」。

## 配置

`ftb init` 生成 `~/.freetoken-bots/config.json`，只写你想改的项也行（会和默认值合并）。完整默认值见 [examples/config.example.json](examples/config.example.json)。常用项：

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
| `router.unknown_model` | `auto` | 不认识的模型名怎么处理：`auto` 或 `reject` |
| `providers.opencode.allow_anonymous` | `false` | 没有 Zen key 时是否匿名调用 |
| `providers.openrouter.enforce_max_price` | `true` | 是否给 OpenRouter 请求加 `max_price = 0` |
| `providers.*.enabled` | `true` | 关掉某个平台 |

环境变量：`OPENROUTER_API_KEY`、`OPENCODE_API_KEY`、`FTB_ROUTER_KEY`、`FTB_HOME`（数据目录，默认 `~/.freetoken-bots`）、`FTB_CONFIG`（配置文件路径）。

自动选择的排序：`prefer` 列表 → 非 meta 路由优先 → 最近失败少的优先 → 参数量（已核实的 ≥100B 优先，名字里的数字只用于排序，不会被标成「已核实」）→ 上下文更长的优先。请求带工具时只选支持工具调用的模型，带图片时只选支持图片输入的模型，并按请求长度过滤上下文不够的模型。

## 已知限制

- **没有用真实 key 跑过付费账号上的完整调用**：本次开发环境没有 OpenRouter / Zen key。目录发现、价格判断、Zen 匿名限额识别是对真实 API 实测的；路由、切换、流式、Responses 转换、三个 Agent 是对模拟上游实测的（模拟上游完全按两个平台的目录和错误格式实现）。拿到 key 后建议先跑 `ftb probe --all --tools --limit 5`。
- `provider.max_price = 0` 来自 OpenRouter 文档，没有用真实 key 验证过；如果 OpenRouter 因此返回「no endpoints found」，可以设置 `providers.openrouter.enforce_max_price: false`（free 判断本身仍然生效）。
- 只支持上游的 Chat Completions 协议。只提供 Anthropic Messages 协议的免费模型（目前 Zen 的 `qwen4-max-free`）只做监控。
- Claude Code（需要 Anthropic Messages 入口）、Gemini CLI（需要 Gemini 协议入口）暂不支持。
- Responses API 转换不支持托管工具（web_search、file_search 等）、工具命名空间、跨模型回放加密推理内容。
- 流式输出开始之后上游再出错，没法无缝切换，只能把错误传给客户端（这时还没有任何副作用，Agent 一般会自己重试）。
- OpenCode Zen 不公布免费期截止时间和每日额度，只能从 429 里学。
- 「匿名模型」是启发式判断。

## 测试

```bash
python3 -m unittest discover -s tests           # 61 个单元 + 集成测试，约 20 秒，不需要网络和 key
python3 tests/integration_agents.py             # 真实 Agent 端到端（PATH 上有哪个测哪个）
python3 tests/integration_agents.py pi codex    # 只测指定的
```

`tests/mock_upstream.py` 同时模拟 OpenRouter 和 Zen 的目录和对话接口，可以让每个模型返回额度耗尽、402、限流、5xx、流式首包报错等情况，并记录所有发往上游的模型 ID，测试会断言**没有任何收费模型 ID 被发出去**。

本次结果（2026-11-23）：

```
单元/集成测试   61 passed
pi             PASS  1.6.0             完整工具调用循环
codex          PASS  codex-cli 0.163.0 ftb run（-c 覆盖）
codex-profile  PASS  codex-cli 0.163.0 config.toml + free.config.toml
opencode       PASS  1.19.6            ftb run（OPENCODE_CONFIG_CONTENT）
opencode-file  PASS  1.19.6            ftb agent opencode --apply
发往上游的收费模型 ID：none
```

## 从 v0.2 升级

- `scripts/radar.py`（scan / status / probe / sync）保留，老的 cron 不用改；价格判断换成了更严格的新版本。
- 新功能都在 `ftb` 里，数据目录从 `~/.pi/agent/freetoken-bots.json` 换成 `~/.freetoken-bots/`。
- 不再要求先装 Pi：Pi 只是支持的 Agent 之一。

## 文件结构

```
freetoken_bots/
  providers.py      两个平台的目录适配：免费判断、协议、能力、截止日期、匿名识别
  catalog.py        扫描、存储、变化检测、报告、模型 ID 解析
  quota.py          用量/冷却/平台暂停状态、错误分类、额度信息
  routing.py        选模型、免费复查、请求清洗、上游调用、自动切换
  responses_api.py  Responses API <-> Chat Completions
  server.py         HTTP 服务
  agents.py         各 Agent 的接入配置（数据驱动）
  cli.py            ftb 命令
scripts/ftb.py      入口       scripts/radar.py  v0.2 兼容入口
bin/ftb             shell 包装
examples/           配置示例
tests/              单元测试、模拟上游、Agent 端到端测试
```
