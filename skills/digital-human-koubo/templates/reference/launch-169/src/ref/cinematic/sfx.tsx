import React from "react";
import { Audio, random, Sequence, staticFile, useVideoConfig } from "remotion";

export type Cue = { at: number; name: string; volume?: number };

/**
 * Seconds from file start to the loudest sample, measured with numpy. `at` is the contact frame
 * (click down, card lands, cut happens); SoundCues starts the file early by this much so the peak lands on it.
 */
export const SFX_PEAK: Record<string, number> = {
  "key-8": 0.092, cut: 0.157, "paper-place-1": 0.046, "paper-place-2": 0.05, "swish-1": 0.039, "swish-2": 0.118, "swish-3": 0.062, whoosh: 0.264, riser: 1.198,
};

/** Number of keystroke samples available as sfx/key-1.wav … key-N.wav. */
export const KEY_VARIANTS = 8;

/**
 * One keystroke per typed character, thinned to at most one every `minGap` frames:
 * on-screen typing is usually faster than a human, and denser clicks blur into a buzz.
 */
export const keyCues = (text: string, times: number[], offset: number, volume = 0.55, minGap = 2): Cue[] => {
  const cues: Cue[] = [];
  let last = -Infinity;
  Array.from(text).forEach((ch, i) => {
    const at = Math.round(offset + times[i]);
    if (ch === "\n" || at - last < minGap) return;
    last = at;
    cues.push({
      at,
      name: ch === " " ? "key-space" : `key-${Math.floor(random(`k${offset}-${i}`) * KEY_VARIANTS) + 1}`,
      volume: volume * (0.8 + 0.4 * random(`v${offset}-${i}`)),
    });
  });
  return cues;
};

export const SoundCues: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at - (SFX_PEAK[c.name] ?? 0) * fps))} durationInFrames={Math.round(fps * (c.name === "processing" ? 5 : 2.5))} layout="none">
          <Audio src={staticFile(`sfx/${c.name}.wav`)} volume={c.volume ?? 0.6} />
        </Sequence>
      ))}
    </>
  );
};
