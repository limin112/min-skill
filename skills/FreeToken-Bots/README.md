# FreeToken-Bots (safe MVP)

Pi-oriented OpenRouter free-model discovery for Muse, Grokbot and Dot child-agent workflows.

> ⚠️ **安装要求（两步，缺一不可）：**
> 1. **先装 Pi**：`curl -fsSL https://pi.dev/install.sh | sh`（或 `npm install -g @earendil-works/pi-coding-agent`，需 Node ≥ 22.19），装完 `pi --version` 验证。注意：云主机 redeploy 会清空 `/usr` 下的 pi 二进制，但 `~/.pi/agent/` 配置保留——`pi` 找不到时重装即可。
> 2. **再配定时扫描**：这个 skill 自己不会扫描。必须配一个每天早上 8 点（本地时间）跑 `scripts/radar.py scan` 的定时任务（cron / launchd / systemd timer 三选一），否则免费模型名单会过期。

**触发词**：当用户提到 OpenRouter、Pi、免费 token、免费模型（中英文皆可）时，激活此 skill。

## Commands

```bash
python3 scripts/radar.py scan
python3 scripts/radar.py status
OPENROUTER_API_KEY='your-key' python3 scripts/radar.py probe --model 'exact-model-id'
python3 scripts/radar.py sync --dry-run
```

Uses Python standard library only. `sync` does **not** mutate Pi yet: Pi schema detection, trusted parameter verification, separate tool-call probing and transactional config updates are planned follow-ups. Never install this expecting full unattended failover. The skill documents safe host-side integration steps.
