import type { ReactNode } from "react";

import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HoverSubtitleTitleProps = {
  title: ReactNode;
  subtitle: ReactNode;
  className?: string;
  tooltipClassName?: string;
  titleClassName?: string;
};

export function HoverSubtitleTitle({
  title,
  subtitle,
  className,
  tooltipClassName,
  titleClassName
}: HoverSubtitleTitleProps) {
  return (
    <div className={cn("group/hero-title relative inline-flex max-w-full", className)}>
      <div
        className={cn(
          "pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-md rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-sm leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/hero-title:opacity-100",
          tooltipClassName
        )}
      >
        {subtitle}
      </div>
      <CardTitle>
        <span className={cn("cursor-default", titleClassName)}>{title}</span>
      </CardTitle>
    </div>
  );
}
