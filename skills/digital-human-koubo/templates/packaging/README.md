# 包装组件库 + 图鉴工程

- `src/kit/`：47 个包装组件（core 底座、Annotate 标注、Text 文字、Overlay 叠加、Map 地图、Wangan 网感、Explain 解说、Beast 节奏、Polish 质感）+ `registry.tsx`（按名字调用，`PackLayer`）。
- `src/demos/Demos.tsx`：每个组件一段 3–5 秒演示；`Gallery` 合成把它们首尾相接。
- 用法和参数：`../../references/packaging.md`；手法依据：`../../references/packaging-playbook.md`。

在别的工程里用：把 `src/kit/` 整个复制过去（`new_edit.sh` 起的 huazi-916 已经带了），`import { PackLayer } from "./kit/registry"`。
地图组件依赖 d3-geo、topojson-client、world-atlas（package.json 已写）。

重渲图鉴：演示用到 `public/media/` 里的素材（数字人口播 host_h.mp4 / host_v.mp4、场景图 shop/ad/travel/class/cat/dog.jpg、截图 screen.png / doc.png），打包版不带这些个人素材，换成你自己的同名文件后：
```bash
npx remotion render src/index.ts Gallery out/图鉴.mp4 --concurrency=6
```
