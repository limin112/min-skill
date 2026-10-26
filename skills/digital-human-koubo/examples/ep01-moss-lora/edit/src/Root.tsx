import React from "react";
import { Composition } from "remotion";
import { Episode, TOTAL } from "./Episode";

export const Root: React.FC = () => (
  <Composition id="Episode" component={Episode} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
);
