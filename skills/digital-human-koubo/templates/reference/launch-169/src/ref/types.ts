import type { IconName } from "./icons";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type Resolution = "720p" | "1080p" | "4k";
export type StyleId = "keynote" | "kinetic" | "aurora" | "editorial";
export type CameraMove =
  | "static"
  | "push-in"
  | "pull-out"
  | "pan-left"
  | "pan-right"
  | "tilt-up"
  | "drift"
  | "orbit";
export type TransitionId = "fade" | "slide" | "wipe" | "none";
export type Tone = "light" | "dark";

type SceneBase = {
  id?: string;
  seconds: number;
  camera?: CameraMove;
  transition?: TransitionId;
  caption?: string;
  tone?: Tone;
};

export type StatementScene = SceneBase & {
  type: "statement";
  eyebrow?: string;
  text: string;
  highlight?: string;
};

export type Hero3DScene = SceneBase & {
  type: "hero3d";
  title: string;
  subtitle?: string;
  shape?: "knot" | "orbs" | "cubes";
};

export type FeaturesScene = SceneBase & {
  type: "features";
  title?: string;
  items: { icon?: IconName; image?: string; title: string; body?: string }[];
  /** "icon": image replaces the small icon. "cover": image fills the top of the card. */
  imageStyle?: "icon" | "cover";
  /** width / height of cover images, default 1.6 */
  imageAspect?: number;
};

export type StatsScene = SceneBase & {
  type: "stats";
  title?: string;
  items: {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    label: string;
  }[];
};

export type ShowcaseScene = SceneBase & {
  type: "showcase";
  title: string;
  body?: string;
  image?: string;
  frame?: "browser" | "phone" | "none";
};

export type OutroScene = SceneBase & {
  type: "outro";
  tagline?: string;
  cta?: string;
  url?: string;
};

export type Scene =
  | StatementScene
  | Hero3DScene
  | FeaturesScene
  | StatsScene
  | ShowcaseScene
  | OutroScene;

export type Storyboard = {
  meta: {
    title: string;
    language: "zh" | "en" | "ja";
    industry: string;
    audience: string;
    purpose: string;
  };
  format: {
    aspect: AspectRatio;
    fps: number;
    resolution?: Resolution;
  };
  style: StyleId;
  brand: {
    name: string;
    logo?: string;
    wordmark?: string;
    fonts?: {
      display?: { family: string; file?: string };
      body?: { family: string; file?: string };
    };
    displayWeight?: number;
    colors?: {
      primary?: string;
      accent?: string;
      background?: string;
      text?: string;
      muted?: string;
      button?: string;
      dark?: string;
      light?: string;
    };
    disclaimer?: string;
  };
  music?: {
    file?: string;
    bpm?: number;
    volume?: number;
    startOffset?: number;
  };
  captions?: boolean;
  scenes: Scene[];
};
