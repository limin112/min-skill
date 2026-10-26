import React from "react";
import { Composition } from "remotion";
import { Huazi, TOTAL_FRAMES } from "./Huazi";

export const Root: React.FC = () => (
  <Composition id="Huazi" component={Huazi} durationInFrames={TOTAL_FRAMES} fps={30} width={1080} height={1920} />
);
