// 地图：世界 → 推到目标区域，国家高亮，城市图钉，大圆航线逐段生长。数据 world-atlas（Natural Earth 110m，公有领域）。
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
// @ts-ignore 无类型声明
import { geoMercator, geoPath, geoInterpolate, geoNaturalEarth1 } from "d3-geo";
// @ts-ignore
import { feature } from "topojson-client";
// @ts-ignore
import world from "world-atlas/countries-110m.json";
import { C, F, FONT, ease, lerp, sp, useT } from "./core";

const COUNTRIES = (feature(world as any, (world as any).objects.countries) as any).features as Array<{ properties: { name: string } }>;

export type Pin = { name: string; lon: number; lat: number; at: number; color?: string };
export type Route = { from: [number, number]; to: [number, number]; at: number; dur?: number; color?: string };
/** camera: [{at, lon, lat, zoom}]，zoom=1 看全球，4 左右看一个国家 */
export const MapRoute: React.FC<{ camera: Array<{ at: number; lon: number; lat: number; zoom: number }>; highlight?: Array<{ name: string; at: number; color?: string }>; pins?: Pin[]; routes?: Route[]; theme?: "paper" | "dark"; title?: { text: string; at: number } }> = ({ camera, highlight = [], pins = [], routes = [], theme = "dark", title }) => {
  const { f, t, W, H } = useT();
  // 当前相机：在关键帧之间缓动插值
  let k = camera.findIndex((c, i) => t < (camera[i + 1]?.at ?? 1e9));
  if (k < 0) k = camera.length - 1;
  const c0 = camera[k], c1 = camera[k + 1] ?? c0;
  const p = c1 === c0 ? 1 : lerp(f, c0.at, c1.at, 0, 1, ease.inOut);
  const lon = c0.lon + (c1.lon - c0.lon) * p, lat = c0.lat + (c1.lat - c0.lat) * p;
  const zoom = Math.exp(Math.log(c0.zoom) + (Math.log(c1.zoom) - Math.log(c0.zoom)) * p);
  const proj = useMemo(() => (zoom < 1.6 ? geoNaturalEarth1() : geoMercator()), [zoom < 1.6]);
  proj.scale((W / 6.2) * zoom).center([0, 0]).rotate([-lon, 0]).translate([W / 2, H / 2]);
  const [, cy] = proj([lon, lat]) ?? [0, H / 2];
  proj.translate([W / 2, H / 2 - (cy - H / 2)]);
  const path = geoPath(proj);
  const pal = theme === "paper"
    ? { sea: "#E9E1CF", land: "#D8CBB0", edge: "#B9A986", txt: C.ink, hi: C.orange }
    : { sea: "#0E1726", land: "#22324A", edge: "#3A4E6C", txt: "#fff", hi: C.orange };
  return (
    <AbsoluteFill style={{ background: pal.sea }}>
      <svg width={W} height={H}>
        {COUNTRIES.map((c, i) => {
          const h = highlight.find((x) => x.name === c.properties.name && t >= x.at);
          const hp = h ? sp(f, h.at, 14, 160) : 0;
          return <path key={i} d={path(c as any) ?? ""} fill={h ? (h.color ?? pal.hi) : pal.land} fillOpacity={h ? 0.35 + 0.65 * hp : 1} stroke={pal.edge} strokeWidth={0.8} />;
        })}
        {routes.map((r, i) => {
          if (t < r.at) return null;
          const g = geoInterpolate(r.from, r.to); const pr = lerp(f, r.at, r.at + (r.dur ?? 1.4), 0, 1, ease.inOut);
          const pts = Array.from({ length: 64 }, (_, j) => proj(g((j / 63) * pr))).filter(Boolean) as Array<[number, number]>;
          const head = pts[pts.length - 1];
          return (
            <g key={i}>
              <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={r.color ?? C.yellow} strokeWidth={6} strokeDasharray="14 10" strokeLinecap="round" />
              {head && <circle cx={head[0]} cy={head[1]} r={11} fill={r.color ?? C.yellow} stroke="#000" strokeWidth={3} />}
            </g>
          );
        })}
        {pins.map((pn, i) => {
          if (t < pn.at) return null;
          const q = proj([pn.lon, pn.lat]); if (!q) return null;
          const pp = sp(f, pn.at, 9, 240, 0.55);
          return (
            <g key={i} transform={`translate(${q[0]},${q[1]}) scale(${pp})`}>
              <circle r={26 + 18 * ((f - F(pn.at)) % 30) / 30} fill="none" stroke={pn.color ?? C.red} strokeWidth={3} opacity={1 - ((f - F(pn.at)) % 30) / 30} />
              <path d="M0,0 C-16,-22 -18,-44 0,-50 C18,-44 16,-22 0,0 Z" fill={pn.color ?? C.red} stroke="#fff" strokeWidth={3} />
              <circle cy={-34} r={7} fill="#fff" />
              <text x={0} y={-66} textAnchor="middle" fontFamily={FONT.zh} fontWeight={800} fontSize={40} fill={pal.txt} stroke={theme === "dark" ? "#000" : "#fff"} strokeWidth={6} paintOrder="stroke">{pn.name}</text>
            </g>
          );
        })}
      </svg>
      {title && t >= title.at && <div style={{ position: "absolute", left: 80, top: 70, fontFamily: FONT.zh, fontWeight: 900, fontSize: 72, color: pal.txt, opacity: sp(f, title.at), textShadow: theme === "dark" ? "0 4px 20px rgba(0,0,0,.6)" : "none" }}>{title.text}</div>}
    </AbsoluteFill>
  );
};
