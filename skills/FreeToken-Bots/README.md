# FreeToken-Bots (safe MVP)

Pi-oriented OpenRouter free-model discovery for Muse, Grokbot and Dot child-agent workflows.

## Commands

```bash
python3 scripts/radar.py scan
python3 scripts/radar.py status
OPENROUTER_API_KEY='your-key' python3 scripts/radar.py probe --model 'exact-model-id'
python3 scripts/radar.py sync --dry-run
```

Uses Python standard library only. `sync` does **not** mutate Pi yet: Pi schema detection, trusted parameter verification, separate tool-call probing and transactional config updates are planned follow-ups. Never install this expecting full unattended failover. The skill documents safe host-side integration steps.
