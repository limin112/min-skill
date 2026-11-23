"""OpenAI Python SDK against the router (pip install openai). Start it first: ftb serve"""
import os

from openai import OpenAI

client = OpenAI(base_url=os.environ.get('FTB_BASE', 'http://127.0.0.1:8787/v1'),
                api_key=os.environ.get('FTB_ROUTER_KEY', 'ftb-local'))

# "auto" = best available free model; failover to other free models on 429/402/5xx.
resp = client.chat.completions.create(model='auto', messages=[{'role': 'user', 'content': 'Say hi'}])
print(resp.choices[0].message.content)

# Pin one free model (still falls back to other FREE models unless routing.pinned_fallback=false)
# resp = client.chat.completions.create(model='opencode/big-pickle', messages=[...])
