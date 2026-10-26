# 做一个新角色

1. **定人设**：真人感 / Pixar 风动物 / 二次元 Q 版都行。只用原创、自己训的虚构人物，或本人 / 明确同意的人；名字和造型避开现成 IP 和真人。
2. **出首帧（MOSS-Image，docker3）**：
   - 原创角色：`python3 scripts/moss_image.py --ratio 9:16 --n 4 --out cast/<名> --prompt "..."`（不加 LoRA）
   - 自己训的人物：加 `--lora moss01`（persona.json → moss.loras 里登记新 LoRA）。**提示词别覆盖 LoRA 学到的特征**（发色、脸型），只写想换的衣服、场景、小特征。
   - 要点：正脸、闭嘴、手不挡脸、头顶留空；竖屏小窗 9:16、全屏场景 16:9 各出一套。
3. **挑图**：做 contact sheet 一起看，挑脸最稳、光线最均匀的一张，放 `assets/cast/<名>_<916|169>.jpg`。
4. **登记**：`persona.json → hosts.<名>` 写 `name · ratio · frames · style · who · keep · voice`（动物加 `mouth: "beak"`，男性 `pronoun: "he"`）。
5. **试拍一段**：script.json 写一句 8 秒台词，`h3.py build` → `h3.py run --only <段>`，看脸有没有漂、音色喜不喜欢、口型对不对，满意再批量。音色不喜欢就改 `voice` 描述再拍。

训练自己的人物 LoRA：见 https://github.com/limin112/Lora（MOSS-Image + KohakuMoss，一张 4090，56 张图，1 小时）。
