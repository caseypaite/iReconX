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
          "desktop-tooltip pointer-events-none absolute left-0 top-full z-10 mt-2 w-max max-w-md rounded-md px-2 py-1 text-sm leading-tight opacity-0 transition-opacity duration-150 group-hover/hero-title:opacity-100",
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
