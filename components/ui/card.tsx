import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  children
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "desktop-card rounded-[18px] p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: PropsWithChildren) {
  return <h3 className="desktop-card-title text-lg font-semibold">{children}</h3>;
}

export function CardDescription({ children }: PropsWithChildren) {
  return <p className="desktop-card-description mt-1 text-sm">{children}</p>;
}
