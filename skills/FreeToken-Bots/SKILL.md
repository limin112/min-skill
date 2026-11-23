---
name: freetoken-bots
description: Free-model radar, quota tracker and zero-cost router for OpenRouter + OpenCode Zen. Discovers free models daily (new / no-longer-free / limited-time / anonymous), tracks free quota and rate limits, and runs a local OpenAI-compatible router (Chat Completions + Responses API) that fails over only between free models, never to a paid one. Works with Pi, Codex CLI, OpenCode and any OpenAI-compatible agent (Aider, Cline, Roo Code, Hermes...). Activates when the user mentions OpenRouter, OpenCode Zen, free tokens, free models, zero-cost models, 免费 token, 免费模型, 白嫖模型, or wants an agent to run on free models.
version: 1.0.0
---

# FreeToken-Bots

Free-model radar + quota tracker + fail-closed router. Python ≥3.9, standard library only.
Entry point: `python3 <skill-dir>/scripts/ftb.py <command>` (or `<skill-dir>/bin/ftb`). Data lives in `~/.freetoken-bots/` (override with `FTB_HOME`).

## When activated

1. `ftb doctor` — keys present? catalog fresh? router running? which agents installed?
2. If the last scan is older than 24h: `ftb scan`.
3. Answer from data, not memory: `ftb models`, `ftb report`, `ftb quota`, `ftb route --tools`.
4. To run an agent on free models: `ftb serve` (or `ftb run <agent> -- ...`, which starts an embedded router), then `ftb agent <id>` for the config.

## Commands

| command | what it does |
|---|---|
| `ftb scan` | fetch OpenRouter + OpenCode Zen catalogs, record changes, write `~/.freetoken-bots/reports/<date>.md` |
| `ftb models [--tools] [--provider p] [--all]` | free models with tools / context / end date / routing status |
| `ftb report [--hours 24]` | new free, no longer free, delisted, ending soon, anonymous, monitor-only |
| `ftb quota` | per provider: measured usage, live API data (OpenRouter `/key`), learned blocks, documented policy — each labelled by source |
| `ftb probe --model <key> [--tools]` / `--all` | real test call (free models only, needs provider key) |
| `ftb route [--tools]` | show failover order, no calls |
| `ftb serve` | router at `http://127.0.0.1:8787/v1` |
| `ftb agents` / `ftb agent <id> [--apply]` | support matrix / config for one agent |
| `ftb run <agent> -- <args>` | launch codex / opencode / aider / any command via the router, no config edits |
| `ftb schedule [--install cron\|launchd]` | daily 08:00 scan |

Keys (env): `OPENROUTER_API_KEY`, `OPENCODE_API_KEY` (free Zen key from opencode.ai/auth), optional `FTB_ROUTER_KEY` (router auth; required if binding to a non-loopback host).

## Rules you must follow

- **Never route to a paid model.** Free = every published price is exactly 0 in the provider's own catalog. The router re-checks this before every call and every failover hop, refuses stale catalogs (>24h), strips OpenRouter `models`/`provider`/`plugins`/web-search fields and adds `provider.max_price = 0`. A request naming a paid model gets HTTP 400. Do not suggest workarounds that would bypass this.
- A hand-typed OpenRouter id without `:free` is the PAID variant. Resolve ids through `ftb models` / `ftb probe`, never from memory.
- Quota: report what is measured vs documented vs unknown exactly as `ftb quota` labels it. OpenCode Zen has no quota API — say "unknown" rather than inventing a number.
- Free models that cannot be called through the API (non-chat protocol, audio output, product-only quota) are **monitor-only**; say so.
- Do not edit a user's agent config without asking. `ftb agent pi|opencode --apply` backs up the file and adds only the `freetoken` provider; show `--dry-run` first and get approval. Prefer `ftb run`, which edits nothing.
- Do not spoof another client (e.g. pretend to be the OpenCode app) to get around anonymous limits. Anonymous Zen access is off by default; a free Zen API key is the supported path.
- Never print or commit API keys.
- Do not bind the router to a public interface without `FTB_ROUTER_KEY`.

## Daily scan is required

The skill does not scan by itself. On install tell the user: "这个 skill 需要每天早上 8 点跑一次扫描（`ftb schedule --install cron` 或 launchd），不配的话免费名单会过期。" `ftb serve` also rescans every 6h while it runs.

## Agent support (honest status)

| agent | status | how |
|---|---|---|
| Pi | verified (pi 1.6.0, full tool loop) | `ftb agent pi --apply`, then `pi --provider freetoken --model auto` |
| Codex CLI | verified (0.163.0) | `ftb run codex -- exec "..."` or profile files from `ftb agent codex`; Codex needs the Responses API, which the router translates |
| OpenCode | verified (1.19.6) | `ftb run opencode -- run "..."` or `ftb agent opencode --apply`; model `freetoken/auto` |
| Aider, Cline, Roo Code, Hermes Agent | documented, not run here | OpenAI-compatible base URL + model `auto` |
| Gemini CLI | not supported | needs a Gemini-protocol adapter |
| Claude Code | not supported yet | needs an Anthropic Messages adapter (`/v1/messages` returns 501) |

## Legacy

`scripts/radar.py` (v0.2: OpenRouter-only scan/probe, Pi cache path) still works for old cron jobs; new setups should use `ftb`.
