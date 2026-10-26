import React from "react";
import { useCurrentFrame } from "remotion";
import { E, seg } from "../cinematic/motion";
import { V } from "./brand";

/** Vertical (right-to-left) poem; each character settles in from blur like ink spreading. */
export const VerticalPoem: React.FC<{
  lines: string[];
  at: number;
  stagger?: number;
  size?: number;
  color?: string;
  out?: number;
  style?: React.CSSProperties;
}> = ({ lines, at, stagger = 3, size = 64, color = V.paper, out, style }) => {
  const f = useCurrentFrame();
  const fade = out === undefined ? 1 : 1 - seg(f, out, 12, E.in2);
  let i = 0;
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap: size * 0.55, fontFamily: V.display, fontSize: size, color, opacity: fade, ...style }}>
      {lines.map((line) => (
        <div key={line} style={{ display: "flex", flexDirection: "column", gap: size * 0.28 }}>
          {Array.from(line).map((ch) => {
            const p = seg(f, at + stagger * i++, 18, E.out);
            return (
              <span key={i} style={{ lineHeight: 1, opacity: p, filter: `blur(${(1 - p) * 8}px)`, transform: `translateY(${(1 - p) * -10}px)` }}>
                {ch}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
