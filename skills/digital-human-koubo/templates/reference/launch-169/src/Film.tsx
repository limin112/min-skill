// MemT 1.0 发布解读（16:9）：左侧整幅竖屏数字人，右侧内容区嵌入 memt-promo 的 MemT 场景（按口播卡点做时间重映射）。
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import tl from "./timeline.json";
import { Backdrop, C as K, CN, EN as REN, GradText, Mark, T, TE, Wd } from "./ref/memt/kit";
import { B2, B3, S1Paths, s1Cues, S2Launch, s2Cues, S34Window, s3Cues, s3KeyText } from "./ref/memt/scenesA";
import { S7Arch, s7Cues } from "./ref/memt/scenesB";
import { BURST, ParticleLayer, PARTICLE_START, S10Data, s10Cues, S11Quote, s11Cues, S12End, s12Cues } from "./ref/memt/scenesC";
import { keyCues, type Cue } from "./ref/cinematic/sfx";
import { BrandProvider, type CineBrand } from "./ref/cinematic/brand";

/* ---------- 基础 ---------- */
const FPS = 30;
const F = (s: number) => Math.round(s * FPS);
const C = tl.cues as Record<string, number>;
const CYAN = K.cyan, BLUE = K.blue, VIOLET = K.violet, INK = K.ink, MUTE = K.mute;
const ZH = CN;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const BRAND: CineBrand = { name: "MemT 1.0", display: '"SF Pro Display", "PingFang SC", sans-serif', body: '"PingFang SC", sans-serif', accent: BLUE, accent2: VIOLET, ink: "#03050D", paper: INK };
const fadeWin = (f: number, a: number, b: number, d = 6) => interpolate(f, [F(a), F(a) + d, F(b) - d, F(b)], [0, 1, 1, 0], clamp);
const segEnd = (i: number) => tl.segs[i].start + tl.segs[i].dur;
const HOST_IN = C.but;

/* ---------- 时间重映射：本片的秒 → 参考片的帧（分段线性，两端斜率 1） ---------- */
type Remap = { fwd: (f: number) => number; inv: (r: number) => number };
const remap = (pairs: Array<[number, number]>): Remap => {
  const P = pairs.map(([s, r]) => [s * FPS, r] as [number, number]);
  const lerp = (x: number, ix: 0 | 1) => {
    const jx = ix === 0 ? 1 : 0;
    if (x <= P[0][ix]) return P[0][jx] + (x - P[0][ix]);
    for (let i = 0; i < P.length - 1; i++) {
      if (x <= P[i + 1][ix]) return P[i][jx] + ((P[i + 1][jx] - P[i][jx]) * (x - P[i][ix])) / (P[i + 1][ix] - P[i][ix]);
    }
    const l = P[P.length - 1];
    return l[jx] + (x - l[ix]);
  };
  return { fwd: (f) => lerp(f, 0), inv: (r) => lerp(r, 1) };
};

const OPS = ["写入", "保持", "更新", "读取"].map((w) => Wd("b08", w));
const STATE = Wd("b08", "持续存在");
const EXT = Wd("b08", "不是外挂");
const CH1E = T("b08") - 4;
const B10 = T("b11") - 6;
const B11 = T("b13") - 6;
const LAND = BURST + 2;

const SCENES: Array<{ a: number; b: number; m: Remap; draw: (r: number) => React.ReactNode; cues: Cue[] }> = [
  { // 发布：日期 · logo · MemT 1.0 · 全球首个
    a: tl.segs[1].start - 0.05, b: C.pain + 0.1,
    m: remap([[tl.segs[1].start - 0.05, B2], [C.date, Wd("b03", "十月")], [C.memt, Wd("b03", "MemT")], [C.first, Wd("b03", "全球")], [C.pain, B3]]),
    draw: (r) => <S2Launch f={r} />, cues: s2Cues(),
  },
  { // 失忆聊天：讲了三遍 → 新对话碎裂 → 全忘了
    a: C.pain - 0.2, b: segEnd(1) + 0.05,
    m: remap([[C.pain, T("b04")], [C.r3, Wd("b04", "讲了")], [C.r3 + 0.35, Wd("b04", "三遍")], [C.newchat, Wd("b04", "新开")], [C.forgot, Wd("b04", "全忘")], [segEnd(1), TE("b04") + 6]]),
    draw: (r) => <S34Window f={r} />, cues: [...s3Cues(), ...keyCues(s3KeyText.text, s3KeyText.times, 0, 0.4, 3)],
  },
  { // 三条老路 → 第四条路：记忆
    a: tl.segs[2].start, b: C.mem3 + 0.35,
    m: remap([[tl.segs[2].start, T("b01")], [C.params, Wd("b01", "更多参数")], [C.data, Wd("b01", "更多数据")], [C.newway, Wd("b02", "第四条路")], [C.mem3, Wd("b02", "记忆")], [C.mem3 + 0.35, B2 - 2]]),
    draw: (r) => <S1Paths f={r} />, cues: s1Cues(),
  },
  { // Memory-Native MoE：写入 · 保持 · 更新 · 读取，外挂检索被划掉
    a: C.mem3 + 0.2, b: segEnd(2) + 0.05,
    m: remap([[C.mem3 + 0.2, STATE - 6], [C.write, OPS[0]], [(C.write + C.update) / 2, OPS[1]], [C.update, OPS[2]], [C.read, OPS[3]], [C.inside, EXT - 20], [segEnd(2) - 0.3, EXT + 34]]),
    draw: (r) => <S7Arch f={r} start={CH1E - 12} />, cues: s7Cues(),
  },
  { // Nano 36B / Flash 293B → >5% → 不是公开榜单
    a: tl.segs[3].start, b: C.p1 - 0.2,
    m: remap([[tl.segs[3].start, T("b11")], [C.nano, Wd("b11", "36B")], [C.flash, Wd("b11", "293B")], [C.gain, Wd("b11", "Coding")], [C.pct, Wd("b11", "百分之五")], [C.notpub, Wd("b12", "不是公开")], [C.p1 - 0.2, Wd("b12", "不是公开") + 26]]),
    draw: (r) => <S10Data f={r} start={B10} />, cues: s10Cues(),
  },
  { // 金句
    a: C.p1 - 0.25, b: C.bye + 0.55,
    m: remap([[C.p1 - 0.25, Wd("b13", "参数") - 8], [C.p1, Wd("b13", "参数")], [C.p2, Wd("b13", "记忆决定")], [C.bye + 0.4, BURST]]),
    draw: (r) => <S11Quote f={r} start={B11} />, cues: s11Cues(),
  },
  { // 片尾：logo · MemT 1.0 · Hugging Face
    a: C.bye + 0.3, b: tl.total + 1,
    m: remap([[C.bye + 0.4, BURST]]),
    draw: (r) => <S12End f={r} land={LAND} />, cues: s12Cues(LAND),
  },
];
// 粒子字按真实速度播放：参考片里它在「记忆决定」前 (Q3 - PARTICLE_START) 帧起步，这里同样提前这么多帧
const PARTICLE_AT = C.p2 - (Wd("b13", "记忆决定") - PARTICLE_START) / FPS;

/* ---------- 右侧内容区：参考场景（1920×1080）整体缩放放入 ---------- */
const PK = 0.68;
const PX = 612, PY = (1080 - 1080 * PK) / 2 - 34;
const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", left: PX, top: PY, width: 1920, height: 1080, transform: `scale(${PK})`, transformOrigin: "0 0" }}>{children}</div>
);

/* ---------- 主播：整幅竖屏，侧边 ---------- */
const SIDE = { x: 96, y: 56, w: 488, h: 964 };
const ZOOMS = [1.0, 1.04, 1.0, 1.04, 1.02]; // 跳切处交替轻推，盖住接缝
const Host: React.FC = () => {
  const f = useCurrentFrame();
  if (f < F(HOST_IN)) return null;
  const b = SIDE;
  const enter = spring({ frame: f - F(HOST_IN), fps: FPS, config: { damping: 14, stiffness: 200, mass: 0.6 } });
  const pulse = 0.5 + 0.5 * Math.sin(f / 18);
  const sc = b.w / 672;
  const last = tl.segs[tl.segs.length - 1];
  const endF = F(last.start + last.dur);
  return (
    <div style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, transform: `scale(${1.12 - 0.12 * enter})`, opacity: Math.min(1, enter * 2) }}>
      <div style={{ position: "absolute", inset: -3, borderRadius: 34, background: `linear-gradient(160deg, ${CYAN}, ${BLUE} 50%, ${VIOLET})`, boxShadow: `0 0 ${46 + 26 * pulse}px rgba(61,107,245,.45), 0 0 120px rgba(106,59,240,.25)` }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 31, overflow: "hidden", background: "#0B1020" }}>
        {tl.segs.map((s, i) => {
          const from = F(s.start), dur = F(s.dur);
          const local = f - from;
          const z = ZOOMS[i] * interpolate(local, [0, dur], [1, 1.02], clamp);
          return (
            <Sequence key={s.id} from={from} durationInFrames={dur} layout="none">
              <div style={{ position: "absolute", left: 0, top: 0, width: b.w, height: 1328 * sc, transform: `scale(${z})`, transformOrigin: "50% 40%" }}>
                <OffthreadVideo src={staticFile(s.src)} style={{ width: "100%", height: "100%" }} />
              </div>
              <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: interpolate(local, [0, 3], [i === 0 ? 0 : 0.3, 0], clamp) }} />
            </Sequence>
          );
        })}
        {f >= endF && (
          <div style={{ position: "absolute", left: 0, top: 0, width: b.w, height: 1328 * sc, transform: `scale(${1.02 * interpolate(f - endF, [0, 120], [1.02, 1.07], clamp)})`, transformOrigin: "50% 40%" }}>
            <Img src={staticFile("clips/c5_last.jpg")} style={{ width: "100%", height: "100%" }} />
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 78%, rgba(3,5,13,.6))" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: ZH, fontWeight: 600, fontSize: 24, color: INK, padding: "7px 18px", borderRadius: 999, background: "rgba(8,12,28,.82)", border: "1px solid rgba(39,185,243,.45)" }}>
            <Mark w={34} />
            <span style={{ fontFamily: REN, fontWeight: 800 }}><GradText>MemT 1.0</GradText></span> · 发布解读
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- 图标（快闪用） ---------- */
const Icon: React.FC<{ kind: "chat" | "image" | "video"; size?: number; color?: string }> = ({ kind, size = 84, color = CYAN }) => {
  const s = size;
  if (kind === "chat") return (
    <svg width={s} height={s} viewBox="0 0 64 64"><path d="M10 14h44a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H28l-12 10v-10h-6a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" /><circle cx={22} cy={30} r={3.4} fill={color} /><circle cx={32} cy={30} r={3.4} fill={color} /><circle cx={42} cy={30} r={3.4} fill={color} /></svg>
  );
  if (kind === "image") return (
    <svg width={s} height={s} viewBox="0 0 64 64"><rect x={8} y={12} width={48} height={40} rx={5} fill="none" stroke={color} strokeWidth={4} /><circle cx={23} cy={25} r={5} fill={color} /><path d="M12 48l14-14 10 10 6-6 12 12" fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" /></svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 64 64"><rect x={8} y={14} width={48} height={36} rx={6} fill="none" stroke={color} strokeWidth={4} /><path d="M27 23l14 9-14 9z" fill={color} /></svg>
  );
};

/* ---------- 开场快闪（全屏，主播还没出现） ---------- */
const FlashOpen: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const cut = (at: number) => f - F(at);
  const white = [C.llm, C.img, C.vid, C.but].reduce((m, at) => (cut(at) >= 0 ? Math.max(m, interpolate(cut(at), [0, 3], [0.85, 0], clamp)) : m), 0);
  const punch = (at: number) => interpolate(cut(at), [0, 7], [1.18, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  let body: React.ReactNode = null;
  if (t < C.llm) {
    const txt = "大家天天用的";
    const inv = f % 14 < 2 && f > 6;
    body = (
      <AbsoluteFill style={{ background: inv ? "#E8F1FF" : "#03050D", alignItems: "center", justifyContent: "center" }}>
        <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(61,107,245,.10) 0 2px, transparent 2px 6px)" }} />
        <div style={{ display: "flex" }}>
          {txt.split("").map((ch, i) => {
            const on = f - 3 - i * 4;
            const k = interpolate(on, [0, 5], [1.9, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            return <span key={i} style={{ fontFamily: ZH, fontWeight: 600, fontSize: 190, color: inv ? "#03050D" : "#fff", opacity: on >= 0 ? 1 : 0, display: "inline-block", transform: `scale(${k})`, textShadow: inv ? "none" : `-6px 0 rgba(39,185,243,.85), 6px 0 rgba(106,59,240,.85)` }}>{ch}</span>;
          })}
        </div>
        <div style={{ position: "absolute", bottom: 130, fontFamily: REN, fontWeight: 700, fontSize: 28, letterSpacing: 18, color: CYAN, opacity: Math.floor(f / 3) % 2 ? 0.9 : 0.4 }}>EVERY DAY · AI</div>
      </AbsoluteFill>
    );
  } else if (t < C.img) {
    body = (
      <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, #7DD3FC, ${CYAN} 45%, #0B5C8A)`, alignItems: "center", justifyContent: "center", transform: `scale(${punch(C.llm)})` }}>
        <div style={{ position: "absolute", fontFamily: REN, fontWeight: 900, fontSize: 560, color: "transparent", WebkitTextStroke: "3px rgba(255,255,255,.35)", letterSpacing: -10 }}>LLM</div>
        {[0, 1, 2].map((k) => {
          const y = 760 - ((cut(C.llm) * (9 + k * 3) + k * 220) % 900);
          return <div key={k} style={{ position: "absolute", left: 220 + k * 560, top: y, padding: "18px 30px", borderRadius: "26px 26px 26px 6px", background: "rgba(255,255,255,.9)", fontFamily: ZH, fontSize: 34, color: "#06304A" }}>{["帮我写个周报", "解释一下这段代码", "翻译成英文"][k]}</div>;
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <Icon kind="chat" size={200} color="#031A2B" />
          <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 200, color: "#031A2B" }}>大语言模型</div>
        </div>
      </AbsoluteFill>
    );
  } else if (t < C.vid) {
    body = (
      <AbsoluteFill style={{ background: `radial-gradient(circle at 70% 40%, #A78BFA, ${VIOLET} 50%, #2E1065)`, alignItems: "center", justifyContent: "center", transform: `scale(${punch(C.img)})` }}>
        <div style={{ position: "absolute", fontFamily: REN, fontWeight: 900, fontSize: 420, color: "transparent", WebkitTextStroke: "3px rgba(255,255,255,.3)" }}>IMAGE</div>
        <div style={{ position: "absolute", inset: 70, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 22, opacity: 0.55 }}>
          {Array.from({ length: 18 }).map((_, k) => (
            <div key={k} style={{ borderRadius: 18, opacity: cut(C.img) > k * 0.8 ? 1 : 0, background: `linear-gradient(${k * 47}deg, hsl(${(k * 53) % 360} 85% 70%), hsl(${(k * 53 + 120) % 360} 80% 45%))` }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40, padding: "30px 60px", borderRadius: 40, background: "rgba(20,8,60,.55)" }}>
          <Icon kind="image" size={190} color="#fff" />
          <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 200, color: "#fff" }}>图像模型</div>
        </div>
      </AbsoluteFill>
    );
  } else {
    const off = (cut(C.vid) * 38) % 360;
    body = (
      <AbsoluteFill style={{ background: "#EEF2FF", alignItems: "center", justifyContent: "center", transform: `scale(${punch(C.vid)})` }}>
        {[180, 900].map((top, r) => (
          <div key={r} style={{ position: "absolute", top, left: -360 + (r ? -off : off), display: "flex", gap: 24 }}>
            {Array.from({ length: 9 }).map((_, k) => (
              <div key={k} style={{ width: 300, height: 170, borderRadius: 14, border: "10px solid #03050D", background: `linear-gradient(${k * 40}deg, hsl(${200 + k * 18} 75% 58%), hsl(${255 + k * 10} 65% 38%))` }} />
            ))}
          </div>
        ))}
        <div style={{ position: "absolute", fontFamily: REN, fontWeight: 900, fontSize: 420, color: "transparent", WebkitTextStroke: "3px rgba(3,5,13,.18)" }}>VIDEO</div>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <Icon kind="video" size={200} color="#03050D" />
          <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 200, color: "#03050D" }}>视频模型</div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {body}
      <AbsoluteFill style={{ background: "#fff", opacity: white }} />
    </AbsoluteFill>
  );
};

/* ---------- 第 1 段后半：主播切入 →「下一个是？」→ 记忆模型 ---------- */
const NextIsMemory: React.FC = () => {
  const f = useCurrentFrame();
  const q = spring({ frame: f - F(C.but + 0.12), fps: FPS, config: { damping: 12, stiffness: 170 } });
  const slam = spring({ frame: f - F(C.mem), fps: FPS, config: { damping: 11, stiffness: 180, mass: 0.7 } });
  const flash = interpolate(f, [F(C.mem), F(C.mem) + 10], [0.9, 0], clamp);
  const qOut = interpolate(f, [F(C.mem) - 4, F(C.mem)], [1, 0], clamp);
  const chips = [{ k: "chat" as const, zh: "大语言模型" }, { k: "image" as const, zh: "图像模型" }, { k: "video" as const, zh: "视频模型" }];
  return (
    <AbsoluteFill style={{ left: 660, top: 90, width: 1200, height: 840 }}>
      <div style={{ position: "absolute", left: 110, top: 60, display: "flex", gap: 20, opacity: Math.min(1, q) * 0.75 }}>
        {chips.map((c) => (
          <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderRadius: 18, background: "rgba(255,255,255,.05)", border: "1px solid rgba(160,180,255,.16)" }}>
            <Icon kind={c.k} size={44} color={MUTE} />
            <span style={{ fontFamily: ZH, fontWeight: 600, fontSize: 30, color: MUTE }}>{c.zh}</span>
          </div>
        ))}
        <div style={{ padding: "14px 30px", borderRadius: 18, border: `2px dashed ${CYAN}`, fontFamily: REN, fontWeight: 900, fontSize: 32, color: CYAN }}>?</div>
      </div>
      <div style={{ position: "absolute", left: 110, top: 300, opacity: qOut }}>
        <div style={{ opacity: Math.min(1, q * 1.4), transform: `translateY(${(1 - q) * 40}px)`, fontFamily: ZH, fontWeight: 800, fontSize: 124, color: "#fff" }}>
          下一个是<span style={{ color: CYAN, textShadow: `0 0 30px ${CYAN}`, opacity: f % 20 < 12 ? 1 : 0.35 }}>？</span>
        </div>
      </div>
      {f >= F(C.mem) && (
        <div style={{
          position: "absolute", left: 110, top: 250, width: 980, height: 430, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 54,
          background: "linear-gradient(150deg, rgba(39,185,243,.16), rgba(61,107,245,.18) 50%, rgba(106,59,240,.22))", border: "1.5px solid rgba(39,185,243,.6)",
          boxShadow: "0 0 80px rgba(61,107,245,.45)", transform: `scale(${1.5 - 0.5 * slam})`, opacity: Math.min(1, slam * 2), filter: slam < 0.6 ? `blur(${(0.6 - slam) * 18}px)` : undefined,
        }}>
          <Mark w={250} />
          <div>
            <div style={{ fontFamily: ZH, fontWeight: 800, fontSize: 138, lineHeight: 1.1 }}><GradText>记忆模型</GradText></div>
            <div style={{ fontFamily: REN, fontWeight: 700, fontSize: 30, color: CYAN, letterSpacing: 14, marginTop: 8 }}>MEMORY MODEL</div>
          </div>
          <div style={{ position: "absolute", inset: 0, borderRadius: 30, background: "#fff", opacity: flash }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ---------- 字幕：放在右侧内容区下方 ---------- */
const HL = ["记忆模型", "MemT 1.0", "MemT", "全球首个", "记忆原生", "全忘了", "堆参数", "堆数据", "写入", "更新", "读取", "36B", "293B", "5%", "内部测试", "起点", "能长多高"];
const Subs: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const cur = tl.subs.find((s) => t >= s.start && t < s.end);
  if (!cur || t < HOST_IN) return null;
  const k = interpolate(f, [F(cur.start), F(cur.start) + 4], [0.92, 1], clamp);
  const parts: Array<{ s: string; hl: boolean }> = [];
  let rest = cur.text;
  while (rest.length) {
    let best = -1, word = "";
    for (const h of HL) { const i = rest.indexOf(h); if (i >= 0 && (best < 0 || i < best || (i === best && h.length > word.length))) { best = i; word = h; } }
    if (best < 0) { parts.push({ s: rest, hl: false }); break; }
    if (best > 0) parts.push({ s: rest.slice(0, best), hl: false });
    parts.push({ s: word, hl: true }); rest = rest.slice(best + word.length);
  }
  return (
    <div style={{ position: "absolute", left: SIDE.x + SIDE.w, right: 0, bottom: 56, display: "flex", justifyContent: "center", transform: `scale(${k})` }}>
      <div style={{ fontFamily: ZH, fontWeight: 600, fontSize: 50, color: "#fff", padding: "6px 26px", borderRadius: 14, background: "rgba(3,5,13,.55)", textShadow: "0 0 3px #000, 0 2px 4px #000, 2px 0 3px #000, -2px 0 3px #000" }}>
        {parts.map((p, i) => <span key={i} style={{ color: p.hl ? "#7DD3FC" : "#fff" }}>{p.s}</span>)}
      </div>
    </div>
  );
};

/* ---------- 声音：开场自己的 + 参考场景的音效点（按映射换算到本片时间） ---------- */
const OWN: Cue[] = [
  { at: 0, name: "impact", volume: 0.55 }, { at: F(0.47), name: "tap", volume: 0.35 }, { at: F(0.94), name: "tap", volume: 0.35 },
  { at: F(C.llm) - 1, name: "slam-1", volume: 0.55 }, { at: F(C.img) - 1, name: "slam-2", volume: 0.55 }, { at: F(C.vid) - 1, name: "slam-1", volume: 0.55 },
  { at: F(C.but) - 2, name: "whoosh", volume: 0.45 }, { at: F(C.but + 0.15), name: "pop", volume: 0.4 }, { at: F(C.mem - 1.0), name: "riser", volume: 0.25 }, { at: F(C.mem) - 1, name: "slam-2", volume: 0.65 },
];
const ALL_CUES: Cue[] = [
  ...OWN,
  ...SCENES.flatMap((s) =>
    s.cues
      .map((c) => ({ ...c, at: Math.round(s.m.inv(c.at)) }))
      .filter((c) => c.at >= F(s.a) && c.at < F(s.b))
      .map((c) => ({ ...c, volume: (c.volume ?? 0.6) * 0.8 })),
  ),
];

/* ---------- 镜头冲击（快闪三刀 + 记忆模型 + 全忘了） ---------- */
const hit = (f: number) => {
  let dx = 0, dy = 0;
  for (const at of [C.llm, C.img, C.vid, C.mem, C.forgot]) {
    const d = f - F(at);
    if (d >= 0 && d < 8) { const a = (1 - d / 8) * 9; dx += Math.sin(d * 3.1) * a; dy += Math.cos(d * 2.3) * a * 0.6; }
  }
  return `translate(${dx}px, ${dy}px)`;
};

export const Film: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pStart = F(PARTICLE_AT);
  return (
    <BrandProvider brand={BRAND}>
      <AbsoluteFill style={{ background: "#03050D" }}>
        <AbsoluteFill style={{ transform: hit(f) }}>
          <Backdrop f={f} glow={1.15} gx={1260} gy={500} />
          {SCENES.map((s, i) =>
            f >= F(s.a) && f < F(s.b) ? (
              <AbsoluteFill key={i} style={{ opacity: fadeWin(f, s.a, s.b) }}>
                <Panel>{s.draw(s.m.fwd(f))}</Panel>
              </AbsoluteFill>
            ) : null,
          )}
          <Sequence from={pStart} durationInFrames={BURST - PARTICLE_START + 20} layout="none">
            <Panel><ParticleLayer /></Panel>
          </Sequence>
          {f >= F(HOST_IN) && f < F(segEnd(0)) && <AbsoluteFill style={{ opacity: fadeWin(f, HOST_IN, segEnd(0), 1) }}><NextIsMemory /></AbsoluteFill>}
          <Host />
          <Subs />
          {f < F(HOST_IN) && <FlashOpen />}
        </AbsoluteFill>
        <Audio src={staticFile("music/bgm.mp3")} volume={(fr) => interpolate(fr, [0, 2, F(HOST_IN) - 2, F(HOST_IN) + 10, durationInFrames - 45, durationInFrames - 1], [0, 0.2, 0.2, 0.1, 0.1, 0], clamp)} />
        {ALL_CUES.map((c, i) => (
          <Sequence key={i} from={Math.max(0, c.at)} durationInFrames={F(3)} layout="none">
            <Audio src={staticFile(`sfx/${c.name}.wav`)} volume={c.volume ?? 0.6} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </BrandProvider>
  );
};
