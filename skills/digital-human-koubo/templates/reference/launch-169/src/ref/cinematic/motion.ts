import { gsap } from "gsap";

type Ease = (t: number) => number;

/** GSAP easing curves, evaluated per frame so rendering stays deterministic. */
export const E = {
  out: gsap.parseEase("expo.out") as Ease,
  in: gsap.parseEase("expo.in") as Ease,
  in2: gsap.parseEase("power2.in") as Ease,
  inOut: gsap.parseEase("power3.inOut") as Ease,
  back: gsap.parseEase("back.out(1.7)") as Ease,
  sine: gsap.parseEase("sine.inOut") as Ease,
  linear: ((t: number) => t) as Ease,
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress 0..1 of a segment starting at `start` lasting `dur` frames. */
export const seg = (f: number, start: number, dur: number, ease: Ease = E.out) =>
  ease(clamp01((f - start) / dur));

type Key = { f: number; ease?: Ease } & { [prop: string]: number | Ease | undefined };

/** Interpolate numeric keyframes; each key's `ease` shapes the segment arriving at it. */
export const track = (f: number, keys: Key[]): Record<string, number> => {
  const values = (a: Key, b: Key, t: number) => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(a)) {
      if (k === "f" || k === "ease") continue;
      out[k] = mix(a[k] as number, b[k] as number, t);
    }
    return out;
  };
  if (f <= keys[0].f) return values(keys[0], keys[0], 0);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f < b.f) return values(a, b, (b.ease ?? E.inOut)((f - a.f) / (b.f - a.f)));
  }
  const last = keys[keys.length - 1];
  return values(last, last, 0);
};

/** Characters revealed at frame f when typing `text` from `start`, with human-like jitter. */
export const typingSchedule = (text: string, start: number, perChar: number, seed: (i: number) => number) => {
  const times: number[] = [];
  let t = start;
  Array.from(text).forEach((ch, i) => {
    times.push(t);
    t += perChar * (0.7 + 0.6 * seed(i)) + (ch === " " ? perChar * 0.6 : 0) + (/[.,—]/.test(ch) ? perChar * 2 : 0);
  });
  return { times, end: t };
};

export const typed = (text: string, times: number[], f: number) =>
  Array.from(text)
    .slice(0, times.filter((t) => t <= f).length)
    .join("");
