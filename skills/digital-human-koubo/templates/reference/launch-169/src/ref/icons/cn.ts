// lucide-animated 源码里的 cn()（原为 clsx + tailwind-merge），这里只需拼 className
export const cn = (...a: any[]) => a.flat(Infinity as 1).filter(Boolean).join(" ");
