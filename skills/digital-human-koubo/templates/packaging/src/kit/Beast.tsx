// 英文顶流节奏派（MrBeast / Mark Rober / Ryan Trahan 实测，见 packaging-research/reports/1）：
// 数字钉子（大数字从超大尺寸 0.5 秒缩到顶部 + 同色闪光）、常驻进度追踪（路线条 / 步骤徽章 / 角标胶囊）、逐词堆叠大字、证据 / 评论卡连弹。
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { C, F, FONT, clamp, ease, lerp, sp, stroke, useT } from "./core";

/** 数字钉子：大数字 / 价格从 3 倍画面大小 0.5 秒缩到顶部（约 13% 画面高），全屏闪同色光；之后可缩成左上角常驻胶囊（pinAt）。 */
export const NumberSpike: React.FC<{ at: number; until: number; text: string; color?: string; pinAt?: number; label?: string; y?: number; size?: number }> = ({ at, until, text, color = C.green, pinAt, label, y: yf, size: sf }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const k = lerp(f, at, at + 0.5, 0, 1, ease.expo);
  const flash = interpolate(f, [F(at) + 10, F(at) + 13, F(at) + 22], [0, 0.45, 0], clamp);
  const pin = pinAt !== undefined ? lerp(f, pinAt, pinAt + 0.45, 0, 1, ease.inOut) : 0;
  const base = sf ?? (W > H ? 0.13 : 0.075), y0 = yf ?? (W > H ? 0.13 : 0.3);   // 竖屏：字小一点、落在头顶下方，别压顶部标题
  const size = H * base * (3 - 2 * k) * (1 - 0.62 * pin);
  const x = W / 2 + (W * 0.03 + 160 - W / 2) * pin, y = H * y0 + (H * 0.07 - H * y0) * pin;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: color, opacity: flash, mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", opacity: Math.min(1, k * 3), textAlign: "center" }}>
        <div style={{ display: "inline-block", fontFamily: FONT.en, fontWeight: 900, fontSize: size, color, letterSpacing: -2, whiteSpace: "nowrap", padding: pin > 0.5 ? "4px 22px" : 0, borderRadius: 999,
          background: pin > 0.5 ? "rgba(10,10,12,.82)" : "transparent", textShadow: pin > 0.5 ? "none" : `${stroke(size * 0.05, "#000")}, 0 ${size * 0.06}px 0 #000` }}>{text}</div>
        {label && pin < 0.5 && <div style={{ fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.045, color: "#fff", textShadow: stroke(4, "#000"), opacity: sp(f, at + 0.4) }}>{label}</div>}
      </div>
    </AbsoluteFill>
  );
};

/** 进度追踪：路线条（起点 —— 终点，小图标沿线走到 progress）或步骤徽章（1–N，当前步高亮），常驻底部 / 角落。 */
export const ProgressTracker: React.FC<{ at: number; until: number; mode?: "route" | "steps"; from?: string; to?: string; progress?: Array<{ at: number; v: number }>; steps?: string[]; stepAt?: number[]; icon?: string; y?: number }> = ({ at, until, mode = "route", from = "起点", to = "终点", progress = [], steps = [], stepAt = [], icon = "🚌", y }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > until) return null;
  const o = lerp(f, at, at + 0.3, 0, 1) * (1 - lerp(f, until - 0.3, until, 0, 1));
  const top = y ?? H * 0.88;
  if (mode === "steps") {
    const cur = stepAt.filter((s) => t >= s).length - 1;
    return (
      <div style={{ position: "absolute", left: 0, right: 0, top: y ?? H * 0.05, display: "flex", justifyContent: "center", gap: 14, opacity: o }}>
        {steps.map((s, k) => {
          const on = k === cur, done = k < cur;
          return <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: on ? C.yellow : done ? "rgba(43,214,123,.9)" : "rgba(10,10,12,.7)", transform: `scale(${on ? 1 + 0.08 * sp(f, stepAt[k] ?? 0, 9, 260) : 1})` }}>
            <span style={{ fontFamily: FONT.en, fontWeight: 900, fontSize: H * 0.03, color: on ? C.ink : "#fff" }}>{done ? "✓" : k + 1}</span>
            <span style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.026, color: on ? C.ink : "#fff" }}>{s}</span>
          </div>;
        })}
      </div>
    );
  }
  // 进度：每个关键点用 0.8 秒缓动到新值
  let v = 0;
  const i = progress.filter((p) => t >= p.at).length - 1;
  if (i >= 0) v = interpolate(t, [progress[i].at, progress[i].at + 0.8], [i ? progress[i - 1].v : 0, progress[i].v], { ...clamp, easing: ease.inOut });
  const L = W * 0.2, R = W * 0.8;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: top, opacity: o }}>
      <div style={{ position: "absolute", left: L - 130, top: -22, fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.035, color: "#fff", textShadow: stroke(4, "#000") }}>{from}</div>
      <div style={{ position: "absolute", left: R + 20, top: -22, fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.035, color: "#fff", textShadow: stroke(4, "#000") }}>{to}</div>
      <div style={{ position: "absolute", left: L, width: R - L, height: 12, borderRadius: 6, background: "rgba(0,0,0,.55)", border: "3px solid #fff" }}>
        <div style={{ width: `${v * 100}%`, height: "100%", borderRadius: 6, background: C.yellow }} />
      </div>
      <div style={{ position: "absolute", left: L + (R - L) * v - 34, top: -70, fontSize: 64 }}>{icon}</div>
    </div>
  );
};

/** 逐词堆叠：全屏一个词一拍叠上去（0.3–0.5 秒一拍，跟鼓点），最后一个词换色放大。 */
export const WordStack: React.FC<{ words: Array<{ t: string; at: number }>; until: number; bg?: string; lastColor?: string }> = ({ words, until, bg = "#0B0B0E", lastColor = C.green }) => {
  const { f, t, H } = useT();
  if (t < words[0].at || t > until) return null;
  return (
    <AbsoluteFill style={{ background: bg, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: H * 0.01 }}>
      {words.map((w, k) => {
        if (t < w.at) return null;
        const last = k === words.length - 1;
        const p = interpolate(f - F(w.at), [0, 3, 7], [1.5, 0.95, 1], clamp);
        return <div key={k} style={{ fontFamily: /[一-鿿]/.test(w.t) ? FONT.zh : FONT.en, fontWeight: 900, fontSize: H * (last ? 0.2 : 0.13), lineHeight: 1, color: last ? lastColor : "#fff", textTransform: "uppercase", transform: `scale(${p})`, letterSpacing: -2 }}>{w.t}</div>;
      })}
    </AbsoluteFill>
  );
};

/** 证据 / 评论卡连弹：白色圆角卡（头像 + 星级 + 两行字），每 1.1 秒换一张，轻微倾斜错位叠放。 */
export const ReviewCards: React.FC<{ at: number; cards: Array<{ name: string; stars?: number; text: string; avatar?: string }>; per?: number; hold?: number }> = ({ at, cards, per = 1.1, hold = 1.5 }) => {
  const { f, t, W, H } = useT();
  if (t < at || t > at + cards.length * per + hold) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {cards.map((c, k) => {
        const a = at + k * per; if (t < a) return null;
        const p = sp(f, a, 12, 230);
        const rot = (k % 2 ? 3 : -3) + k * 0.5;
        return (
          <div key={k} style={{ position: "absolute", left: W / 2 - W * 0.22 + (k % 2 ? 60 : -60), top: H * 0.1 + k * H * 0.2, width: W * 0.44, padding: H * 0.025, borderRadius: 22, background: "#fff", boxShadow: "0 24px 60px rgba(0,0,0,.4)",
            transform: `rotate(${rot}deg) scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.5) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {c.avatar ? <Img src={staticFile(c.avatar)} style={{ width: H * 0.06, height: H * 0.06, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: H * 0.06, height: H * 0.06, borderRadius: "50%", background: ["#F59E0B", "#3B82F6", "#10B981", "#EC4899"][k % 4], display: "grid", placeItems: "center", fontFamily: FONT.zh, fontWeight: 900, fontSize: H * 0.028, color: "#fff" }}>{c.name.slice(0, 1)}</div>}
              <div>
                <div style={{ fontFamily: FONT.zh, fontWeight: 800, fontSize: H * 0.026, color: "#111" }}>{c.name}</div>
                <div style={{ fontSize: H * 0.024, color: "#F5A623", letterSpacing: 2 }}>{"★".repeat(c.stars ?? 5)}<span style={{ color: "#DDD" }}>{"★".repeat(5 - (c.stars ?? 5))}</span></div>
              </div>
            </div>
            <div style={{ fontFamily: FONT.zh, fontWeight: 600, fontSize: H * 0.03, color: "#222", marginTop: 12, lineHeight: 1.4 }}>{c.text}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
