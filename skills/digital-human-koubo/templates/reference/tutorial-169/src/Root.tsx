import React from "react";
import { Composition } from "remotion";
import { Tutorial, TOTAL } from "./Tutorial";

export const Root: React.FC = () => (
  <Composition id="Tutorial" component={Tutorial} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
);
