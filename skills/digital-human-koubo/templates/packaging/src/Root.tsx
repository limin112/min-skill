import React from "react";
import { AbsoluteFill, Composition, Sequence } from "remotion";
import { DEMOS } from "./demos/Demos";

const TOTAL = DEMOS.reduce((a, [, , d]) => a + Math.round(d * 30), 0);
/** 图鉴总片：所有组件演示首尾相接 */
const Gallery: React.FC = () => {
  let acc = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {DEMOS.map(([id, C, d]) => { const from = acc; acc += Math.round(d * 30); return <Sequence key={id} from={from} durationInFrames={Math.round(d * 30)}><C /></Sequence>; })}
    </AbsoluteFill>
  );
};
export const Root: React.FC = () => (
  <>
    <Composition id="Gallery" component={Gallery} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    {DEMOS.map(([id, C, d]) => <Composition key={id} id={id} component={C} durationInFrames={Math.round(d * 30)} fps={30} width={1920} height={1080} />)}
  </>
);
