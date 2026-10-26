// 逐帧播放 lucide-animated 图标：在 at 帧触发原图标的 startAnimation()，之后按帧号求值。
// <AnimatedIcon name="rocket" at={at(4)} size={120} color="#fff" />
//  - at：整片绝对帧（在 <Sequence> 里传局部帧也可以，只要和 useCurrentFrame 同一坐标）
//  - stop：可选，在该帧调用 stopAnimation()（回到 normal）
//  - cycles：原图标里无限循环的动画播几轮，默认 1（播一次后停住，符合「只在接触帧动一次」）
//  - strokeWidth：默认 1.75，与 skill 的 Lucide 规范一致
import React, { useEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import { useVideoConfig } from "remotion";
import { IconScope, drain, type Recorder } from "./motion-shim";
import { ICONS, type IconName } from "./la";

export const AnimatedIcon: React.FC<{
  name: IconName;
  at: number;
  stop?: number;
  size?: number;
  color?: string;
  strokeWidth?: number;
  cycles?: number;
  style?: React.CSSProperties;
}> = ({ name, at, stop, size = 96, color = "currentColor", strokeWidth = 1.75, cycles = 1, style }) => {
  const Icon = ICONS[name] as any;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rec = useRef<Recorder>({ vt: 0, active: false }).current;
  const handle = useRef<any>(null);
  const done = useRef(false);
  const [, bump] = useState(0);
  const [h] = useState(() => delayRender(`AnimatedIcon ${name}`));

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      rec.active = true;
      rec.vt = 0;
      const stopT = stop === undefined ? Infinity : (stop - at) / fps;
      handle.current?.startAnimation?.();
      await drain(rec, stopT);
      if (stop !== undefined) {
        rec.queue = [];
        rec.vt = stopT;
        handle.current?.stopAnimation?.();
        await drain(rec);
      }
      rec.active = false;
      bump((n) => n + 1);
      continueRender(h);
    })();
  }, []);

  const cls = `ai-${name}`;
  return (
    <IconScope.Provider value={{ rec, t: (frame - at) / fps, cycles }}>
      <style>{`.${cls} svg{stroke-width:${strokeWidth}px;overflow:visible}`}</style>
      <div className={cls} style={{ width: size, height: size, color, lineHeight: 0, ...style }}>
        <Icon ref={handle} size={size} />
      </div>
    </IconScope.Provider>
  );
};
