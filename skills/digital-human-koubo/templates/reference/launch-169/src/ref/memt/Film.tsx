// MemT 1.0 发布宣传片（约 1:35，16:9，暗场科技 · 旁白驱动）。旁白为用户本人克隆音色，时间轴全部来自 vo.json。
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { HitCam } from "../cinematic/AudioReactive";
import { BrandProvider, type CineBrand } from "../cinematic/brand";
import { clamp01 } from "../cinematic/motion";
import { keyCues, SoundCues, type Cue } from "../cinematic/sfx";
import { Backdrop, SPEECH, T, TE } from "./kit";
import { B2, B3, B5, MEM, NAME, S1Paths, s1Cues, S2Launch, s2Cues, s3Cues, s3KeyText, S34Window, S5Team, s5Cues } from "./scenesA";
import { Chapter, S7Arch, s7Cues, S9Exp, s9Cues } from "./scenesB";
import { BURST, C_TIMES, PARTICLE_START, ParticleLayer, S10Data, s10Cues, S11Quote, s11Cues, S12End, s12Cues } from "./scenesC";

const CH1S = T("b07") - 6;
const CH1E = T("b08") - 4;
const CH2S = T("b09") - 6;
const CH2E = T("b10") - 2;
const B10 = T("b11") - 6;
const B11 = T("b13") - 6;
const LAND = BURST + 2;
export const MEMT_FRAMES = TE("b14") + 90;

const BRAND: CineBrand = { name: "MemT 1.0", display: '"SF Pro Display", "PingFang SC", sans-serif', body: '"PingFang SC", sans-serif', accent: "#3D6BF5", accent2: "#6A3BF0", ink: "#03050D", paper: "#EEF2FF" };

const win = (f: number, a: number, b: number) => f >= a && f < b;

const bgmVolume = (f: number) => {
  let d = Infinity;
  for (const [a, b] of SPEECH) {
    if (f >= a - 3 && f <= b + 3) return 0.17;
    d = Math.min(d, Math.abs(f - a), Math.abs(f - b));
  }
  const gap = 0.17 + 0.17 * clamp01((d - 3) / 12);
  const tail = f > TE("b14") + 6 ? 0.42 * clamp01((MEMT_FRAMES - 4 - f) / 45) : gap;
  return f > TE("b14") + 6 ? tail : gap;
};

const CUES: Cue[] = [
  ...s1Cues(),
  ...s2Cues(),
  ...s3Cues(),
  ...keyCues(s3KeyText.text, s3KeyText.times, 0, 0.4, 3),
  ...keyCues(s3KeyText.q, s3KeyText.qTimes, 0, 0.45, 2),
  ...s5Cues(),
  { at: CH1S + 2, name: "whoosh", volume: 0.5 },
  { at: CH1E - 10, name: "swish-1", volume: 0.4 },
  ...s7Cues(),
  { at: CH2S + 2, name: "whoosh", volume: 0.5 },
  { at: CH2E - 10, name: "swish-2", volume: 0.4 },
  ...s9Cues(),
  ...s10Cues(),
  ...s11Cues(),
  ...s12Cues(LAND),
];

export const MemTFilm: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <BrandProvider brand={BRAND}>
      <HitCam f={f} hits={[MEM, NAME, C_TIMES.PCT, BURST]} shake={4} punch={0.018}>
        <Backdrop f={f} glow={win(f, B2, B3) || f >= LAND ? 1.4 : 1} gy={win(f, B2, B3) ? 330 : 540} />
        {win(f, 0, B2 + 2) && <S1Paths f={f} />}
        {win(f, B2 - 2, B3 + 12) && <S2Launch f={f} />}
        {win(f, B3 - 4, B5 + 12) && <S34Window f={f} />}
        {win(f, B5, CH1S + 14) && <S5Team f={f} end={CH1S + 14} />}
        {win(f, CH1E - 14, CH2S + 12) && <S7Arch f={f} start={CH1E - 12} />}
        {win(f, CH2E - 14, B10 + 10) && <S9Exp f={f} start={CH2E - 12} />}
        {win(f, B10, B11 + 10) && <S10Data f={f} start={B10} />}
        {win(f, B11, BURST + 8) && <S11Quote f={f} start={B11} />}
        <Sequence from={PARTICLE_START} durationInFrames={BURST - PARTICLE_START + 20} layout="none">
          <ParticleLayer />
        </Sequence>
        {f >= BURST - 2 && <S12End f={f} land={LAND} />}
        {win(f, CH1S, CH1E + 6) && <Chapter f={f} start={CH1S} end={CH1E} num="看点一" title={[{ t: "记忆，进入" }, { t: "计算本身", accent: true }]} en="Memory inside the forward pass" />}
        {win(f, CH2S, CH2E + 6) && <Chapter f={f} start={CH2S} end={CH2E} num="看点二" title={[{ t: "经验" }, { t: "复用", accent: true }]} en="Experience reuse" />}
      </HitCam>
      <Audio src={staticFile("vo.wav")} volume={1} />
      <Audio src={staticFile("music/bgm.wav")} volume={(fr) => bgmVolume(fr)} />
      <SoundCues cues={CUES} />
    </BrandProvider>
  );
};
