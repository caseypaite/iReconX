import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
      <button
      className={cn(
        "inline-flex items-center justify-center rounded-[18px] px-4 py-2 text-sm font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" &&
          "bg-gradient-to-b from-sky-300 to-sky-500 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:from-sky-200 hover:to-sky-400 disabled:hover:from-sky-300 disabled:hover:to-sky-500",
        variant === "outline" && "desktop-button-outline border backdrop-blur-xl",
        variant === "ghost" && "desktop-button-ghost",
        className
      )}
      {...props}
    />
  );
}
