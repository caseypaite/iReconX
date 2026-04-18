"use client";

import { Minus, Square, X } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Rnd } from "react-rnd";

import { cn } from "@/lib/utils";

export type DesktopWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DesktopWindowProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  frame: DesktopWindowFrame;
  isFocused: boolean;
  isMaximized: boolean;
  isMinimized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onFrameChange: (frame: DesktopWindowFrame) => void;
}>;

function WindowChrome({
  title,
  subtitle,
  edgeToEdge = false,
  isFocused,
  onClose,
  onMinimize,
  onToggleMaximize,
  children
}: Omit<DesktopWindowProps, "frame" | "isMaximized" | "isMinimized" | "onFocus" | "onFrameChange"> & {
  edgeToEdge?: boolean;
}) {
  return (
      <div
        className={cn(
          "desktop-window-frame flex h-full flex-col overflow-hidden transition",
          "rounded-[12px]",
          isFocused ? "desktop-window-focused" : "opacity-95"
        )}
      >
      <div className="desktop-window-drag desktop-window-header flex h-[23px] items-center gap-1.5 px-2">
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Close window"
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] text-[0] shadow-inner shadow-black/20"
            onClick={onClose}
            type="button"
          >
            <X className="h-2.5 w-2.5 text-black/55 opacity-0 transition group-hover:opacity-100" />
          </button>
          <button
            aria-label="Minimize window"
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e] text-[0] shadow-inner shadow-black/20"
            onClick={onMinimize}
            type="button"
          >
            <Minus className="h-2.5 w-2.5 text-black/55 opacity-0" />
          </button>
          <button
            aria-label="Maximize window"
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840] text-[0] shadow-inner shadow-black/20"
            onClick={onToggleMaximize}
            type="button"
          >
            <Square className="h-2.5 w-2.5 text-black/55 opacity-0" />
          </button>
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="desktop-window-title truncate leading-none">
            <span className="text-[12px] font-bold">{title}</span>
            {subtitle ? <span className="desktop-window-subtitle text-[12px] font-normal">{` - ${subtitle}`}</span> : null}
          </p>
        </div>
        <div className="w-6 shrink-0" />
      </div>
      <div className="flex-1 overflow-auto p-0">{children}</div>
    </div>
  );
}

export function DesktopWindow({
  title,
  subtitle,
  frame,
  isFocused,
  isMaximized,
  isMinimized,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onFrameChange,
  children
}: DesktopWindowProps) {
  if (isMinimized) {
    return null;
  }

  if (isMaximized) {
    return (
      <div className="absolute inset-0 pointer-events-auto" onMouseDown={onFocus}>
        <WindowChrome
          title={title}
          subtitle={subtitle}
          isFocused={isFocused}
          onClose={onClose}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
        >
          {children}
        </WindowChrome>
      </div>
    );
  }

  return (
    <Rnd
      bounds="parent"
      className="absolute pointer-events-auto"
      dragHandleClassName="desktop-window-drag"
      minHeight={260}
      minWidth={360}
      position={{ x: frame.x, y: frame.y }}
      size={{ width: frame.width, height: frame.height }}
      onDragStart={onFocus}
      onDragStop={(_event, data) =>
        onFrameChange({
          ...frame,
          x: data.x,
          y: data.y
        })
      }
      onMouseDown={onFocus}
      onResizeStart={onFocus}
      onResizeStop={(_event, _direction, ref, _delta, position) =>
        onFrameChange({
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight
        })
      }
    >
      <WindowChrome
        edgeToEdge
        title={title}
        subtitle={subtitle}
        isFocused={isFocused}
        onClose={onClose}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
      >
        {children}
      </WindowChrome>
    </Rnd>
  );
}
