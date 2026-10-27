import React from "react";
import { Composition } from "remotion";
import { Explainer, TOTAL } from "./Explainer";

export const Root: React.FC = () => (
  <Composition id="Explainer" component={Explainer} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
);
