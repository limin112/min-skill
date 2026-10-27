# 做一个新角色

1. **定人设**：真人感 / Pixar 风动物 / 二次元 Q 版都行。只用原创、自己训的虚构人物，或本人 / 明确同意的人；名字和造型避开现成 IP 和真人。先翻 `assets/cast/library.json`，有合适的直接 `{"use": "<id>"}`。
2. **出首帧**（`scripts/gen_image.py`，跑在 `persona.json → image` 配的机器上）：
   - 原创角色：`python3 scripts/gen_image.py --ratio 9:16 --n 4 --out cast/<名> --prompt "..."`
   - 自己训的人物：加 `--lora <名字>`（在 `persona.json → image.loras` 登记）。**提示词别覆盖 LoRA 学到的特征**（发色、脸型），只写想换的衣服、场景、小特征。
   - 要点：正脸、闭嘴、手不挡脸、头顶留空；竖屏小窗 9:16、全屏场景 16:9 按需各出一套。
   - 也可以直接用现成的图（用户本人照片要本人同意），裁成 9:16 / 16:9 就行，h3.py 会再按 H3 分辨率裁一次。
3. **挑图**：拼 contact sheet 一起看，挑脸最稳、光线最均匀的一张。
4. **登记**：写进工程的 `cast.json`：
   ```json
   "guest": {"name": "小鲸", "tag": "嘉宾", "color": "info", "ratio": "9:16",
             "frames": {"9:16": "cast/guest_916.jpg"},
             "style": "3D animated, Pixar-style render",
             "who": "the cute little blue whale Xiaojing wearing a tiny yellow raincoat",
             "keep": "raincoat", "voice": "small cheerful child-like voice, slightly bubbly",
             "pronoun": "it", "mouth": "lips"}
   ```
   `who` / `voice` 用英文（进 H3 提示词），`voice` 每段一字不改。动物 `mouth: "beak"`（鸟）或 `"lips"`，男性 `pronoun: "he"`。以后还要用的角色，把首帧放 `assets/cast/`、条目加进 `library.json`（frames 相对 skill 目录）。
5. **试拍一段**：script.json 写一句 8 秒台词，`h3.py build` → `h3.py run --only <段>`，看脸有没有漂、音色喜不喜欢、口型对不对，满意再批量。音色不喜欢就改 `voice` 再拍。

训练自己的人物 LoRA：见 https://github.com/limin112/Lora（MOSS-Image + KohakuMoss，一张 4090，56 张图，约 1 小时）。
