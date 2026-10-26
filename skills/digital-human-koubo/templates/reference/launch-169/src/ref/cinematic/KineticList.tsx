import React from "react";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { V } from "./brand";
import { E, mix, seg } from "./motion";

export type KineticItem = { label: string; icon?: string };
type Palette = { bg: string; fg: string }[];

const DEFAULT_PALETTE: Palette = [
  { bg: V.paper, fg: V.ink },
  { bg: V.ink, fg: "#F5F3EF" },
  { bg: V.accent, fg: V.ink },
  { bg: V.paper, fg: V.ink },
  { bg: V.accent2, fg: "#F5F3EF" },
  { bg: V.ink, fg: "#F5F3EF" },
];

const Beat: React.FC<{
  intro: string;
  outro: string;
  items: KineticItem[];
  beat: number;
  palette: Palette;
  tag?: string;
}> = ({ intro, outro, items, beat, palette, tag }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const introLen = beat * 2;
  const i = Math.floor((f - introLen) / beat);
  const local = (f - introLen) % beat;
  const inIntro = f < introLen;
  const inOutro = i >= items.length;
  const slot = inIntro ? { bg: V.ink, fg: "#F5F3EF" } : palette[(inOutro ? items.length : i) % palette.length];
  const slam = seg(inIntro ? f : inOutro ? f - introLen - items.length * beat : local, 0, beat * 0.6, E.out);
  const text = inIntro ? intro : inOutro ? outro : items[i].label;
  const icon = !inIntro && !inOutro ? items[i].icon : undefined;
  const big = !inIntro && !inOutro;
  const room = width - 240 - (icon ? 190 : 0);
  const fontSize = Math.min(big ? 150 : 110, room / (Array.from(text).length * 0.56));
  const counter = big ? `${String(i + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}` : "";

  return (
    <AbsoluteFill style={{ background: slot.bg, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40,
          transform: `scale(${mix(big ? 1.35 : 1.15, 1, slam)}) translateY(${(1 - slam) * 40}px)`,
          opacity: mix(0.2, 1, slam),
        }}
      >
        {icon && <Img src={staticFile(icon)} style={{ width: fontSize, height: fontSize, objectFit: "contain" }} />}
        <div
          style={{
            fontFamily: V.display,
            fontWeight: 500,
            fontSize,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: slot.fg,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
      </div>
      {counter && (
        <div style={{ position: "absolute", left: 90, bottom: 70, fontFamily: V.body, fontSize: 24, letterSpacing: "0.2em", color: slot.fg, opacity: 0.6 }}>
          {counter}
        </div>
      )}
      {big && tag && (
        <div style={{ position: "absolute", right: 90, bottom: 70, fontFamily: V.body, fontSize: 24, letterSpacing: "0.2em", color: slot.fg, opacity: 0.6 }}>
          {tag.toUpperCase()}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Intro line, one item per beat with color flips, outro line. Length = beat * (items + 4). */
export const KineticList: React.FC<{
  intro: string;
  outro: string;
  items: KineticItem[];
  beat: number;
  palette?: Palette;
  /** Small caption shown bottom-right during items. */
  tag?: string;
}> = ({ palette = DEFAULT_PALETTE, ...props }) => {
  const f = useCurrentFrame();
  const local = (f - props.beat * 2) % props.beat;
  const slamming = f >= props.beat * 2 && local < 4;
  const inner = <Beat {...props} palette={palette} />;
  return slamming ? (
    <CameraMotionBlur samples={5} shutterAngle={180}>
      {inner}
    </CameraMotionBlur>
  ) : (
    inner
  );
};
