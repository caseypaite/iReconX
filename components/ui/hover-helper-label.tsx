import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

type HoverHelperLabelProps = {
  label: ReactNode;
  helper: ReactNode;
  as?: ElementType;
  wrapperClassName?: string;
  labelClassName?: string;
  tooltipClassName?: string;
};

export function HoverHelperLabel({
  label,
  helper,
  as: Component = "p",
  wrapperClassName,
  labelClassName,
  tooltipClassName
}: HoverHelperLabelProps) {
  return (
    <div className={cn("group/helper relative inline-flex max-w-full align-top", wrapperClassName)}>
      <div
        className={cn(
          "pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-md rounded-md border border-white/15 bg-slate-950/95 px-2 py-1 text-xs leading-tight text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity duration-150 group-hover/helper:opacity-100",
          tooltipClassName
        )}
      >
        {helper}
      </div>
      <Component className={cn("cursor-default", labelClassName)}>{label}</Component>
    </div>
  );
}
