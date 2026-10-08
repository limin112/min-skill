---
name: freetoken-bots
description: Discover, verify, and maintain zero-priced OpenRouter models for Pi child-agent workflows used by Muse, Grokbot, or Dot. Use for free-model discovery, quota-safe Pi fallback, model recommendations, and daily health checks.
version: 0.1.0
---

# FreeToken-Bots

Pi is the execution layer; Muse, Grokbot and Dot may invoke it **only if they can run shell commands or access a separately deployed Pi service**. Do not claim to replace those products' native models.

## Principles

- Free means OpenRouter catalog `pricing.prompt == 0` and `pricing.completion == 0`, with any explicit request/cache prices also zero. Free eligibility is dynamic, not a permanent promise.
- Only classify **verified** total-parameter counts ≥100B as flagship. The `/models` API may omit parameter counts; in that case preserve the model in `needs_parameter_verification`, not the approved pool. Do not guess 100B from a model's name.
- Require `tools` in `supported_parameters` for child-agent candidates; independently probe tool-calling before production use. An ordinary completion probe is **not** proof of tool support.
- Never route to a paid model automatically. A 402, quota-exhausted response, or rate limit is not a reason to remove the user's existing Pi provider configuration.
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

1. Check `command -v pi`, `pi --version`, `~/.pi/agent/settings.json`, `~/.pi/agent/models.json`, and `pi --list-models` without disclosing keys.
2. Scan. Resolve model parameter counts from trustworthy model/provider documentation. Only move independently verified ≥100B entries into approved pool.
3. Probe a plain chat completion and a separate real `tools` call; distinguish 429 temporary rate limit from hard daily-quota exhaustion.
4. Check OpenRouter model ID, provider compatibility and context/max-token fields. Generate a candidate diff; do **not** overwrite Ling custom provider or `enabledModels`.
5. Require explicit approval of diff before applying. Back up original files, write atomically, run `python3 -m json.tool`, `pi --list-models` and `pi -p 'say pong' --no-extensions </dev/null`. On failure revert.
6. For Muse/Grokbot/Dot use a controlled shell child-agent invocation. Confirm host supports executing a local Pi command, shared workspace access and result capture first. Never expose Pi's shell/API to the public internet without authentication.
7. Ask user which model to use before major tasks; use automatic fallback only after user opts in. Never replay side-effectful actions after uncertain completion.

## Scheduling

Run `python3 /absolute/path/to/scripts/radar.py scan` once daily with cron/launchd/systemd timer on the **machine running Pi**. A ChatGPT reminder/watch does not edit that machine. Compare daily reports for delisted or repriced models. Confirm repeated transient errors before marking unusable. Keep separate `eligible`, `needs_parameter_verification`, and inactive states.

## Model selection

Prefer verified free ≥100B tool-capable models when available, but report a smaller tool-capable free model separately when that is operationally better. If no candidate passes, report empty pool rather than silently falling back to paid tokens.
