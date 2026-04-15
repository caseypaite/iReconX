import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  children
}: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-100 backdrop-blur-xl",
        className
      )}
    >
      {children}
    </span>
  );
}
