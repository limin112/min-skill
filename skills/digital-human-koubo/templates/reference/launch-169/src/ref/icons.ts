/** Stroke icons on a 24x24 grid, drawn on with evolvePath. */
export const ICONS = {
  spark:
    "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5",
  chart: "M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4",
  globe:
    "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z",
  chat: "M4 5h16v11H9l-5 4V5zM8 9h8M8 12h5",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  cube: "M12 2l9 5v10l-9 5-9-5V7l9-5zM3 7l9 5 9-5M12 12v10",
  check: "M4 12l5 5L20 6",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM16 16l5 5",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  users:
    "M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.5.5 4 2.5 4 6",
  book: "M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z",
  factory: "M3 21V10l6 4V10l6 4V6h6v15zM7 18h2M12 18h2M17 18h2",
  wallet: "M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  rocket:
    "M12 15l-3-3c1-4 4-8 10-9-1 6-5 9-9 10zM9 12l-4 1-2 3 4 1M12 15l-1 4 3 2 1-4M5 19c0-1.5.5-3 2-3",
} as const;

export type IconName = keyof typeof ICONS;
