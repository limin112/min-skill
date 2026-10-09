---
name: freetoken-bots
description: Discover, verify, and maintain zero-priced OpenRouter models for Pi child-agent workflows used by Muse, Grokbot, or Dot. Activates when the user mentions OpenRouter, Pi, free tokens, or free models （免费 token / 免费模型）. Use for Pi installation, free-model discovery, quota-safe Pi fallback, model recommendations, and daily health checks.
version: 0.2.0
---

# FreeToken-Bots

Pi is the execution layer; Muse, Grokbot and Dot may invoke it **only if they can run shell commands or access a separately deployed Pi service**. Do not claim to replace those products' native models.

## Activation

Use this skill whenever the user mentions **OpenRouter**, **Pi**, **free tokens （免费 token）**, or **free models （免费模型）** — in any language — or asks about zero-cost model options, Pi model configuration, or quota-safe fallbacks for child agents. On first activation in a session, run Step 0 below, then run `scan` if the cached report is older than 24h.

## Step 0 — Install Pi first (required)

Nothing in this skill works without Pi. If `command -v pi` fails, install it **before** doing anything else:

```bash
# Official installer (recommended)
curl -fsSL https://pi.dev/install.sh | sh
# then restart the shell (or re-source PATH) and verify:
pi --version
```

Alternative (requires Node.js ≥ 22.19):

```bash
npm install -g @earendil-works/pi-coding-agent
pi --version
```

Notes:
- Pi keeps its config in `~/.pi/agent/` (`settings.json`, `models.json`); that directory survives VM replacement, but the `pi` binary itself may not — re-run this step whenever `pi` is missing from PATH.
- After install, run `pi --list-models` once to confirm a healthy install before proceeding.

## Principles

- Free means OpenRouter catalog `pricing.prompt == 0` and `pricing.completion == 0`, with any explicit request/cache prices also zero. Free eligibility is dynamic, not a permanent promise.
- Only classify **verified** total-parameter counts ≥100B as flagship. The `/models` API may omit parameter counts; in that case preserve the model in `needs_parameter_verification`, not the approved pool. Do not guess 100B from a model's name.
- Require `tools` in `supported_parameters` for child-agent candidates; independently probe tool-calling before production use. An ordinary completion probe is **not** proof of tool support.
- Never route to a paid model automatically. A 402, quota-exhausted response, or rate limit is not a reason to remove the user's existing Pi provider configuration.
- **Fail-closed model resolution (v0.1.1):** `probe --model` never trusts a hand-typed ID. It is resolved against the latest free scan: an exact verified-free ID is used as-is; a missing `:free` suffix is auto-corrected with a loud warning (dropping it silently routes to the PAID variant — this exact mistake cost a live call once); any other ID is refused outright. A stale (>24h) scan is refreshed before resolving.
- Do not put API keys in Git or print key values. Prompt for `OPENROUTER_API_KEY` if live probing is requested and unset.
- Pi settings should not be rewritten without preserving user providers/defaults and validating the installed Pi's schema.
- All unattended `pi -p` calls must use `</dev/null`.

## Usage

From this skill directory:

```bash
python3 scripts/radar.py scan
python3 scripts/radar.py status
OPENROUTER_API_KEY=... python3 scripts/radar.py probe --model 'exact/openrouter-id:free'
python3 scripts/radar.py sync --dry-run
```

`scan` writes a private report to `~/.pi/agent/freetoken-bots.json`. `sync` currently emits a **proposal only**, deliberately not modifying `models.json` (Pi schema and model identifiers must be verified on the installed Pi before write integration). This is a safe MVP, not an automatic router.

## Pi integration workflow

0. Step 0 above must be complete: `pi` on PATH and `pi --version` working. If not, install first.
1. Check `~/.pi/agent/settings.json`, `~/.pi/agent/models.json`, and `pi --list-models` without disclosing keys.
2. Scan. Resolve model parameter counts from trustworthy model/provider documentation. Only move independently verified ≥100B entries into approved pool.
3. Probe a plain chat completion and a separate real `tools` call; distinguish 429 temporary rate limit from hard daily-quota exhaustion.
4. Check OpenRouter model ID, provider compatibility and context/max-token fields. Generate a candidate diff; do **not** overwrite Ling custom provider or `enabledModels`.
5. Require explicit approval of diff before applying. Back up original files, write atomically, run `python3 -m json.tool`, `pi --list-models` and `pi -p 'say pong' --no-extensions </dev/null`. On failure revert.
6. For Muse/Grokbot/Dot use a controlled shell child-agent invocation. Confirm host supports executing a local Pi command, shared workspace access and result capture first. Never expose Pi's shell/API to the public internet without authentication.
7. Ask user which model to use before major tasks; use automatic fallback only after user opts in. Never replay side-effectful actions after uncertain completion.

## Scheduling (required, not optional)

This skill does **not** scan by itself. A daily scan is **required** — without it the free-model list goes stale (free eligibility on OpenRouter is dynamic: models get delisted or repriced without notice).

- Run `python3 /absolute/path/to/scripts/radar.py scan` **every day at 08:00 local time** on the machine running Pi. Use cron, launchd, or a systemd timer — pick one and keep it. Example cron: `0 8 * * * /usr/bin/python3 /path/to/scripts/radar.py scan`
- **On install, tell the user explicitly:** "这个 skill 需要每天早上 8 点跑一次扫描定时任务，不配的话免费名单会过期，它自己不会动。" Do not present the skill as working without the timer.
- Each run: compare against the previous report; surface newly listed free models, delisted models, repriced (no-longer-free) models, and any change to the `eligible` pool.
- A ChatGPT reminder/watch does not edit that machine. Confirm repeated transient errors before marking a model unusable. Keep separate `eligible`, `needs_parameter_verification`, and inactive states.

## Model selection

Prefer verified free ≥100B tool-capable models when available, but report a smaller tool-capable free model separately when that is operationally better. If no candidate passes, report empty pool rather than silently falling back to paid tokens.
