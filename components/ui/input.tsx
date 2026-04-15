import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-[18px] border border-white/10 bg-slate-950/40 px-3.5 py-2.5 text-sm text-slate-100 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-sky-400",
        className
      )}
      {...props}
    />
  );
}
