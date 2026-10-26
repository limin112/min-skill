// 图鉴演示：每个组件一段 3–5 秒的独立 Composition，用真实素材（数字人、场景图、截图）演示用法。
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import { C, FONT, Sfx } from "../kit/core";
import { FreezeFrame, HandDraw, Highlight, ZoomFocus } from "../kit/Annotate";
import { ChapterCard, Countdown, Counter, LowerThird, RetentionCaption, SourceTag, SpecCard } from "../kit/Text";
import { CompareWipe, Danmaku, PaperCollage, ProgressChapters, ReactionPop, TeaserColdOpen } from "../kit/Overlay";
import { MapRoute } from "../kit/Map";
import { ArchiveCards, BarCompare, CalloutPill, DocFocus, GhostWord, LeaderLabel, LineDraw, PunchInHost, RecapBoard, SearchTyping, SlamText, TornStrip, TypedNameTag } from "../kit/Explain";
import { NumberSpike, ProgressTracker, ReviewCards, WordStack } from "../kit/Beast";
import { GlassPanel, KeywordStack, Odometer, SourceDoc } from "../kit/Polish";
import { TextBehind } from "../kit/Depth";
import { Aside, ColdOpenFreeze, EvidenceCard, GlitchInterstitial, HostFloaters, MemeWindow, NamePlate, PollPop, TiltLine } from "../kit/Wangan";

const HostH: React.FC<{ dim?: number }> = ({ dim = 0 }) => (
  <AbsoluteFill><OffthreadVideo src={staticFile("media/host_h.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover", filter: `brightness(${1 - dim})` }} /></AbsoluteFill>
);
const Tag: React.FC<{ n: string; d: string }> = ({ n, d }) => (
  <div style={{ position: "absolute", left: 30, bottom: 26, fontFamily: FONT.zh, fontSize: 24, color: "#fff", background: "rgba(0,0,0,.6)", padding: "6px 14px", borderRadius: 8, zIndex: 99 }}><b style={{ color: C.yellow }}>{n}</b> · {d}</div>
);

export const DemoRetention: React.FC = () => (
  <AbsoluteFill><HostH />
    <RetentionCaption y={780} words={[{ t: "一张", at: 0.3 }, { t: "照片", at: 0.55, key: true }, { t: "做出", at: 0.95 }, { t: "数字人", at: 1.2, key: true }, { t: "只要", at: 1.8 }, { t: "23 积分", at: 2.1, key: true }]} />
    <Sfx at={0.55} name="pop" vol={0.35} /><Sfx at={1.2} name="pop" vol={0.35} /><Sfx at={2.1} name="ding" vol={0.4} />
    <Tag n="RetentionCaption" d="留存大字幕 · 逐词砸出、关键词变色" /></AbsoluteFill>
);
export const DemoZoomFocus: React.FC = () => (
  <AbsoluteFill style={{ background: "#1a1a1f" }}>
    <ZoomFocus src="media/screen.png" iw={2880} ih={1800} at={0.6} until={3.6} focus={{ x: 2520, y: 30, w: 330, h: 70 }} label="右上角点「注册」" box={{ x: 120, y: 80, w: 1680, h: 920 }} />
    <Sfx at={0.6} name="whoosh" vol={0.4} /><Sfx at={1.2} name="click" vol={0.5} />
    <Tag n="ZoomFocus" d="录屏 / 截图推近聚焦 + 压暗 + 标签" /></AbsoluteFill>
);
export const DemoHandDraw: React.FC = () => (
  <AbsoluteFill><Img src={staticFile("media/shop.jpg")} style={{ position: "absolute", left: 660, top: 0, height: 1080 }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg,#111 0 34%,transparent 34% 66%,#111 66%)" }} />
    <HandDraw kind="circle" at={0.4} x={760} y={300} w={200} h={330} color={C.yellow} />
    <HandDraw kind="arrow" at={1.1} x={760} y={380} w={200} h={200} from={[300, 200]} color={C.yellow} />
    <div style={{ position: "absolute", left: 120, top: 120, fontFamily: FONT.zh, fontWeight: 900, fontSize: 64, color: "#fff" }}>道具也是 AI 合成的</div>
    <HandDraw kind="underline" at={1.7} x={120} y={130} w={540} h={70} color={C.red} />
    <Sfx at={0.4} name="swish-1" vol={0.35} /><Sfx at={1.1} name="swish-2" vol={0.35} />
    <Tag n="HandDraw" d="手绘圈 / 箭头 / 下划线 · 描边生长" /></AbsoluteFill>
);
export const DemoFreeze: React.FC = () => (
  <AbsoluteFill><HostH />
    <FreezeFrame src="media/ad.jpg" at={0.8} until={3.6} label="等等！" note="耳机也是 AI 生成的，不是实拍" mark={{ x: 640, y: 560, w: 260, h: 220 }} />
    <Sfx at={0.8} name="impact" vol={0.5} />
    <Tag n="FreezeFrame" d="定格 + 去色 + 大字 + 圈注（打断节奏）" /></AbsoluteFill>
);
export const DemoLowerThird: React.FC = () => (
  <AbsoluteFill><HostH />
    <LowerThird at={0.4} until={3.6} name="Berryxia 的数字人" title="AI 视频创作者 · 用本人照片生成" />
    <SourceTag at={0.8} until={3.6} text="形象：GPT Image 2.5 · 口播：Grok Video 1.5" />
    <Tag n="LowerThird + SourceTag" d="人名条 + 出处角标" /></AbsoluteFill>
);
export const DemoCounter: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Counter at={0.4} dur={1.3} to={3409} unit="积分" label="这期总共花了" y={330} />
    <Countdown at={0.2} seconds={4} label="生成中" />
    <Sfx at={0.4} name="processing" vol={0.3} /><Sfx at={1.7} name="ding" vol={0.5} />
    <Tag n="Counter + Countdown" d="数字滚动落地弹一下 · 倒计时最后 3 秒变红" /></AbsoluteFill>
);
export const DemoChapter: React.FC = () => (
  <AbsoluteFill><HostH />
    <ChapterCard at={0.3} until={3.4} n="02" title="进场景" sub="同一个数字人，换个地方开工" color={C.green} />
    <Sfx at={0.3} name="whoosh" vol={0.45} />
    <Tag n="ChapterCard" d="章节卡 · 色条扫过 + 大序号" /></AbsoluteFill>
);
export const DemoSpec: React.FC = () => (
  <AbsoluteFill style={{ background: "#0B0B0D" }}>
    <Img src={staticFile("media/ad.jpg")} style={{ position: "absolute", left: -200, top: 0, height: 1080, filter: "brightness(.85)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 40%, #0B0B0D 62%)" }} />
    <SpecCard at={0.4} until={3.8} rows={[{ k: "续航", v: "40", u: "小时" }, { k: "重量", v: "4.8", u: "克 / 只" }, { k: "价格", v: "¥599" }]} x={1240} y={220} />
    <Tag n="SpecCard" d="质感参数卡 · 大数字小单位、留白、逐行淡入（示意数据）" /></AbsoluteFill>
);
export const DemoDanmaku: React.FC = () => (
  <AbsoluteFill><HostH />
    <Danmaku items={[{ t: "真的假的？", at: 0.1 }, { t: "这是 AI？？", at: 0.4, hot: true }, { t: "口型好准", at: 0.8 }, { t: "求教程", at: 1.1 }, { t: "23 积分就能做？", at: 1.4, hot: true }, { t: "已三连", at: 1.9 }, { t: "前排", at: 2.3 }]} />
    <Tag n="Danmaku" d="弹幕 · 替观众说出质疑 / 起哄" /></AbsoluteFill>
);
export const DemoReaction: React.FC = () => (
  <AbsoluteFill><HostH />
    <ReactionPop at={0.4} emoji="😱" caption="才 23 积分？" x={1380} y={380} />
    <ReactionPop at={1.9} emoji="🤯" caption="口型也太准" x={120} y={420} rot={-8} />
    <Sfx at={0.4} name="pop" vol={0.45} /><Sfx at={1.9} name="pop" vol={0.45} />
    <Tag n="ReactionPop" d="反应贴纸 · 动态表情 + 吐槽（不用影视剧截图）" /></AbsoluteFill>
);
export const DemoProgress: React.FC = () => (
  <AbsoluteFill><HostH />
    <ProgressChapters total={4} chapters={[{ at: 0, t: "① 接工具" }, { at: 1.2, t: "② 做形象" }, { at: 2.4, t: "③ 配声音" }, { at: 3.2, t: "④ 进场景" }]} />
    <Tag n="ProgressChapters" d="顶部进度条 + 章节刻度" /></AbsoluteFill>
);
export const DemoTeaser: React.FC = () => (
  <AbsoluteFill>
    <TeaserColdOpen clips={[{ src: "media/cat.jpg", img: true, dur: 0.55, label: "猫也能开口？" }, { src: "media/travel.jpg", img: true, dur: 0.55, label: "日语导览" }, { src: "media/ad.jpg", img: true, dur: 0.55, label: "英文广告" }, { src: "media/shop.jpg", img: true, dur: 0.55, label: "直播带货" }]} question={"这些全是\n一张照片做的"} />
    {[0, 0.55, 1.1, 1.65].map((a) => <Sfx key={a} at={a} name="cut" vol={0.45} />)}<Sfx at={2.2} name="impact" vol={0.5} />
    <Tag n="TeaserColdOpen" d="开场预告闪回 → 问题字卡" /></AbsoluteFill>
);
export const DemoCompare: React.FC = () => (
  <AbsoluteFill style={{ background: "#111" }}>
    <CompareWipe at={0.5} a="media/class.jpg" b="media/ad.jpg" la="原照片场景" lb="换成广告棚" box={{ x: 160, y: 90, w: 1600, h: 900 }} />
    <Sfx at={0.5} name="swish-2" vol={0.45} />
    <Tag n="CompareWipe" d="前后对比擦除" /></AbsoluteFill>
);
export const DemoPaper: React.FC = () => (
  <AbsoluteFill>
    <PaperCollage at={0.1} title="一张照片，四个场景" items={[{ src: "media/shop.jpg", x: 140, y: 250, w: 300, caption: "直播间" }, { src: "media/ad.jpg", x: 520, y: 300, w: 520, caption: "广告棚" }, { src: "media/travel.jpg", x: 1110, y: 230, w: 290, caption: "京都" }, { src: "media/class.jpg", x: 1440, y: 330, w: 420, caption: "教室" }]} note={{ text: "都没出门！", x: 1180, y: 860, at: 2.0 }} />
    {[0.3, 0.65, 1.0, 1.35].map((a) => <Sfx key={a} at={a} name="paper-place-1" vol={0.5} />)}
    <Tag n="PaperCollage" d="纸张拼贴 · 白边照片 + 胶带 + 手写批注" /></AbsoluteFill>
);
export const DemoHighlight: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper, padding: 140 }}>
    <div style={{ fontFamily: FONT.serif, fontSize: 52, color: C.ink, lineHeight: 1.9, maxWidth: 1500 }}>
      （示意文字）生成数字人口播之前，<Highlight at={0.5}>系统会先告诉你要花多少积分</Highlight>，用户确认后才开始生成；<Highlight at={1.6} color="rgba(255,90,138,.45)">先拍第 1 段确认音色</Highlight>，可以避免整批返工。
    </div>
    <Sfx at={0.5} name="swish-1" vol={0.3} /><Sfx at={1.6} name="swish-1" vol={0.3} />
    <Tag n="Highlight" d="荧光笔刷重点（原文 / 公告 / 文档）" /></AbsoluteFill>
);
export const DemoMap: React.FC = () => (
  <AbsoluteFill>
    <MapRoute theme="dark" title={{ text: "一个数字人，跑遍五个国家", at: 0.2 }}
      camera={[{ at: 0, lon: 100, lat: 25, zoom: 1 }, { at: 1.6, lon: 125, lat: 34, zoom: 2.6 }, { at: 3.8, lon: 125, lat: 34, zoom: 2.6 }]}
      highlight={[{ name: "China", at: 1.6 }, { name: "Japan", at: 2.2, color: C.pink }, { name: "South Korea", at: 2.6, color: C.cyan }]}
      pins={[{ name: "上海", lon: 121.5, lat: 31.2, at: 1.8 }, { name: "京都", lon: 135.8, lat: 35.0, at: 2.4, color: C.pink }, { name: "首尔", lon: 127.0, lat: 37.6, at: 2.8, color: C.cyan }]}
      routes={[{ from: [121.5, 31.2], to: [135.8, 35.0], at: 2.0 }, { from: [135.8, 35.0], to: [127.0, 37.6], at: 2.6 }]} />
    <Sfx at={1.8} name="pop" vol={0.4} /><Sfx at={2.4} name="pop" vol={0.4} /><Sfx at={2.8} name="pop" vol={0.4} />
    <Tag n="MapRoute" d="地图推近 + 国家高亮 + 图钉 + 航线生长" /></AbsoluteFill>
);

export const DemoMeme: React.FC = () => (
  <AbsoluteFill>
    <MemeWindow until={4} watermark="@你的频道" items={[{ src: "media/cat.jpg", at: 0, caption: "本喵：又要加班？" }, { src: "media/dog.jpg", at: 1.3, caption: "突发：老板说今天不开会", pos: "bottom" }, { src: "media/shop.jpg", at: 2.6, caption: "家人们谁懂啊" }]} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 930, textAlign: "center", fontFamily: FONT.zh, fontWeight: 800, fontSize: 50, color: "#fff" }}>一句话配一张图，观众的情绪就跟上了</div>
    <Sfx at={1.3} name="tap" vol={0.3} /><Sfx at={2.6} name="tap" vol={0.3} />
    <Tag n="MemeWindow" d="黑底梗图窗 · 一句一图硬切（素材用原创 IP 表情包）" /></AbsoluteFill>
);
export const DemoColdFreeze: React.FC = () => (
  <AbsoluteFill>
    <ColdOpenFreeze src="media/cat.mp4" freezeAt={1.6} until={4.2} title={["一只猫", "凭什么能带货？"]} vol="VOL.003" />
    <Sfx at={1.6} name="impact" vol={0.5} /><Sfx at={1.8} name="swish-2" vol={0.4} />
    <Tag n="ColdOpenFreeze" d="冷开场 → 定格去色 → 未完待续 → 片名卡 → 雪花转场" /></AbsoluteFill>
);
export const DemoEvidence: React.FC = () => (
  <AbsoluteFill>
    <EvidenceCard src="media/screen.png" iw={2880} ih={1800} at={0.1} until={4} focus={{ x: 1810, y: 62 }} label="30% OFF 限时" labelAt={1.4} tilt={-14} source="截图：renoise.ai 官网，2026-10" />
    <Sfx at={0.1} name="whoosh" vol={0.4} /><Sfx at={1.4} name="pop" vol={0.45} />
    <Tag n="EvidenceCard" d="证据截图飞入 · 品牌色框 + 鼠标 + 推近数值签" /></AbsoluteFill>
);
export const DemoPoll: React.FC = () => (
  <AbsoluteFill><HostH />
    <PollPop at={0.3} until={4} options={[{ n: "1", t: "能看出是 AI", at: 0.9 }, { n: "2", t: "完全看不出", at: 2.0 }]} />
    <Sfx at={0.9} name="pop" vol={0.5} /><Sfx at={2.0} name="pop" vol={0.5} />
    <Tag n="PollPop" d="投票弹窗 · 评论区打 1 还是 2（揭晓前站队）" /></AbsoluteFill>
);
export const DemoGlitch: React.FC = () => (
  <AbsoluteFill><HostH />
    <GlitchInterstitial at={1.2} dur={0.6} text="点赞关注" host="media/host_h.mp4" />
    <Sfx at={1.2} name="cut" vol={0.6} />
    <Tag n="GlitchInterstitial" d="0.5 秒故障插屏 · 中段号召" /></AbsoluteFill>
);
export const DemoNamePlate: React.FC = () => (
  <AbsoluteFill><Img src={staticFile("media/class.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) brightness(.75)" }} />
    <NamePlate at={0.3} until={4} name="林老师" title="某培训机构讲师（示意角色）" x={140} y={700} quotes={[{ t: "三分钟搞懂大模型", at: 1.0 }, { t: "不用写一行代码", at: 1.7 }, { t: "一张照片就够", at: 2.4 }]} qx={1080} qy={220} />
    {[1.0, 1.7, 2.4].map((a) => <Sfx key={a} at={a} name="pop" vol={0.4} />)}
    <Tag n="NamePlate" d="去色人物 + 双层名牌 + 语录药丸气泡" /></AbsoluteFill>
);
export const DemoFloaters: React.FC = () => (
  <AbsoluteFill><HostH />
    <HostFloaters at={0.2} until={4} windows={[{ src: "media/screen.png", pos: "tl", title: "renoise.ai" }, { src: "media/doc.png", pos: "tr", title: "插件安装" }]}
      chips={[{ t: "不用复制 API key", icon: "ok", at: 1.4, x: 120, y: 760 }, { t: "别装来路不明的插件", icon: "x", at: 2.2, x: 1240, y: 760 }]} />
    <Sfx at={1.4} name="pop" vol={0.4} /><Sfx at={2.2} name="pop" vol={0.4} />
    <Tag n="HostFloaters" d="主播旁悬浮窗 + 图标小标签（主播一直在画面里）" /></AbsoluteFill>
);
export const DemoAsideTilt: React.FC = () => (
  <AbsoluteFill><HostH dim={0.25} />
    <TiltLine at={0.3} until={2.4} text="照片不是重点，流程才是" keys={["流程"]} />
    <Aside items={[{ t: "剪辑师：这句我听了八遍", at: 2.5, until: 4 }]} />
    <Sfx at={0.3} name="slam-1" vol={0.4} />
    <Tag n="TiltLine + Aside" d="倾斜金句逐字弹出 · 括号旁白吐槽" /></AbsoluteFill>
);

export const DemoDocFocus: React.FC = () => (
  <AbsoluteFill>
    <DocFocus at={0} until={4} source="示意文档（非真实公告）" title="数字人口播生成流程（示意）" paras={[[{ t: "为保证效果，系统会把口播稿切成不超过 15 秒的片段。" }, { t: "每段生成前都会先显示预计消耗的积分，", focus: true }, { t: "用户确认后才会开始生成，", hl: true, hlAt: 1.3 }, { t: "中途取消不扣费。" }], [{ t: "建议先生成第一段确认音色与口型，再批量生成其余片段。" }]]} />
    <Sfx at={1.3} name="swish-1" vol={0.35} />
    <Tag n="DocFocus" d="句子聚焦：其他字压暗 35% + 黄块扫关键词（示意公告）" /></AbsoluteFill>
);
export const DemoTypedName: React.FC = () => (
  <AbsoluteFill><HostH />
    <TypedNameTag at={0.3} until={4} name={"Berryxia\n的数字人"} title="用本人一张照片生成 · Grok Video 1.5" x={80} y={420} target={[880, 360]} />
    {[0.6, 0.75, 0.9, 1.05, 1.2, 1.35].map((a) => <Sfx key={a} at={a} name="key-1" vol={0.25} />)}
    <Tag n="TypedNameTag" d="手绘箭头 + 粗衬线名字逐字打出" /></AbsoluteFill>
);
export const DemoPunchIn: React.FC = () => (
  <AbsoluteFill><PunchInHost src="media/host_h.mp4" cuts={[1.1, 2.0, 3.0]} />
    <Tag n="PunchInHost" d="跳切推近：同一条素材按句子边界 1.0× ↔ 1.3× 硬切" /></AbsoluteFill>
);
export const DemoRecap: React.FC = () => (
  <AbsoluteFill>
    <RecapBoard at={0} until={4} reveal={[3, 2]} newAt={0.6} columns={[{ title: "为什么难", color: "#C0504D", items: ["口型对不上", "声音不统一", "画面太单调"] }, { title: "怎么办", color: "#95C96B", items: ["用目标语言开口", "统一频谱 + 房间混响"] }]} />
    <Sfx at={0.6} name="ding" vol={0.35} />
    <Tag n="RecapBoard" d="累积复盘板：每章回来亮一条新的" /></AbsoluteFill>
);
export const DemoSearch: React.FC = () => (
  <AbsoluteFill>
    <SearchTyping at={0} until={4} query="怎么用一张照片做数字人" suggestions={["怎么用一张照片做数字人 免费", "怎么用一张照片做数字人 口型", "怎么用一张照片做数字人 教程"]} />
    {Array.from({ length: 11 }).map((_, k) => <Sfx key={k} at={0.2 + k / 9} name={`key-${(k % 8) + 1}`} vol={0.2} />)}
    <Tag n="SearchTyping" d="搜索框打字冷开场 + 联想词 + 推近（中性搜索框，不仿品牌）" /></AbsoluteFill>
);
export const DemoPillLeader: React.FC = () => (
  <AbsoluteFill style={{ background: "#3B3A3A" }}>
    <Img src={staticFile("media/ad.jpg")} style={{ position: "absolute", left: 80, top: 190, height: 700, borderRadius: 20 }} />
    <CalloutPill at={0.3} until={4} text="AI 生成的耳机" sub="GPT Image 2.5 · 23 积分" x={330} y={360} color="#9F36CB" />
    <LeaderLabel at={1.1} until={4} target={[760, 330]} zh="同一张脸" en="Same face, new scene" len={560} tag="参考图一张" />
    <LeaderLabel at={1.6} until={4} target={[800, 640]} zh="换了衣服" en="Outfit swapped" len={520} />
    <Sfx at={0.3} name="pop" vol={0.4} /><Sfx at={1.1} name="tap" vol={0.3} /><Sfx at={1.6} name="tap" vol={0.3} />
    <Tag n="CalloutPill + LeaderLabel" d="指针胶囊 · 引线双语标注" /></AbsoluteFill>
);
export const DemoCharts: React.FC = () => (
  <AbsoluteFill>
    <LineDraw at={0} until={2.4} title="每段口播成本（积分）" series={[{ label: "720p", color: C.green, data: [17, 51, 85, 119, 153, 187, 221, 255] }, { label: "480p", color: "#E8E3D3", data: [10, 30, 50, 70, 90, 110, 130, 150] }]} xLabels={["1s", "3s", "5s", "7s", "9s", "11s", "13s", "15s"]} source="Renoise estimate_cost 实测 · 2026-10" />
    <BarCompare at={2.4} until={4.6} title="同一句 8 秒对比" ghost="Cost" rows={[{ label: "Grok Video 1.5 · 720p", value: 136, text: "136 积分" }, { label: "Wan 3.0 · 720p", value: 96, text: "96 积分", color: "#6B8F71" }]} />
    <Tag n="LineDraw + BarCompare" d="折线逐段画出 + 末端标签 · 对比条 + 鬼影大字" /></AbsoluteFill>
);
export const DemoSlam: React.FC = () => (
  <AbsoluteFill><HostH dim={0.15} />
    <SlamText at={0.3} until={3} lines={["一张照片", "就是一个主播"]} year="2026" />
    <Sfx at={0.3} name="slam-1" vol={0.5} /><Sfx at={0.8} name="slam-2" vol={0.5} />
    <Tag n="SlamText" d="冲击句砸字 + 年份角标" /></AbsoluteFill>
);
export const DemoTorn: React.FC = () => (
  <AbsoluteFill><Img src={staticFile("media/class.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(.7)" }} />
    <TornStrip at={0.3} until={4} title="数字人进阶" sub="VOL.003 · DIGITAL HUMAN" />
    <Sfx at={0.3} name="page-2" vol={0.5} />
    <Tag n="TornStrip" d="撕纸标题条（片名 / 章节）" /></AbsoluteFill>
);
export const DemoArchive: React.FC = () => (
  <AbsoluteFill>
    <ArchiveCards at={0} per={0.6} images={[{ src: "media/class.jpg", label: "讲师 · 2026" }, { src: "media/shop.jpg", label: "直播间" }, { src: "media/travel.jpg", label: "京都 · 祇园" }, { src: "media/dog.jpg", label: "新闻台" }, { src: "media/cat.jpg", label: "宠物店" }, { src: "media/ad.jpg", label: "广告棚" }]} />
    <Tag n="ArchiveCards" d="档案卡快切（真实档案请用公有领域素材）" /></AbsoluteFill>
);
export const DemoSpike: React.FC = () => (
  <AbsoluteFill><HostH />
    <NumberSpike at={0.3} until={4} text="23 积分" label="做一个数字人形象" pinAt={2.2} />
    <Sfx at={0.3} name="impact" vol={0.6} /><Sfx at={2.2} name="swish-1" vol={0.35} />
    <Tag n="NumberSpike" d="数字钉子：超大数字 0.5 秒缩到顶部 + 闪光 → 缩成角标常驻" /></AbsoluteFill>
);
export const DemoTracker: React.FC = () => (
  <AbsoluteFill><HostH />
    <ProgressTracker at={0} until={4} mode="steps" steps={["接工具", "做形象", "配声音", "进场景"]} stepAt={[0, 1, 2, 3]} />
    <ProgressTracker at={0} until={4} from="一张照片" to="一条成片" icon="🎬" progress={[{ at: 0.2, v: 0.25 }, { at: 1.2, v: 0.5 }, { at: 2.2, v: 0.75 }, { at: 3.2, v: 1 }]} />
    <Tag n="ProgressTracker" d="常驻进度：步骤徽章 + 路线条" /></AbsoluteFill>
);
export const DemoWordStack: React.FC = () => (
  <AbsoluteFill>
    <WordStack until={3} words={[{ t: "一张照片", at: 0.2 }, { t: "六种语言", at: 0.6 }, { t: "四个场景", at: 1.0 }, { t: "0 拍摄", at: 1.4 }]} />
    {[0.2, 0.6, 1.0, 1.4].map((a) => <Sfx key={a} at={a} name="slam-3" vol={0.4} />)}
    <Tag n="WordStack" d="逐词堆叠大字，一拍一个词" /></AbsoluteFill>
);
export const DemoReviews: React.FC = () => (
  <AbsoluteFill><HostH dim={0.45} />
    <ReviewCards at={0.2} cards={[{ name: "小王", stars: 2, text: "数字人口型总对不上，看着很假" }, { name: "Lily", stars: 1, text: "声音一段一个样，混响忽远忽近" }, { name: "阿杰", stars: 2, text: "画面太单调，看两分钟就划走了" }]} />
    {[0.2, 1.3, 2.4].map((a) => <Sfx key={a} at={a} name="pop" vol={0.4} />)}
    <Tag n="ReviewCards" d="评论 / 差评卡连弹（示意评论，非真实用户）" /></AbsoluteFill>
);

export const DemoKeyword: React.FC = () => (
  <AbsoluteFill><PunchInHost src="media/host_h.mp4" cuts={[1.6, 3.0]} levels={[{ s: 1 }, { s: 1.18, dx: -0.06 }, { s: 1.32, dx: 0.04 }]} />
    <KeywordStack until={3.8} items={[{ t: "形象", at: 0.3, icon: "🧑" }, { t: "声音", at: 0.9, icon: "🎙️" }, { t: "口型", at: 1.5, icon: "👄" }]} x={1240} y={260} />
    {[0.3, 0.9, 1.5].map((a) => <Sfx key={a} at={a} name="pop" vol={0.35} />)}
    <Tag n="KeywordStack + 多档景别" d="图标彩色词依次弹出 · 1.0/1.18/1.32 景别 + 左右偏置" /></AbsoluteFill>
);
export const DemoGlass: React.FC = () => (
  <AbsoluteFill><Img src={staticFile("media/ad.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(.6)" }} />
    <GlassPanel at={0.2} until={4} title="8 秒口播 · 720p 积分消耗（实测报价）" unit=" 积分" rows={[{ label: "Grok Video 1.5", value: 136, highlight: true }, { label: "Wan 3.0", value: 96 }]} note="Renoise estimate_cost 实测 · 2026-10" />
    <Tag n="GlassPanel" d="毛玻璃数据面板 · 条形和数字一起滚到终值" /></AbsoluteFill>
);
export const DemoOdometer: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0A0C" }}>
    <Odometer at={0.2} until={3.6} value="4833" unit="积分" label="账户余额" />
    <Sfx at={0.2} name="processing" vol={0.3} /><Sfx at={1.8} name="ding" vol={0.45} />
    <Tag n="Odometer" d="里程表逐位滚动，高位先停" /></AbsoluteFill>
);
export const DemoSourceDoc: React.FC = () => (
  <AbsoluteFill>
    <SourceDoc at={0} until={4} src="media/screen.png" iw={2880} ih={1800} zh="（示意）这里放官方原文对应的中文译句" source="示意截图" focusY={0.2} />
    <Sfx at={0.5} name="swish-1" vol={0.3} />
    <Tag n="SourceDoc" d="官方文档慢推 + 中文译句荧光底 + 来源角标" /></AbsoluteFill>
);

export const DemoTextBehind: React.FC = () => (
  <AbsoluteFill><HostH />
    <TextBehind src="media/host_h.mp4" cutout="media/host_h_cut.webm" at={0.3} until={2.3} lines={[{ t: "一张照片" }]} gradient={["#FFFFFF", "#B9C6DA"]} y={0.33} bgDim={0.15} />
    <TextBehind src="media/host_h.mp4" cutout="media/host_h_cut.webm" at={2.5} until={4.6} mode="count" lines={[{ t: "23", color: C.yellow, font: "en", size: 0.42 }]} count={{ to: 23, unit: "", dur: 0.9 }} y={0.3} bgDim={0.15} />
    <Sfx at={0.3} name="whoosh" vol={0.4} /><Sfx at={3.4} name="impact" vol={0.45} />
    <div style={{ position: "absolute", right: 70, top: 640, fontFamily: FONT.zh, fontWeight: 800, fontSize: 40, color: "#fff", opacity: 0 }} />
    <Tag n="TextBehind" d="景深字：文字 / 数字在人身后（Vision 抠像，透明 webm 叠回）" /></AbsoluteFill>
);

export const DEMOS: Array<[string, React.FC, number]> = [
  ["RetentionCaption", DemoRetention, 3.5], ["ZoomFocus", DemoZoomFocus, 4.2], ["HandDraw", DemoHandDraw, 3.2], ["FreezeFrame", DemoFreeze, 4], ["LowerThird", DemoLowerThird, 4],
  ["Counter", DemoCounter, 4], ["ChapterCard", DemoChapter, 3.6], ["SpecCard", DemoSpec, 4.2], ["Danmaku", DemoDanmaku, 4.5], ["ReactionPop", DemoReaction, 3.8],
  ["ProgressChapters", DemoProgress, 4], ["TeaserColdOpen", DemoTeaser, 3.6], ["CompareWipe", DemoCompare, 3.2], ["PaperCollage", DemoPaper, 3.6], ["Highlight", DemoHighlight, 3], ["MapRoute", DemoMap, 4.2],
  ["MemeWindow", DemoMeme, 4], ["ColdOpenFreeze", DemoColdFreeze, 4.2], ["EvidenceCard", DemoEvidence, 4], ["PollPop", DemoPoll, 3.6], ["GlitchInterstitial", DemoGlitch, 2.4],
  ["NamePlate", DemoNamePlate, 3.8], ["HostFloaters", DemoFloaters, 3.8], ["TiltAside", DemoAsideTilt, 4],
  ["DocFocus", DemoDocFocus, 3.6], ["TypedNameTag", DemoTypedName, 3.6], ["PunchInHost", DemoPunchIn, 3.6], ["RecapBoard", DemoRecap, 3.2], ["SearchTyping", DemoSearch, 3.6], ["CalloutLeader", DemoPillLeader, 3.6],
  ["Charts", DemoCharts, 4.6], ["SlamText", DemoSlam, 3], ["TornStrip", DemoTorn, 3.2], ["ArchiveCards", DemoArchive, 3.6],
  ["NumberSpike", DemoSpike, 3.6], ["ProgressTracker", DemoTracker, 4], ["WordStack", DemoWordStack, 2.8], ["ReviewCards", DemoReviews, 4],
  ["TextBehind", DemoTextBehind, 4.8], ["KeywordStack", DemoKeyword, 3.8], ["GlassPanel", DemoGlass, 3.6], ["Odometer", DemoOdometer, 3.2], ["SourceDoc", DemoSourceDoc, 3.6],
];
