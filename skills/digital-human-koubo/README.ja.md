# digital-human-koubo · どんな記事でも → ローカル生成のデジタルヒューマン解説動画

[中文](README.md) · [English](README.en.md) · **日本語**

**記事を渡すと、複数キャラクターが掛け合い、図版アニメーションと二か国語字幕の付いた解説動画ができます。** モデルはすべてローカルで動くオープンソースで、クラウドの生成サービスは使いません。記事を替えるときに書き換えるのはデータだけで、コードはそのままです。

```
記事 ─▶ 台本 script.json（複数キャラ · 多言語 · 各セグメントに宣言的な画面 visual）
ローカル画像生成（MOSS-Image。自分で学習した人物 LoRA も使える）─▶ キャラクターの初期フレーム
MiniMax H3 + Turbo LoRA（8 ステップ、GPU 2 枚）─▶ セグメントごとに「映像 + ネイティブ音声」
whisper.cpp で全セグメントを聞き直し ─▶ 文字単位のタイミング ─▶ 汎用 Remotion テンプレート + コード合成 BGM ─▶ 完成動画
```

[![サンプルのプレビュー：クリックで再生](examples/ep01-moss-lora/preview.jpg)](examples/ep01-moss-lora/ep01.mp4)

▶ **動画**：[examples/ep01-moss-lora/ep01.mp4](examples/ep01-moss-lora/ep01.mp4)（3 分 38 秒 · 720p · 23 MB）· **ポスト**：[x.com/MinLiBuilds/status/2114876477267386417](https://x.com/MinLiBuilds/status/2114876477267386417?s=20) · **リポジトリ**：[github.com/limin112/min-skill/tree/main/skills/digital-human-koubo](https://github.com/limin112/min-skill/tree/main/skills/digital-human-koubo)

## 1 本分のプロジェクト構成

```
my-episode/
  article/        記事本文と図版
  script.json     [{"id":"s04","host":"host","ch":"① 仕組み","t":"……読み上げる原文……",
                    "visual":{"type":"image","src":"article/fig1.jpg","marks":[{"rect":[120,80,600,300],"at":"この部分"}]}}, …]
  cast.json       {"host":{"use":"moss"},"buddy":{"use":"oliver"}}      ← キャラクターライブラリから借りるか、新しく定義
  episode.json    {"series":"…","title":"…","theme":"tech","music":{"mood":"tech"}, …}
```

**画面タイプ**（`references/visuals.md`）：`big` 大見出し · `image` 図版（切り抜き / 注目枠 / スタンプ / 叫び文字）· `images` 複数図の比較 · `stats` カウントアップする数字 · `bars` 棒グラフ比較 · `terminal` ターミナル · `flow` フロー · `tags` タグ · `list` リスト · `card` カード · `quote` 名言 · `shout` 叫び文字 · `end` エンドロールとキャスト。配列にすると 1 セグメントに複数重ねられます。各要素は `"at": "<読み上げ中の語>"` でナレーションに合わせて表示されます。

**ムードのプリセット**（配色と BGM が一緒に切り替わり、`episode.json` に一語書くだけ）：

| | 配色 | BGM（`scripts/make_score.py`。コードで合成するので著作権の心配なし） |
|---|---|---|
| `magic` 幻想 | 深い紫 + 金 · 星空 · 三日月 | ニ短調 72 BPM：ストリングスのパッド + チェレスタのアルペジオ + 控えめなティンパニ |
| `tech` テック | 濃紺 + シアン · グリッド | イ短調 112 BPM：シンセパッド + 矩形波アルペジオ + パルスベース + 電子ドラム |
| `warm` あたたか | こげ茶 + オレンジ · 無地 | ハ長調 84 BPM：やわらかなパッド + ピアノの分散和音 + 指弾きベース |
| `epic` 壮大 | 暗い赤 + 金 · 星空 | ハ短調 90 BPM：厚いパッド + ブラスのロングトーン + 太鼓 + 大きなリバーブ |

**すぐ使えるキャラクター**（`assets/cast/library.json`。`{"use": "<id>"}` で借りる）：

| | id | |
|---|---|---|
| <img src="assets/cast/moss_916.jpg" width="80"> | `moss` | 実写風のメインホスト（MOSS-Image + 自作の moss01 LoRA） |
| <img src="assets/cast/oliver_916.jpg" width="80"> | `oliver` | 黒縁メガネのイギリス人相棒 |
| <img src="assets/cast/hoot_169.jpg" width="140"> | `hoot` | Pixar 風フクロウのアシスタント |
| <img src="assets/cast/chibi_916.jpg" width="80"> | `chibi` | 二次元のちびキャラ |

新しいキャラクター：`scripts/gen_image.py` で初期フレームを作り、`cast.json` に書きます（`references/new-avatar.md`）。

## 使い方

インストール後、Claude に「この記事を解説動画にして」「デジタルヒューマンにこのリンクを解説させて」と頼むだけです。手順は [SKILL.md](SKILL.md)（中国語）にあります。手動で動かす場合：

```bash
python3 scripts/h3.py build script.json tasks.json      # セグメント分割、H3 プロンプト生成、GPU 時間の見積もり
python3 scripts/h3.py run tasks.json --gpus 2           # GPU 2 枚で生成、中断しても再開できる
python3 scripts/assemble.py script.json                 # whisper で聞き直し、末尾の無音を切る → cut/
bash scripts/new_edit.sh explainer-169 edit             # 編集プロジェクトを作成
python3 scripts/build_tl.py --edit edit                 # タイムライン + 字幕 + 素材
python3 scripts/make_score.py --out edit/public/music/score.mp3
cd edit && npx remotion render src/index.ts Explainer out/video.mp4
```

完全なサンプル：[`examples/ep01-moss-lora`](examples/ep01-moss-lora)。人物 LoRA の学習記事を、3 分 38 秒・25 セグメント・4 キャラクター、イギリス英語で始まり中国語に切り替わる解説動画にしたものです。

## 必要なもの

| | どこで | 説明 |
|---|---|---|
| MiniMax H3（ComfyUI） | 24 GB 以上の GPU を積んだマシン | 重みは ModelScope `Comfy-Org/MiniMax-H3` から。高速化：`scripts/h3_setup_accel.sh`（Turbo ノード + LoRA、ModelScope 経由） |
| 画像生成（デフォルトは MOSS-Image + KohakuMoss） | 24 GB 以上の GPU を積んだマシン | 環境構築は [limin112/Lora](https://github.com/limin112/Lora)。別のモデルを使うなら `gen_image.py` のリモートコマンドを変更 |
| ffmpeg · Python 3 + numpy · Node 18+ · whisper-cli | 手元のコンピュータ | `bash scripts/doctor.sh` でまとめてチェック |

マシンのアドレスとモデルのパスは `persona.json` の `h3` / `image` セクションにあります。デプロイの詳細、実測速度、ハマりどころは [references/h3.md](references/h3.md)。

| 実測（RTX 4090 48 GB） | 1 セグメント |
|---|---|
| H3 オリジナル 20 ステップ · 1024×576 · 15 秒 | 約 23 分 |
| **H3 + Turbo 8 ステップ · 480×864 · 7–9 秒** | **約 2–4.5 分**（GPU 2 枚で並列、25 セグメントで約 45 分） |

## クレジットとライセンス
- [andyhuo520/digital-human-koubo](https://github.com/andyhuo520/digital-human-koubo)（MIT、[LICENSE-upstream](LICENSE-upstream) 参照）からのフォークです。テロップ風テンプレート、48 種の演出コンポーネント、聞き直し / 位置合わせ / 声の統一スクリプトは上流由来です。このフォークでは生成バックエンドをローカルの画像生成 + MiniMax H3 に置き換え、汎用の記事解説テンプレート、宣言的な画面、キャラクターライブラリ、複数キャラ・多言語、GPU 2 枚のスケジューリング、BGM のムードプリセットを加えました。
- 上流のホスト画像、スタイルのプレビュー、演出カタログは原作者のデジタルヒューマンなので、上流の NOTICE に従いここでは再配布していません（[assets/README.md](assets/README.md) 参照）。
- サードパーティのコンポーネントは [NOTICE.md](NOTICE.md)。キャラクターはすべて AI が生成した架空の人物で、実在の人物や既存の IP ではありません。動画には「AI 生成」と表示しています。
