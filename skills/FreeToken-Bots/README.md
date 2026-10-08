# FreeToken-Bots (safe MVP)

Pi-oriented OpenRouter free-model discovery for Muse, Grokbot and Dot child-agent workflows.

> ⚠️ **安装要求：这个 skill 自己不会扫描。** 必须配一个每天早上 8 点（本地时间）跑 `scripts/radar.py scan` 的定时任务（cron / launchd / systemd timer 三选一），否则免费模型名单会过期。装完第一件事就是把这个定时任务建起来。

## Commands

```bash
python3 scripts/radar.py scan
python3 scripts/radar.py status
OPENROUTER_API_KEY='your-key' python3 scripts/radar.py probe --model 'exact-model-id'
python3 scripts/radar.py sync --dry-run
```

Uses Python standard library only. `sync` does **not** mutate Pi yet: Pi schema detection, trusted parameter verification, separate tool-call probing and transactional config updates are planned follow-ups. Never install this expecting full unattended failover. The skill documents safe host-side integration steps.
