# 提示词怎么写

脚本里的模板已经写好了（`faces.py` 的 `swap_prompt` / `repaint_prompt` / `joint_prompt`，`h3_fl.py` 的 `prompt_for`），要填的只有 `shots.json` 的 `desc` / `cam` / `pose` / `swap` 和 `cast.json` 的 `identity` / `accessory`。

## 情绪：desc 里必须有 "Emotion:"
复刻的灵魂在表情。写法：
- 先看原片这个镜头（不是截图，是整段），写**变化**：从什么情绪到什么情绪。
- 落到看得见的东西上：眼神方向、眉、嘴（抿着 / 微张 / 咬唇）、下巴、呼吸、泪。
- 动作要克制："only small natural movements of heads, eyes and breathing"。H3 动作给多了容易夸张、变形。

好例子：
> A close-up of a woman in a grey coat on a rooftop against a pale hazy sky, long hair blowing. Emotion: cold and wounded — she turns her head and stares with proud, hurt eyes, holding back tears, lips pressed tight.

> A medium close-up from a low angle of a man on the same rooftop with his arms crossed, hair blowing in the wind. Emotion: sullen, stubborn pride — jaw set, eyes lowered and turned away, he refuses to leave and refuses to look at her.

## 有剧情的动作：写"在做什么、为什么、不要出现什么"
H3 只看到两帧画面，不懂剧情，会自己"合理化"动作。比如"她脱下外套"可能被演成别的动作，下一镜又给她穿回去。好的写法：
> Kneeling beside the exhausted man on the snowy ground, she takes off her heavy red coat from the left shoulder first and lays it over him. She is not hurt: there is no wound, no blood, no bandage. She is keeping him warm. Emotion: …

> Continuity: her coat is already over him from the previous moment and stays there; she never puts it back on and no new garment appears.

- 动作的**方向和部位**照原片写（"from the left shoulder first"，不是笼统的 "takes off her coat"）。
- **目的**写出来（"keeping him warm"），H3 会按目的补中间动作。
- **排除项**写出来（no wound / never puts it back on），这是最管用的一句。
- 上一镜造成的状态，下一镜开头要重述一遍（连戏）。

## 不让人说话
"Nobody speaks" 压不住特写里的嘴。放在 `desc` **最前面**：
> A silent moment: his mouth stays firmly closed the whole time and he does not speak; only his eyes move slightly and he breathes slowly through his nose.

再配上镜头的 `sound`："Complete silence, only a very faint wind. No human voice, no speech, no breathing sounds."（H3 是音画一起生成的，声音里有人声，嘴就会动。）

## pose（打码重画用）
打码后模型看不到原来的脸，朝向和表情只能靠这句话。照原帧写清楚四件事：**朝向**（three-quarter toward frame-left、facing the camera）、**视线**、**表情**、**嘴**。特写还要写光（harsh red light on the frame-right half of her face）和泪。
被遮挡的写出来：`her lower face is hidden behind his head`，不然模型会把整张脸画到别人的肩膀上。

## identity（重画的角色）
写**骨相**，不写气质：脸型、颧骨和下颌、眼型和眼皮、眉、鼻头、嘴唇、肤色、刘海。模板里已经接了一句 "do NOT invent or keep any other person's facial structure"。

## 去油腻（H3 和图像模型都要）
H3 的通病：皮肤发亮、高光发硬、过锐、饱和偏高。提示词里固定带：
`natural matte skin with visible pores and fine texture, no oily shine, no sweat, no glossy highlights, no plastic or waxy skin, no beauty filter, no HDR, no over-sharpening`
`project.json` 的 `style` 写胶片、年代、光线。剩下的交给 `finish.py grade`。

## H3 首尾帧提示词的结构（模板，不用手写）
```
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced. At 5.12 seconds into the target video, <Picture 2> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] <style>. The video begins exactly from <Picture 1> and ends exactly on <Picture 2>. Keep the same faces, hair, costumes, makeup, framing, background, lighting and colour as <Picture 1> throughout; ... <cam> <desc> <配饰一直戴着> ... Nobody speaks. ... No subtitles, captions, logos, watermarks or on-screen text of any kind appear.

overall_soundscape: <ambience>

non_diegetic_music: N/A
```
- 尾帧时间 = (length − 1) / 24，length 是 17k+5，在 124–362 之间。
- "Nobody speaks" + "non_diegetic_music: N/A"：H3 是音视频一起生成的，不写会出人声和配乐（成片用原歌，但人声会让嘴乱动）。
- "No subtitles…"：原片有烧录字幕时，H3 会学着在画面里加字。

## 图像模型编辑图片的要点
- 第一张图是要改的帧，后面是身份参考；**明说 "EDIT the first attached image"**，不然它会生成新图。
- 尾帧把已经做好的首帧作为最后一张参考："the faces must match it exactly"，首尾才是同一张脸。
- 保存路径和尺寸要求由 `common.edit_image` 按通道追加，模板里不用写。
- 授权说明写进提示词来自 `cast.json` 的 `consent`，所以那个字段必须是真的。
