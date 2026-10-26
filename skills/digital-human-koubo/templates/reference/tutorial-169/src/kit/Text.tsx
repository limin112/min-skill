// 文字类：留存大字幕（逐词砸出）、人名条、出处角标、数字滚动 / 赌注计数、倒计时、章节卡、参数卡。
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";

/** 留存大字幕：一次 1–3 个词居中砸出，关键词换色放大，轻微上下弹。words = [{t, at, key?}] */
export const RetentionCaption: React.FC<{ words: Array<{ t: string; at: number; key?: boolean }>; y?: number; size?: number; color?: string; keyColor?: string; group?: number }> = ({ words, y = 760, size = 96, color = "#fff", keyColor = C.yellow, group = 2 }) => {
  const { f, t } = useT();
  // 找当前组：按 group 个词一组，组的结束 = 下一组开始
  const groups: Array<typeof words> = [];
  for (let i = 0; i < words.length; i += group) groups.push(words.slice(i, i + group));
  const gi = groups.findIndex((g, k) => t >= g[0].at - 0.03 && (k + 1 >= groups.length || t < groups[k + 1][0].at - 0.03));
  if (gi < 0) return null;
  const g = groups[gi];
  const last = g[g.length - 1];
  if (gi === groups.length - 1 && t > last.at + 1.2) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", gap: size * 0.28, flexWrap: "wrap", padding: "0 60px" }}>
      {g.map((w, k) => {
        const on = f >= F(w.at);
        const p = sp(f, w.at, 9, 320, 0.45);
        return (
          <span key={k} style={{ fontFamily: /[一-鿿]/.test(w.t) ? FONT.zh : FONT.en, fontWeight: 900, fontSize: w.key ? size * 1.18 : size, color: w.key ? keyColor : color, textTransform: /[a-z]/i.test(w.t) ? "uppercase" : "none",
            letterSpacing: /[a-z]/i.test(w.t) ? -1 : 0, opacity: on ? 1 : 0, transform: `translateY(${(1 - p) * 30}px) scale(${on ? 0.7 + 0.3 * p + (w.key ? 0.08 * Math.max(0, 1 - (f - F(w.at)) / 8) : 0) : 0.7}) rotate(${w.key ? -2 : 0}deg)`,
            textShadow: `${stroke(size * 0.07, C.ink)}, 0 ${size * 0.08}px 0 ${C.ink}` }}>{w.t}</span>
        );
      })}
    </div>
  );
};

/** 人名条 / 身份条：左下角，色块先滑出、文字跟着进。 */
export const LowerThird: React.FC<{ at: number; until: number; name: string; title?: string; color?: string; x?: number; y?: number }> = ({ at, until, name, title, color = C.orange, x = 90, y = 820 }) => {
  const { f } = useT();
  if (f < F(at) || f > F(until)) return null;
  const pin = lerp(f, at, at + 0.4, 0, 1, ease.out), pout = lerp(f, until - 0.3, until, 0, 1, ease.inOut);
  const k = pin * (1 - pout);
  const tp = lerp(f, at + 0.15, at + 0.55, 0, 1, ease.out) * (1 - pout);
  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      <div style={{ width: 10, height: title ? 112 : 70, background: color, position: "absolute", left: 0, top: 0, transform: `scaleY(${k})`, transformOrigin: "50% 0" }} />
      <div style={{ marginLeft: 28, overflow: "hidden" }}>
        <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: 50, color: "#fff", background: "rgba(16,16,20,.82)", padding: "4px 18px", transform: `translateX(${(1 - tp) * -110}%)`, display: "inline-block" }}>{name}</div>
      </div>
      {title && <div style={{ marginLeft: 28, overflow: "hidden", marginTop: 4 }}>
        <div style={{ fontFamily: FONT.zh, fontWeight: 600, fontSize: 30, color: C.ink, background: color, padding: "4px 18px", display: "inline-block", transform: `translateX(${(1 - lerp(f, at + 0.25, at + 0.65, 0, 1) * (1 - pout)) * -110}%)` }}>{title}</div>
      </div>}
    </div>
  );
};

/** 出处角标：「来源：xxx · 2026-10」小字，右下 / 左下，淡入。说法有出处时一定挂。 */
export const SourceTag: React.FC<{ at: number; until: number; text: string; side?: "l" | "r"; y?: number; dark?: boolean }> = ({ at, until, text, side = "r", y = 1010, dark }) => {
  const { f } = useT();
  const o = interpolate(f, [F(at), F(at) + 8, F(until) - 8, F(until)], [0, 1, 1, 0], clamp);
  return <div style={{ position: "absolute", [side === "r" ? "right" : "left"]: 40, top: y, opacity: o, fontFamily: FONT.zh, fontSize: 22, color: dark ? "rgba(20,20,20,.7)" : "rgba(255,255,255,.85)", background: dark ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.45)", padding: "4px 12px", borderRadius: 6 }}>{text}</div>;
};

/** 数字滚动 / 赌注计数：大数字从 from 滚到 to，到达时弹一下；money=true 用 $ 和千分位。 */
export const Counter: React.FC<{ at: number; dur?: number; from?: number; to: number; prefix?: string; unit?: string; label?: string; x?: number; y?: number; size?: number; color?: string; align?: "center" | "left" }> = ({ at, dur = 1.1, from = 0, to, prefix = "", unit = "", label, x = 0, y = 380, size = 200, color = C.green, align = "center" }) => {
  const { f } = useT();
  if (f < F(at) - 2) return null;
  const v = f >= F(at + dur) ? to : lerp(f, at, at + dur, from, to, ease.expo);   // 落地必须是精确值
  const land = sp(f, at + dur, 7, 300, 0.5);
  const sc = f >= F(at + dur) ? 1 + 0.12 * (1 - land) : 1;
  return (
    <div style={{ position: "absolute", left: x, right: align === "center" ? 0 : undefined, top: y, textAlign: align, opacity: sp(f, at - 0.05, 14, 220) }}>
      {label && <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: size * 0.26, color: "#fff", textShadow: stroke(5, C.ink), marginBottom: 6 }}>{label}</div>}
      <div style={{ display: "inline-block", transform: `scale(${sc})`, fontFamily: FONT.en, fontWeight: 900, fontSize: size, color, letterSpacing: -4, textShadow: `${stroke(size * 0.045, C.ink)}, 0 ${size * 0.05}px 0 ${C.ink}`, fontVariantNumeric: "tabular-nums" }}>
        {prefix}{Math.round(v).toLocaleString("en-US")}<span style={{ fontFamily: FONT.zh, fontSize: size * 0.42, marginLeft: 8 }}>{unit}</span>
      </div>
    </div>
  );
};

/** 倒计时 / 计时器：右上角药丸，最后 3 秒变红并跳动。 */
export const Countdown: React.FC<{ at: number; seconds: number; label?: string; x?: number; y?: number }> = ({ at, seconds, label = "剩余", x = 1560, y = 60 }) => {
  const { f, t } = useT();
  if (t < at || t > at + seconds + 0.6) return null;
  const left = Math.max(0, seconds - (t - at));
  const urgent = left <= 3;
  const beat = urgent ? 1 + 0.08 * Math.max(0, Math.cos(((t - at) % 1) * Math.PI * 2)) : 1;
  const mm = Math.floor(left / 60), ss = Math.floor(left % 60), cs = Math.floor((left % 1) * 10);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${beat * sp(f, at, 12, 220)})`, display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderRadius: 999, background: urgent ? C.red : "rgba(16,16,20,.85)", border: "3px solid rgba(255,255,255,.25)" }}>
      <span style={{ fontFamily: FONT.zh, fontWeight: 700, fontSize: 28, color: "rgba(255,255,255,.8)" }}>{label}</span>
      <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 48, color: "#fff" }}>{mm}:{String(ss).padStart(2, "0")}.{cs}</span>
    </div>
  );
};

/** 章节卡：大号序号 + 标题，左侧色条扫入，0.9–1.4 秒内完成，背景可透明叠在画面上。 */
export const ChapterCard: React.FC<{ at: number; until: number; n: string; title: string; sub?: string; color?: string; solid?: boolean }> = ({ at, until, n, title, sub, color = C.orange, solid = true }) => {
  const { f } = useT();
  if (f < F(at) || f > F(until)) return null;
  const sweep = lerp(f, at, at + 0.35, 0, 1, ease.inOut), out = lerp(f, until - 0.3, until, 0, 1, ease.inOut);
  const tp = sp(f, at + 0.2, 13, 180);
  return (
    <AbsoluteFill style={{ background: solid ? C.ink : "transparent", opacity: 1 - out }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${sweep * 100}%`, background: color, transform: `translateX(${lerp(f, at + 0.35, at + 0.7, 0, 100, ease.inOut)}%)` }} />
      <div style={{ position: "absolute", left: 160, top: 360, opacity: Math.min(1, tp * 1.4), transform: `translateY(${(1 - tp) * 40}px)` }}>
        <div style={{ fontFamily: FONT.en, fontWeight: 900, fontSize: 150, color, lineHeight: 1 }}>{n}</div>
        <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: 110, color: "#fff", marginTop: 10 }}>{title}</div>
        {sub && <div style={{ fontFamily: FONT.zh, fontSize: 40, color: "rgba(255,255,255,.65)", marginTop: 16 }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
};

/** 参数卡（质感派）：大数字 + 小单位 + 细标签，逐行淡入、左对齐、留白多，叠在产品画面旁。 */
export const SpecCard: React.FC<{ at: number; until: number; rows: Array<{ k: string; v: string; u?: string; at?: number }>; x?: number; y?: number; dark?: boolean; accent?: string }> = ({ at, until, rows, x = 1180, y = 300, dark = true, accent = C.orange }) => {
  const { f } = useT();
  if (f < F(at) || f > F(until)) return null;
  const out = lerp(f, until - 0.35, until, 0, 1, ease.inOut);
  const fg = dark ? "#fff" : C.ink, sub = dark ? "rgba(255,255,255,.55)" : "rgba(20,20,20,.5)";
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: 1 - out }}>
      {rows.map((r, k) => {
        const a = r.at ?? at + k * 0.35; const p = lerp(f, a, a + 0.5, 0, 1, ease.out);
        return (
          <div key={k} style={{ marginBottom: 46, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <div style={{ fontFamily: FONT.zh, fontWeight: 500, fontSize: 26, color: sub, letterSpacing: 2 }}>{r.k}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: FONT.en, fontWeight: 700, fontSize: 104, color: fg, letterSpacing: -3, fontVariantNumeric: "tabular-nums" }}>{r.v}</span>
              {r.u && <span style={{ fontFamily: FONT.zh, fontWeight: 600, fontSize: 36, color: accent }}>{r.u}</span>}
            </div>
            <div style={{ height: 2, width: lerp(f, a + 0.1, a + 0.7, 0, 420, ease.out), background: dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.12)" }} />
          </div>
        );
      })}
    </div>
  );
};
