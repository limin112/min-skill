import React from "react";
import type { LucideIcon } from "lucide-react";
import { useBrand } from "./brand";
import { mix } from "./motion";
import { AnimatedIcon } from "../icons/AnimatedIcon";
import type { IconName } from "../icons/la";

export type { LucideIcon, IconName };

/**
 * App-icon style tile: continuous-corner squircle, brand gradient, top highlight and soft
 * coloured shadow. `on` (0–1) blends from the quiet glass state to the lit brand state.
 * Icons come from lucide-react (ISC) and are drawn at one stroke weight across the film.
 * Pass `anim` (a lucide-animated name) + `playAt` instead of `icon` to let the glyph play its own
 * motion once on the contact frame — see references/animated-icons.md.
 */
export const IconTile: React.FC<{ icon?: LucideIcon; anim?: IconName; playAt?: number; size?: number; on?: number; color?: string }> = ({
  icon: Icon,
  anim,
  playAt = 0,
  size = 120,
  on = 1,
  color,
}) => {
  const b = useBrand();
  const c = color ?? b.accent;
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: size * 0.2237 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(10px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          opacity: on,
          background: `linear-gradient(160deg, color-mix(in srgb, ${c} 70%, white) 0%, ${c} 48%, color-mix(in srgb, ${c} 78%, black) 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -${size * 0.08}px ${size * 0.16}px rgba(0,0,0,0.18), 0 ${size * 0.12}px ${size * 0.3}px color-mix(in srgb, ${c} ${35 * on}%, transparent)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {anim ? (
          <AnimatedIcon name={anim} at={playAt} size={size * 0.46} color={on > 0.5 ? "#FFFFFF" : c} style={{ opacity: mix(0.55, 1, on) }} />
        ) : Icon ? (
          <Icon size={size * 0.46} strokeWidth={1.75} color={on > 0.5 ? "#FFFFFF" : c} style={{ opacity: mix(0.55, 1, on) }} />
        ) : null}
      </div>
    </div>
  );
};
