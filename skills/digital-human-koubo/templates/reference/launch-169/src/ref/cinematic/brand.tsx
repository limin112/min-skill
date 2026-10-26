import React, { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";
import type { Storyboard } from "../types";

export type CineBrand = {
  name: string;
  display: string;
  body: string;
  accent: string;
  accent2: string;
  ink: string;
  paper: string;
  /** SVG logo mark; extruded into 3D by the Logo3D scenes. */
  logo?: string;
  wordmark?: string;
};

export const brandFromStoryboard = (sb: Storyboard, overrides: Partial<CineBrand> = {}): CineBrand => ({
  ...baseBrand(sb),
  ...overrides,
});

const baseBrand = (sb: Storyboard): CineBrand => {
  const c = sb.brand.colors ?? {};
  const f = sb.brand.fonts ?? {};
  const display = f.display?.family ?? f.body?.family;
  const body = f.body?.family ?? f.display?.family;
  return {
    name: sb.brand.name,
    display: `${display ? `"${display}", ` : ""}Georgia, "Songti SC", serif`,
    body: `${body ? `"${body}", ` : ""}"PingFang SC", "Helvetica Neue", sans-serif`,
    accent: c.primary ?? "#F36440",
    accent2: c.accent ?? "#7D6BC1",
    ink: c.dark ?? "#141414",
    paper: c.background ?? "#F3F3F3",
    logo: sb.brand.logo,
    wordmark: sb.brand.wordmark,
  };
};

/** CSS tokens for DOM scenes. SVG must receive them via `style`, not presentation attributes. */
export const V = {
  display: "var(--cine-display)",
  body: "var(--cine-body)",
  accent: "var(--cine-accent)",
  accent2: "var(--cine-accent2)",
  ink: "var(--cine-ink)",
  paper: "var(--cine-paper)",
} as const;

const BrandContext = createContext<CineBrand | null>(null);

/** Three.js materials need concrete colors; DOM scenes can use `V` instead. */
export const useBrand = () => {
  const b = useContext(BrandContext);
  if (!b) throw new Error("Wrap cinematic scenes in <BrandProvider>");
  return b;
};

export const BrandProvider: React.FC<{ brand: CineBrand; children: React.ReactNode }> = ({ brand, children }) => (
  <BrandContext.Provider value={brand}>
    <AbsoluteFill
      style={
        {
          background: brand.ink,
          "--cine-display": brand.display,
          "--cine-body": brand.body,
          "--cine-accent": brand.accent,
          "--cine-accent2": brand.accent2,
          "--cine-ink": brand.ink,
          "--cine-paper": brand.paper,
        } as React.CSSProperties
      }
    >
      {children}
    </AbsoluteFill>
  </BrandContext.Provider>
);
