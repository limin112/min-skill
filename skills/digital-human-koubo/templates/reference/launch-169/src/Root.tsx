import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import tl from "./timeline.json";

export const Root: React.FC = () => (
  <Composition id="Film" component={Film} durationInFrames={Math.round(tl.total * 30)} fps={30} width={1920} height={1080} />
);
