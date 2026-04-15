import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[18px] px-4 py-2 text-sm font-medium transition duration-150",
        variant === "default" &&
          "bg-gradient-to-b from-sky-300 to-sky-500 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] hover:from-sky-200 hover:to-sky-400",
        variant === "outline" &&
          "border border-white/10 bg-white/8 text-slate-100 backdrop-blur-xl hover:bg-white/12",
        variant === "ghost" && "text-slate-200 hover:bg-white/10",
        className
      )}
      {...props}
    />
  );
}
