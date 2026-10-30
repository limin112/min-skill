# 什么场景适合 HDR（以及怎么描述给视频模型）

HDR 的冲击力来自“极暗和极亮同时出现”，而且亮的是**小面积光点**（阳光反光、云边、镀铬），不是大块白面。
所以选素材、写提示词，都围绕“一个强光源 + 深阴影 + 一些高光反射面”。

## 适合

- 太阳或落日在画面里，逆光或侧逆光
- 积云的亮边、天空渐变
- 水面碎光、海面反光
- 镀铬、玻璃、湿路面的尖锐高光
- 夜里的霓虹、路灯、车灯（亮点周围要有真正的暗部）
- 前景有接近黑色的阴影（岩石、树丛、车底）

## 不适合

- 文字、字幕、PPT、数据卡片、米色或白色底的画面
- 阴天（云没有亮边）
- 整面白墙、白雪占满画面
- 只有暗、没有亮点的夜景

## 示例场景：傍晚前一小时的海岸悬崖公路

一条贴着悬崖的盘山公路，右边是碧蓝的海。红色老式敞篷车沿公路行驶，镜头在车后侧低位跟拍，略微仰视，
能看到前方公路绕过山崖。前景是被风吹动的草和半埋在阴影里的岩石。

光线：太阳在画面左上方、位置偏低，侧逆光；海面铺满碎金一样的反光点；积云很高，边缘发银白、中心偏暗；
车的镀铬保险杠、挡风玻璃、后视镜各有一个小而尖锐的亮点；前景岩石和草丛处在阴影里，接近黑色。

提示词（英文，多数视频模型对英文更稳）：

> Cinematic tracking shot from low behind a red vintage convertible driving along a cliffside coastal road in late afternoon, low sun at upper left, strong backlight, sparkling sun glints across the turquoise sea, towering cumulus clouds with glowing silver edges, chrome bumper and windshield flaring with sharp specular highlights, deep shadowed rocks and wind-blown grass in the foreground, rich contrast, photorealistic, 24fps

用这段描述生成的一条视频跑过一遍本 skill 的流程：亮度数据正常，没有卡片类素材的过曝问题
（白天亮场景，`--white 650 --knee 0.35 --power 1.8` 下平均 48%，近纯白只有 0.2%）。

提示词里别写 “HDR” 这个词：模型生成的仍然是 SDR，写了也不会变 HDR。要把反差放进场景本身，
再由本 skill 的转换去拉高光。

## 备选场景

雪山日出：太阳刚从雪脊后面露头，逆光里雪粒闪光，山谷还在深蓝色的阴影里。
但大面积雪地容易刺眼，优先用上面的海岸场景。
