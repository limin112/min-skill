# 出图通道

`faces.py` 改图走两条通道之一，在用户配置里选。

## Codex CLI（默认）
装好并登录 [Codex CLI](https://github.com/openai/codex)，不用配置。它调 gpt-image 编辑图片，额度和内容规则看你的账号。
```bash
python3 scripts/configure.py --image codex
```
用户配置里可以写 `image.model`（首选模型）和 `image.fallback_models`（满载时依次换的备选）。只在报 "at capacity" 时换，拒绝类错误不会换模型硬试。

## 自建 HTTP 服务
任何图像编辑模型都能接，实现下面这个接口就行：
```bash
python3 scripts/configure.py --image http --image-urls http://127.0.0.1:18801,http://127.0.0.1:18802
```
多个地址时，每个线程借一个空闲实例。临时指定：`export COPYKAKASI_IMAGE_URLS=<地址>`。

```
POST /gen
  {"prompt": "...",  "negative": "",  "cfg": 4,  "steps": 40,  "seed": -1,  "width": 1536,  "height": 864,
   "refs": ["data:image/png;base64,...", ...]}      // refs[0] 是要改的图，后面是身份参考
→ {"file": "xxx.png"}（失败时不带 file，整个 JSON 会写进日志）

GET /img/<file>  → 图片内容
```
提示词里的 `image1`、`image2` 对应 `refs` 的顺序。用户配置 `image.cfg`、`image.steps`、`image.seed`、`image.negative`（true 时带负向提示词，通常更吃显存）可调。

模型常常会重画整张图：这时用 `faces.py joint`，它只取头部贴回原帧。
