/**
 * Closed-form springs so every value is a pure function of time.
 * A value that changes target many times is the sum of one step response per change.
 */
export type SpringCfg = { w: number; z: number };

const hz = (f: number) => 2 * Math.PI * f;

/** Snappy UI spring: ~1.5% overshoot. */
export const UI: SpringCfg = { w: hz(2.1), z: 0.82 };
/** Critically damped, for the cursor and anything that must not overshoot. */
export const CURSOR: SpringCfg = { w: hz(2.4), z: 1 };
/** Slower camera. */
export const CAM: SpringCfg = { w: hz(1.25), z: 0.95 };
/** Fast press/release. */
export const PRESS: SpringCfg = { w: hz(5), z: 0.75 };
/** Leading / trailing edges for liquid indicators. */
export const LEAD: SpringCfg = { w: hz(3.2), z: 0.86 };
export const TRAIL: SpringCfg = { w: hz(1.7), z: 0.9 };

export const step = (tau: number, { w, z }: SpringCfg) => {
  if (tau <= 0) return 0;
  if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
};

/** keys: [time, target] in seconds; the first key is the starting value. */
export const track = (t: number, keys: [number, number][], c: SpringCfg = UI) => {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * step(t - keys[i][0], c);
  return v;
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const trackColor = (t: number, keys: [number, string][], c: SpringCfg = UI) => {
  const ch = [0, 1, 2].map((k) => track(t, keys.map(([tt, col]) => [tt, rgb(col)[k]] as [number, number]), c));
  return `rgb(${ch.map((v) => Math.round(Math.min(255, Math.max(0, v)))).join(",")})`;
};

/** keys with a per-change spring: [time, target, cfg]. Lets a leading edge ride a faster spring than the trailing one. */
export const trackCfg = (t: number, keys: [number, number, SpringCfg?][], fallback: SpringCfg = UI) => {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * step(t - keys[i][0], keys[i][2] ?? fallback);
  return v;
};

/** Value driven directly by the pointer while held, then springing from wherever it was released to `after`. */
export const dragged = (t: number, held: [number, number], live: (t: number) => number, before: number, after: number, c: SpringCfg = UI) => {
  if (t < held[0]) return before;
  if (t <= held[1]) return live(t);
  const v = live(held[1]);
  return after + (v - after) * (1 - step(t - held[1], c));
};
