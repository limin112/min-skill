#!/bin/sh
# Any OpenAI-compatible client works the same way. Start the router first: ftb serve
BASE=${FTB_BASE:-http://127.0.0.1:8787/v1}
KEY=${FTB_ROUTER_KEY:-ftb-local}

curl -s "$BASE/models" -H "Authorization: Bearer $KEY" | python3 -m json.tool | head -20

# -i shows x-ftb-model (the free model actually used) and x-ftb-attempts (failover hops)
curl -s -i "$BASE/chat/completions" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"Say hi in 3 words"}]}'
