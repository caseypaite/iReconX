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
            "desktop-tooltip pointer-events-none absolute left-0 top-full z-10 mt-2 w-max max-w-md rounded-md px-2 py-1 text-xs leading-tight opacity-0 transition-opacity duration-150 group-hover/helper:opacity-100",
            tooltipClassName
          )}
        >
        {helper}
      </div>
      <Component className={cn("cursor-default", labelClassName)}>{label}</Component>
    </div>
  );
}
