import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  children
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-white/10 bg-slate-950/35 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.32)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: PropsWithChildren) {
  return <h3 className="text-lg font-semibold text-white">{children}</h3>;
}

export function CardDescription({ children }: PropsWithChildren) {
  return <p className="mt-1 text-sm text-slate-400">{children}</p>;
}
