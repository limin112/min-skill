import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

export const FONT = 'Geist, "PingFang SC", -apple-system, sans-serif';

/** Loads public/fonts/Geist-*.woff2 (from `npm i geist`, dist/fonts/geist-sans) before the first frame renders. */
export const useGeist = () => {
  const [handle] = useState(() => delayRender("geist"));
  useEffect(() => {
    Promise.all(
      [
        ["Regular", 400],
        ["Medium", 500],
        ["SemiBold", 600],
        ["Bold", 700],
      ].map(([n, w]) => new FontFace("Geist", `url(${staticFile(`fonts/Geist-${n}.woff2`)})`, { weight: String(w) }).load().then((face) => document.fonts.add(face))),
    )
      .then(() => continueRender(handle))
      .catch((err) => cancelRender(err));
  }, [handle]);
};
