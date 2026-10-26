import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { V } from "./brand";
import { keyCues, type Cue } from "./sfx";
import { E, clamp01, mix, seg, track, typed, typingSchedule } from "./motion";

export type ReportSection = {
  heading: string;
  paragraphs?: string[];
  chart?: { title: string; labels: string[]; values: number[]; unit?: string };
  table?: { head: string[]; rows: string[][] };
  insight?: string;
};
export type ReportProps = {
  title: string;
  kicker?: string;
  meta?: string;
  sections: ReportSection[];
};

const PAGE_W = 1000;
const PAD = 90;
const INNER = PAGE_W - PAD * 2;
const BODY = 23;
const PER_CHAR = 0.7;

const isCJK = (s: string) => /[\u3000-\u9fff\uff00-\uffef]/.test(s);
const lineCount = (text: string, size: number, width: number) =>
  Math.max(1, Math.ceil((Array.from(text).length * size * (isCJK(text) ? 1.02 : 0.5)) / width));

type Block =
  | { kind: "title"; y: number; h: number; at: number; dur: number; text: string; times: number[] }
  | { kind: "meta"; y: number; h: number; at: number; dur: number; text: string }
  | { kind: "heading"; y: number; h: number; at: number; dur: number; text: string; times: number[]; n: number }
  | { kind: "para"; y: number; h: number; at: number; dur: number; text: string; lines: number; cite: number }
  | { kind: "chart"; y: number; h: number; at: number; dur: number; chart: NonNullable<ReportSection["chart"]> }
  | { kind: "table"; y: number; h: number; at: number; dur: number; table: NonNullable<ReportSection["table"]> }
  | { kind: "insight"; y: number; h: number; at: number; dur: number; text: string };

/** Layout and timing are computed together so the camera can follow the writing head. */
export const reportTimeline = ({ title, meta, sections }: ReportProps, start = 24) => {
  const blocks: Block[] = [];
  let y = 150;
  let at = start;
  const push = (b: Block, gap: number) => {
    blocks.push(b);
    y += b.h + gap;
    at += b.dur;
  };
  const tt = typingSchedule(title, 0, PER_CHAR, (i) => random(`rt-${i}`));
  const titleLines = lineCount(title, 60, INNER);
  push({ kind: "title", y, h: titleLines * 70, at, dur: tt.end + 4, text: title, times: tt.times }, 18);
  if (meta) push({ kind: "meta", y, h: 30, at, dur: 8, text: meta }, 40);
  let cite = 1;
  sections.forEach((s, n) => {
    const ht = typingSchedule(s.heading, 0, PER_CHAR, (i) => random(`rh-${n}-${i}`));
    push({ kind: "heading", y, h: 44, at, dur: ht.end + 3, text: s.heading, times: ht.times, n: n + 1 }, 18);
    (s.paragraphs ?? []).forEach((p) => {
      const lines = lineCount(p, BODY, INNER);
      push({ kind: "para", y, h: lines * BODY * 1.6, at, dur: 6 + lines * 4, text: p, lines, cite: cite++ }, 20);
    });
    if (s.chart) push({ kind: "chart", y, h: 330, at, dur: 30, chart: s.chart }, 30);
    if (s.table) push({ kind: "table", y, h: 56 * (s.table.rows.length + 1), at, dur: 8 + s.table.rows.length * 6, table: s.table }, 30);
    if (s.insight) push({ kind: "insight", y, h: 40 + lineCount(s.insight, 26, INNER - 60) * 40, at, dur: 20, text: s.insight }, 30);
    y += 20;
  });
  const pageH = Math.max(1414, y + 80);
  return { blocks, pageH, writeEnd: at, total: Math.ceil(at + 50) };
};

/** Frames needed for a report; the last ~50 frames pull back to the finished stack. */
export const reportFrames = (p: ReportProps) => reportTimeline(p).total;

export const reportCues = (p: ReportProps, offset: number): Cue[] => {
  const { blocks, writeEnd } = reportTimeline(p);
  const cues: Cue[] = [{ at: offset + 2, name: "swish-1", volume: 0.4 }];
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "heading") cues.push(...keyCues(b.text, b.times, offset + b.at, 0.4));
    if (b.kind === "para") cues.push({ at: offset + b.at + b.dur - 2, name: "tap", volume: 0.3 });
    if (b.kind === "chart") cues.push({ at: offset + b.at + 4, name: "swish-3", volume: 0.35 });
    if (b.kind === "table") b.table.rows.forEach((_, r) => cues.push({ at: offset + b.at + 8 + r * 6, name: "tap", volume: 0.25 }));
    if (b.kind === "insight") cues.push({ at: offset + b.at + 4, name: "pop", volume: 0.5 });
  }
  cues.push({ at: offset + writeEnd + 6, name: "page-2", volume: 0.6 }, { at: offset + writeEnd + 24, name: "done", volume: 0.5 });
  return cues;
};

const Caret: React.FC<{ f: number; color?: string }> = ({ f, color = V.accent }) => (
  <span style={{ display: "inline-block", width: 3, height: "0.9em", marginLeft: 3, background: color, verticalAlign: "-0.1em", opacity: Math.floor(f / 8) % 2 ? 0.25 : 1 }} />
);

const BlockView: React.FC<{ b: Block; f: number; active: boolean }> = ({ b, f, active }) => {
  const local = f - b.at;
  const p = seg(local, 0, b.dur, E.out);
  if (local < 0) return null;
  const box: React.CSSProperties = { position: "absolute", left: PAD, top: b.y, width: INNER, height: b.h };
  switch (b.kind) {
    case "title":
      return (
        <div style={{ ...box, fontFamily: V.display, fontWeight: 500, fontSize: 60, lineHeight: "70px", letterSpacing: "-0.02em", color: "#141414" }}>
          {typed(b.text, b.times, local)}
          {active && <Caret f={f} />}
        </div>
      );
    case "meta":
      return <div style={{ ...box, fontFamily: V.body, fontSize: 20, color: "rgba(0,0,0,0.5)", opacity: p }}>{b.text}</div>;
    case "heading":
      return (
        <div style={{ ...box, display: "flex", gap: 16, alignItems: "baseline", fontFamily: V.display, fontWeight: 500, fontSize: 34, color: "#141414" }}>
          <span style={{ fontFamily: V.body, fontSize: 18, color: V.accent, letterSpacing: "0.1em" }}>{String(b.n).padStart(2, "0")}</span>
          <span>
            {typed(b.text, b.times, local)}
            {active && <Caret f={f} />}
          </span>
        </div>
      );
    case "para": {
      const lineH = BODY * 1.6;
      const shown = clamp01(local / b.dur) * b.lines;
      const full = Math.floor(shown);
      return (
        <div style={{ ...box, fontFamily: V.body, fontSize: BODY, lineHeight: 1.6, color: "#2A2A2A" }}>
          <div style={{ clipPath: `inset(0 0 ${Math.max(0, b.h - full * lineH)}px 0)` }}>
            {b.text}
            <sup
              style={{
                display: "inline-block",
                marginLeft: 4,
                fontSize: 14,
                color: V.accent,
                transform: `scale(${mix(0, 1, seg(local, b.dur - 4, 8, E.back))})`,
              }}
            >
              [{b.cite}]
            </sup>
          </div>
          {full < b.lines && (
            <div style={{ position: "absolute", left: 0, top: full * lineH + 6, height: BODY, width: `${mix(10, full === b.lines - 1 ? 55 : 100, shown - full)}%`, borderRadius: 6, background: "rgba(0,0,0,0.07)" }} />
          )}
        </div>
      );
    }
    case "chart": {
      const max = Math.max(...b.chart.values);
      return (
        <div style={{ ...box, borderRadius: 16, background: "#F6F5F2", padding: "24px 28px", boxSizing: "border-box", opacity: seg(local, 0, 6) }}>
          <div style={{ fontFamily: V.body, fontSize: 18, fontWeight: 600, color: "#141414" }}>{b.chart.title}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22, height: 220, marginTop: 20 }}>
            {b.chart.values.map((v, k) => {
              const g = seg(local, 4 + k * 3, 18, E.out);
              const last = k === b.chart.values.length - 1;
              return (
                <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{ fontFamily: V.body, fontSize: 17, color: last ? V.accent : "#555", opacity: g, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(v * g)}
                    {b.chart.unit ?? ""}
                  </div>
                  <div style={{ width: "100%", height: `${(v / max) * 80 * g}%`, marginTop: 6, borderRadius: "8px 8px 2px 2px", background: last ? V.accent : V.accent2, opacity: last ? 1 : 0.55 }} />
                  <div style={{ fontFamily: V.body, fontSize: 15, color: "#777", marginTop: 8 }}>{b.chart.labels[k]}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "table":
      return (
        <div style={{ ...box, fontFamily: V.body, fontSize: 19 }}>
          {[b.table.head, ...b.table.rows].map((row, r) => {
            const rp = r === 0 ? seg(local, 0, 6) : seg(local, 8 + (r - 1) * 6, 8, E.out);
            return (
              <div
                key={r}
                style={{
                  display: "flex",
                  height: 56,
                  alignItems: "center",
                  borderBottom: `1px solid rgba(0,0,0,${r === 0 ? 0.25 : 0.08})`,
                  color: r === 0 ? "rgba(0,0,0,0.5)" : "#1d1d1d",
                  fontWeight: r === 0 ? 600 : 400,
                  opacity: rp,
                  transform: `translateX(${(1 - rp) * 24}px)`,
                }}
              >
                {row.map((cell, c) => (
                  <div key={c} style={{ flex: c === 0 ? 2 : 1, textAlign: c === 0 ? "left" : "right", fontVariantNumeric: "tabular-nums" }}>
                    {cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    case "insight": {
      const sweep = seg(local, 2, 14, E.inOut);
      return (
        <div style={{ ...box, borderRadius: 14, overflow: "hidden", opacity: seg(local, 0, 5), boxSizing: "border-box", padding: "20px 30px", borderLeft: `6px solid ${V.accent}` }}>
          <div style={{ position: "absolute", inset: 0, background: `color-mix(in srgb, ${V.accent} 12%, white)`, transformOrigin: "left", transform: `scaleX(${sweep})` }} />
          <div style={{ position: "relative", fontFamily: V.display, fontSize: 26, lineHeight: "40px", color: "#141414" }}>{b.text}</div>
        </div>
      );
    }
  }
};

/**
 * A report page written live: typed title and headings, paragraphs revealed line by line with
 * citations, charts growing, table rows filling, an insight highlighted. The camera follows the
 * writing head, then pulls back to the finished stack. Length = reportFrames(props).
 */
export const ReportBuild: React.FC<ReportProps & { background?: string }> = ({ background = "#1C1C1C", ...props }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { blocks, pageH, writeEnd } = reportTimeline(props);
  const activeIdx = blocks.findIndex((b) => f >= b.at && f < b.at + b.dur);

  const keys: { f: number; y: number; ease?: (t: number) => number }[] = [{ f: 0, y: 0 }];
  blocks.forEach((b) => {
    const prev = keys[keys.length - 1].y;
    const target = Math.max(0, b.y + b.h / 2 - 420);
    keys.push({ f: b.at, y: prev }, { f: b.at + Math.min(12, b.dur * 0.8), y: target, ease: E.inOut });
  });
  const camY = track(f, keys).y;
  const intro = seg(f, 0, 24, E.out);
  const outro = seg(f, writeEnd + 4, 30, E.inOut);
  const zoom = mix(mix(0.62, 1.12, intro), 0.5, outro);
  const tilt = mix(mix(24, 4, intro), 16, outro);
  const turn = mix(mix(-10, -2, intro), -8, outro);
  const y = mix(camY, pageH / 2 - 420, outro);
  const fade = seg(f, 0, 6, E.linear);

  return (
    <AbsoluteFill style={{ background, opacity: fade, perspective: 1800, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: width / 2 - PAGE_W / 2,
          top: height / 2 - 420,
          width: PAGE_W,
          height: pageH,
          transformOrigin: `50% ${y + 420}px`,
          transform: `translateY(${-y}px) scale(${zoom}) rotateX(${tilt}deg) rotateZ(${turn}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {[2, 1].map((k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              inset: 0,
              background: "#EDEBE6",
              borderRadius: 6,
              transform: `translate(${k * mix(8, 26, outro)}px, ${k * mix(8, 22, outro)}px) translateZ(${-k * 2}px)`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          />
        ))}
        <div style={{ position: "absolute", inset: 0, background: "#FFFFFF", borderRadius: 6, boxShadow: "0 30px 90px rgba(0,0,0,0.45)" }}>
          <div style={{ position: "absolute", left: PAD, top: 70, right: PAD, display: "flex", justifyContent: "space-between", fontFamily: V.body, fontSize: 15, letterSpacing: "0.14em", color: "rgba(0,0,0,0.4)" }}>
            <span>{(props.kicker ?? "REPORT").toUpperCase()}</span>
            <span>{Math.min(100, Math.round((clamp01((f - 24) / Math.max(1, writeEnd - 24))) * 100))}%</span>
          </div>
          <div style={{ position: "absolute", left: PAD, top: 100, width: INNER, height: 2, background: "rgba(0,0,0,0.06)" }}>
            <div style={{ height: "100%", width: `${clamp01((f - 24) / Math.max(1, writeEnd - 24)) * 100}%`, background: V.accent }} />
          </div>
          {blocks.map((b, i) => (
            <BlockView key={i} b={b} f={f} active={i === activeIdx} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
