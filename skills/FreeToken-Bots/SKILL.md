---
name: freetoken-bots
description: Free-model radar, quota tracker and zero-cost router for OpenRouter + OpenCode Zen. Discovers free models daily (new / no-longer-free / limited-time / anonymous), tracks free quota and rate limits, runs a local OpenAI-compatible router (Chat Completions + Responses API) that fails over only between OpenRouter free models, and uses OpenCode as the harness for OpenCode Zen free models (which official docs restrict to the OpenCode client) — any shell-capable agent can hand tasks to OpenCode with `ftb delegate`. Works with Pi, Codex CLI, OpenCode, Grokbot, Hermes and any OpenAI-compatible agent. Activates when the user mentions OpenRouter, OpenCode Zen, free tokens, free models, zero-cost models, 免费 token, 免费模型, 白嫖模型, or wants an agent to run on free models.
version: 1.1.0
---

# FreeToken-Bots

Python ≥3.9, standard library only. Entry point: `python3 <skill-dir>/scripts/ftb.py <command>` (or `<skill-dir>/bin/ftb`). Data in `~/.freetoken-bots/` (override with `FTB_HOME`).

## The two free sources follow different rules

| source | official rule | how to use it |
|---|---|---|
| OpenRouter free (`:free`) | own API key, any client | `ftb serve` router → any agent, model `auto`, failover only between free models |
| OpenCode Zen free (`*-free`, `big-pickle`) | docs: "Free-tier chat models require OpenCode; use paid models or Go from other clients." No key needed inside OpenCode | use **OpenCode** itself, or from another agent run `ftb delegate "<task>" --dir <repo>` (OpenCode does the whole task) |

Never expose Zen free models as a model API to other agents, never imitate the OpenCode client, and never call Zen free models from outside OpenCode. If the user asks for that, explain the rule and offer OpenCode / `ftb delegate`.

## First install — ask before configuring

On first activation run `ftb doctor`, then ask the user:

1. **OpenRouter API key** (if `OPENROUTER_API_KEY` is unset): needed for routing OpenRouter free models. Link: https://openrouter.ai/settings/keys → Create API key.
2. **Install OpenCode** (if not installed): needed for OpenCode Zen free models; no key required.

Have the user run `ftb setup` **themselves** in a terminal (in Claude Code: `! ftb setup`). It offers to open the key page, reads the key without echo, saves it to `~/.freetoken-bots/keys.env` (mode 600, readable by cron), validates it for free, and offers to install OpenCode. Do not ask the user to paste keys into the chat. `ftb setup --from-env` saves an already-exported key.

The OpenCode Personal API key (https://opencode.ai/console/account) is for paid Console models / Go only. This skill does not need or use it.

Also tell the user: "这个 skill 需要每天早上 8 点跑一次扫描（`ftb schedule --install cron` 或 launchd），不配的话免费名单会过期。"

## When activated

1. `ftb doctor`: is the key set, is the catalog fresh, is the router running, is OpenCode installed, which agents are present. If anything from *First install* is missing and the user hasn't declined, ask.
2. If the last scan is older than 24h: `ftb scan`.
3. Answer from data, not memory: `ftb models`, `ftb report`, `ftb quota`, `ftb opencode status`, `ftb route --tools`.
4. Running an agent on free models:
   - OpenRouter free: `ftb serve`, then `ftb agent <id>` for its config, or `ftb run <agent> -- ...` (no file edits).
   - Zen free: `opencode` directly, or `ftb delegate "<task>" --dir <repo> [--json]` from any agent that can run shell commands.

## Commands

| command | what it does |
|---|---|
| `ftb setup` | first install: OpenRouter key + install OpenCode |
| `ftb scan` | fetch OpenRouter + Zen catalogs, record changes, write `~/.freetoken-bots/reports/<date>.md` |
| `ftb models [--tools] [--provider p] [--all]` | free models: tools / context / end date / routable or OpenCode-only |
| `ftb report [--hours 24]` | new free, no longer free, delisted, ending soon, anonymous, OpenCode-only |
| `ftb quota` | measured usage, live OpenRouter `/key` data, learned blocks, documented policy — each labelled |
| `ftb probe --model <key> [--tools]` / `--all` | real test call to OpenRouter free models |
| `ftb route [--tools]` | failover order, no calls |
| `ftb serve` | router at `http://127.0.0.1:8787/v1` |
| `ftb opencode status\|install\|setup` | OpenCode state, Zen free models the client offers; `setup` adds OpenRouter free models to OpenCode (asks, backs up) |
| `ftb delegate "<task>" [--dir d] [--model m] [--json]` | hand a whole task to OpenCode on a free model, with failover |
| `ftb agents` / `ftb agent <id> [--apply]` | support matrix / config for one agent |
| `ftb run <agent> -- <args>` | launch codex / opencode / aider / any command via the router, no config edits |
| `ftb schedule [--install cron\|launchd]` | daily 08:00 scan |

## Rules you must follow

- **Never use a paid model.** Free = every published price is exactly 0 in the provider's own catalog. The router re-checks before every call and failover hop, refuses stale catalogs (>24h), strips OpenRouter `models`/`provider`/`plugins`/web-search fields and adds `provider.max_price = 0`. Paid model requests get HTTP 400. `ftb delegate` only accepts Zen models priced 0 in the latest scan. Don't suggest workarounds.
- An OpenRouter id without `:free` is the PAID variant. Resolve ids with `ftb models`, never from memory.
- Quota: report measured vs documented vs unknown exactly as `ftb quota` labels it. Zen has no quota API.
- `ftb delegate` hands off whole tasks (implement X, fix Y). It is not a per-message model API. If it fails after OpenCode already produced output, it does not retry on another model because files may have changed; check the repo state before retrying.
- Some Zen free models may retain or use data to improve the model during the free period (see Zen docs → Privacy). Mention this before delegating sensitive code.
- Don't edit a user's agent config without asking. `ftb agent pi|opencode --apply` and `ftb opencode setup` back up and add only the `freetoken` provider; show `--dry-run` first. Prefer `ftb run`, which edits nothing.
- Never print or commit API keys. Don't bind the router to a public interface without `FTB_ROUTER_KEY`.

## Agent support (honest status)

| agent | router (OpenRouter free) | Zen free |
|---|---|---|
| OpenCode | verified 1.19.6 (`ftb opencode setup` / `ftb run opencode`) | native |
| Pi | verified 1.6.0 (`ftb agent pi --apply`; `pi --provider freetoken --model auto`) | `ftb delegate` |
| Codex CLI | verified 0.163.0 (Responses API translated; `ftb run codex`) | `ftb delegate` |
| Grokbot / Muse / Dot / Hermes / Claude Code / any shell-capable agent | only if it supports a custom OpenAI endpoint | `ftb delegate` (verified live: OpenCode 1.19.6 + Zen beam-free) |
| Aider, Cline, Roo Code | documented, not run here | `ftb delegate` |
| Gemini CLI | not supported (needs Gemini protocol) | `ftb delegate` |
| Claude Code router | not supported yet (needs Anthropic Messages; `/v1/messages` = 501) | `ftb delegate` |

## Legacy

`scripts/radar.py` (v0.2: OpenRouter-only scan/probe, Pi cache path) still works for old cron jobs; new setups should use `ftb`.
