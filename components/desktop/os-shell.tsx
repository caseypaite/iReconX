"use client";

import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Calculator,
  DatabaseZap,
  FileText,
  Info,
  Monitor,
  Search,
  TimerReset,
  Type,
  Wifi
} from "lucide-react";
import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";

import {
  CalculatorAccessory,
  NotepadAccessory,
  StopwatchAccessory,
  TextToolsAccessory
} from "@/components/desktop/accessory-windows";
import { CalendarPopover } from "@/components/desktop/calendar-popover";
import {
  defaultUiPrefs,
  DesktopOptionsWindow,
  gradientStyles,
  type UiPrefs
} from "@/components/desktop/desktop-options-window";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { UserProfileWindow } from "@/components/desktop/user-profile-window";
import { DesktopWindow, type DesktopWindowFrame } from "@/components/desktop/desktop-window";
import { DataStudioWindow } from "@/components/desktop/data-studio-window";
import { QueryBuilderCard } from "@/components/dashboard/query-builder";
import { VisualizationCard } from "@/components/dashboard/visualization-card";
import { LogoutButton } from "@/components/layout/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { NavIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/auth";

type NavItem = {
  href: Route;
  label: string;
  icon: NavIcon;
};

type WindowKind =
  | "route"
  | "sql-explorer"
  | "visualization-lab"
  | "about"
  | "notepad"
  | "calculator"
  | "stopwatch"
  | "text-tools"
  | "data-studio"
  | "profile"
  | "options";

type ManagedWindow = {
  id: string;
  kind: WindowKind;
  title: string;
  subtitle?: string;
  frame: DesktopWindowFrame;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
};

type DockApp = {
  id: string;
  label: string;
  icon: typeof Monitor;
  windowKind?: Exclude<WindowKind, "route">;
};

type RouteDescriptor = ReturnType<typeof getRouteDescriptor>;

const utilityApps: ReadonlyArray<{
  id: string;
  label: string;
  icon: typeof Monitor;
  kind: Extract<WindowKind, "notepad" | "calculator" | "stopwatch" | "text-tools">;
}> = [
  { id: "utility-notepad", label: "Notepad", icon: FileText, kind: "notepad" },
  { id: "utility-calculator", label: "Calculator", icon: Calculator, kind: "calculator" },
  { id: "utility-stopwatch", label: "Stopwatch", icon: TimerReset, kind: "stopwatch" },
  { id: "utility-text-tools", label: "Text Tools", icon: Type, kind: "text-tools" }
];

const routeFrames: Record<string, DesktopWindowFrame> = {
  dashboard: { x: 0, y: 0, width: 1160, height: 680 },
  explorer: { x: 0, y: 0, width: 1160, height: 680 },
  visualizations: { x: 0, y: 0, width: 1160, height: 680 },
  admin: { x: 0, y: 0, width: 1160, height: 680 },
  users: { x: 0, y: 0, width: 1160, height: 680 },
  "data-sources": { x: 0, y: 0, width: 1160, height: 680 }
};

const windowKinds: readonly WindowKind[] = [
  "route",
  "sql-explorer",
  "visualization-lab",
  "about",
  "notepad",
  "calculator",
  "stopwatch",
  "text-tools",
  "data-studio",
  "profile",
  "options"
];

function isWindowKind(value: unknown): value is WindowKind {
  return typeof value === "string" && windowKinds.includes(value as WindowKind);
}

function isDesktopWindowFrame(value: unknown): value is DesktopWindowFrame {
  if (!value || typeof value !== "object") {
    return false;
  }

  const frame = value as Partial<DesktopWindowFrame>;

  return [frame.x, frame.y, frame.width, frame.height].every(
    (part) => typeof part === "number" && Number.isFinite(part)
  );
}

function getLayoutStorageKey(userEmail: string, role: AppRole, pathname: string) {
  return `glassui.desktop-layout:${role}:${userEmail}:${pathname}`;
}

function restoreWindows(rawLayout: string | null, routeDescriptor: RouteDescriptor): ManagedWindow[] {
  if (!rawLayout) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawLayout);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const seenKinds = new Set<string>();

    return parsed.reduce<ManagedWindow[]>((windows, entry, index) => {
      if (!entry || typeof entry !== "object") {
        return windows;
      }

      const candidate = entry as Partial<ManagedWindow>;

      if (!isWindowKind(candidate.kind) || !isDesktopWindowFrame(candidate.frame)) {
        return windows;
      }

      const kindKey = candidate.kind;

      if (seenKinds.has(kindKey)) {
        return windows;
      }

      seenKinds.add(kindKey);

      if (candidate.kind === "route") {
        windows.push({
          id: routeDescriptor.id,
          kind: "route",
          title: routeDescriptor.title,
          subtitle: routeDescriptor.subtitle,
          frame: candidate.frame,
          minimized: Boolean(candidate.minimized),
          maximized: candidate.maximized ?? true,
          zIndex: typeof candidate.zIndex === "number" ? candidate.zIndex : index + 1
        });

        return windows;
      }

      if (typeof candidate.id !== "string" || typeof candidate.title !== "string") {
        return windows;
      }

      windows.push({
        id: candidate.id,
        kind: candidate.kind,
        title: candidate.title,
        subtitle: typeof candidate.subtitle === "string" ? candidate.subtitle : undefined,
        frame: candidate.frame,
        minimized: Boolean(candidate.minimized),
        maximized: Boolean(candidate.maximized),
        zIndex: typeof candidate.zIndex === "number" ? candidate.zIndex : index + 1
      });

      return windows;
    }, []);
  } catch {
    return [];
  }
}

function getRouteDescriptor(pathname: string, role: AppRole, title: string, subtitle: string) {
  if (pathname === "/dashboard/explorer") {
    return {
      id: "route:explorer",
      slug: "explorer",
      title: "SQL Explorer",
      subtitle: "Query drafting, builder mode, and payload inspection.",
      frame: routeFrames.explorer
    };
  }

  if (pathname === "/dashboard/visualizations") {
    return {
      id: "route:visualizations",
      slug: "visualizations",
      title: "Visualization Lab",
      subtitle: "Chart presets and future rendering adapters.",
      frame: routeFrames.visualizations
    };
  }

  if (pathname === "/admin/users") {
    return {
      id: "route:users",
      slug: "users",
      title: "User Registry",
      subtitle: "Admin identity management and access controls.",
      frame: routeFrames.users
    };
  }

  if (pathname === "/admin/data-sources") {
    return {
      id: "route:data-sources",
      slug: "data-sources",
      title: "Data Source Control",
      subtitle: "Governed connectors and encrypted configuration storage.",
      frame: routeFrames["data-sources"]
    };
  }

  return {
    id: role === "ADMIN" ? "route:admin" : "route:dashboard",
    slug: role === "ADMIN" ? "admin" : "dashboard",
    title,
    subtitle,
    frame: role === "ADMIN" ? routeFrames.admin : routeFrames.dashboard
  };
}

function buildContextMenus(kind: WindowKind, role: AppRole, pathname: string) {
  if (kind === "sql-explorer") {
    return ["Query", "Data", "Visualize", "Window"];
  }

  if (kind === "visualization-lab") {
    return ["Chart", "Palette", "Inspect", "Window"];
  }

  if (kind === "data-studio") {
    return ["Data", "Transform", "Window"];
  }

  if (kind === "about") {
    return ["GlassUI", "Version", "Support"];
  }

  if (kind === "notepad") {
    return ["File", "Edit", "Format", "Window"];
  }

  if (kind === "calculator") {
    return ["Edit", "Calculate", "Memory", "Window"];
  }

  if (kind === "stopwatch") {
    return ["Timer", "Lap", "View", "Window"];
  }

  if (kind === "text-tools") {
    return ["Text", "Convert", "Metrics", "Window"];
  }

  return pathname.startsWith("/admin") ? ["Users", "Data", "View"] : ["File", "Data", "View", "Window"];
}

function PeachLogo({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-5 w-5 items-center justify-center", className)}>
      <span className="absolute left-[2px] top-[1px] h-2.5 w-2 rounded-full bg-emerald-300/90" />
      <span className="absolute right-[2px] top-[1px] h-2.5 w-2 rounded-full bg-emerald-400/80" />
      <span className="absolute bottom-0 h-4 w-4 rounded-full bg-gradient-to-br from-orange-200 via-orange-300 to-rose-400 shadow-[inset_-2px_-2px_3px_rgba(190,24,93,0.2)]" />
    </span>
  );
}

function AboutStudioWindow() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/10">
            <PeachLogo className="h-6 w-6" />
          </div>
          <div>
            <CardTitle>GlassUI</CardTitle>
            <CardDescription>Desktop-mode analytics workspace with a glass-styled floating window manager.</CardDescription>
          </div>
        </div>
        <div className="mt-5 space-y-3 text-sm text-slate-300">
          <p>Role-aware data exploration, admin governance, encrypted connectors, and OTP-protected sign-in.</p>
          <p>
            The protected UI now behaves like a desktop environment with a menu bar, dock, floating windows, and
            overlapping workspaces.
          </p>
        </div>
      </Card>
      <Card>
        <CardTitle>Design language</CardTitle>
        <CardDescription>Dark translucent panels, soft shadows, rounded chrome, and spotlight-like accents.</CardDescription>
        <div className="mt-4 grid gap-3">
          <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Menu bar</p>
            <p className="mt-1 text-sm text-slate-300">Context-sensitive to the focused application window.</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Dock</p>
            <p className="mt-1 text-sm text-slate-300">Compact launchers for core apps, with utilities grouped in the menu bar.</p>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Windows</p>
            <p className="mt-1 text-sm text-slate-300">Draggable, resizable, minimizable, and maximizable app panels.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function OsShell({
  title,
  subtitle,
  role,
  userEmail,
  userName,
  navItems,
  children
}: PropsWithChildren<{
  title: string;
  subtitle: string;
  role: AppRole;
  userEmail: string;
  userName?: string | null;
  navItems: readonly NavItem[];
}>) {
  const pathname = usePathname();
  const routeDescriptor = useMemo(() => getRouteDescriptor(pathname, role, title, subtitle), [pathname, role, title, subtitle]);
  const layoutStorageKey = useMemo(() => getLayoutStorageKey(userEmail, role, pathname), [pathname, role, userEmail]);
  const zCounter = useRef(4);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [windows, setWindows] = useState<ManagedWindow[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [glassMenuOpen, setGlassMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(defaultUiPrefs);

  const glassMenuRef = useRef<HTMLDivElement>(null);
  const utilityMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside([glassMenuRef, utilityMenuRef, adminMenuRef, calendarRef, viewMenuRef], () => {
    setGlassMenuOpen(false);
    setUtilityMenuOpen(false);
    setAdminMenuOpen(false);
    setCalendarOpen(false);
    setViewMenuOpen(false);
  });

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 1000 * 30);

    try {
      const stored = window.localStorage.getItem("ireconx:ui-prefs");
      if (stored) {
        setUiPrefs((prev) => ({ ...prev, ...(JSON.parse(stored) as Partial<UiPrefs>) }));
      }
    } catch {
      // ignore malformed prefs
    }

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setUtilityMenuOpen(false);
    setAdminMenuOpen(false);
    setGlassMenuOpen(false);
    setCalendarOpen(false);
    setViewMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const restoredWindows = restoreWindows(window.localStorage.getItem(layoutStorageKey), routeDescriptor);
    zCounter.current = restoredWindows.reduce((highest, windowItem) => Math.max(highest, windowItem.zIndex), 3) + 1;
    setWindows(restoredWindows);
    setLayoutReady(true);
  }, [layoutStorageKey, mounted, routeDescriptor]);

  useEffect(() => {
    if (!mounted || !layoutReady) {
      return;
    }

    window.localStorage.setItem(layoutStorageKey, JSON.stringify(windows));
  }, [layoutReady, layoutStorageKey, mounted, windows]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem("ireconx:ui-prefs", JSON.stringify(uiPrefs));
  }, [mounted, uiPrefs]);

  const activeWindow = useMemo(
    () =>
      [...windows]
        .filter((windowItem) => !windowItem.minimized)
        .sort((left, right) => right.zIndex - left.zIndex)[0],
    [windows]
  );

  const dockApps = useMemo<DockApp[]>(
    () => [
      { id: "console", label: role === "ADMIN" ? "Control Plane" : "Workspace", icon: Monitor },
      { id: "sql", label: "SQL Explorer", icon: DatabaseZap, windowKind: "sql-explorer" },
      { id: "viz", label: "Visualization Lab", icon: BarChart3, windowKind: "visualization-lab" }
    ],
    [role]
  );

  function bringToFront(id: string) {
    setWindows((previous) =>
      previous.map((windowItem) =>
        windowItem.id === id
          ? {
              ...windowItem,
              minimized: false,
              zIndex: zCounter.current++
            }
          : windowItem
      )
    );
  }

  function updateWindow(id: string, updater: (windowItem: ManagedWindow) => ManagedWindow) {
    setWindows((previous) => previous.map((windowItem) => (windowItem.id === id ? updater(windowItem) : windowItem)));
  }

  function openRouteWindow() {
    const existing = windows.find((windowItem) => windowItem.kind === "route");

    if (existing) {
      bringToFront(existing.id);
      return;
    }

    setWindows((previous) => [
      ...previous,
      {
        id: routeDescriptor.id,
        kind: "route",
        title: routeDescriptor.title,
        subtitle: routeDescriptor.subtitle,
        frame: routeDescriptor.frame,
        minimized: false,
        maximized: true,
        zIndex: zCounter.current++
      }
    ]);
  }

  function openWindow(kind: Exclude<WindowKind, "route">) {
    const existing = windows.find((windowItem) => windowItem.kind === kind);

    if (existing) {
      bringToFront(existing.id);
      return;
    }

    const windowConfig: Record<Exclude<WindowKind, "route">, Omit<ManagedWindow, "zIndex" | "minimized" | "maximized">> = {
      "sql-explorer": {
        id: "window:sql-explorer",
        kind: "sql-explorer",
        title: "SQL Explorer",
        subtitle: "Builder mode, SQL drafting, and request payloads.",
        frame: { x: 24, y: 24, width: 760, height: 520 }
      },
      "visualization-lab": {
        id: "window:visualization-lab",
        kind: "visualization-lab",
        title: "Visualization Lab",
        subtitle: "Chart previews and configuration presets.",
        frame: { x: 96, y: 72, width: 620, height: 420 }
      },
      "data-studio": {
        id: "window:data-studio",
        kind: "data-studio",
        title: "Data Studio",
        subtitle: "Governed sources, uploads, pivoting, and summarization.",
        frame: { x: 48, y: 36, width: 1100, height: 680 }
      },
      profile: {
        id: "window:profile",
        kind: "profile",
        title: "My Profile",
        subtitle: "CV biodata and password.",
        frame: { x: 60, y: 40, width: 900, height: 580 }
      },

      about: {
        id: "window:about",
        kind: "about",
        title: "About GlassUI",
        subtitle: "System profile and desktop mode summary.",
        frame: { x: 80, y: 60, width: 680, height: 420 }
      },
      notepad: {
        id: "window:notepad",
        kind: "notepad",
        title: "Notepad",
        subtitle: "Quick notes and scratchpad text.",
        frame: { x: 88, y: 54, width: 560, height: 420 }
      },
      calculator: {
        id: "window:calculator",
        kind: "calculator",
        title: "Calculator",
        subtitle: "Compact arithmetic utility.",
        frame: { x: 122, y: 82, width: 360, height: 500 }
      },
      stopwatch: {
        id: "window:stopwatch",
        kind: "stopwatch",
        title: "Stopwatch",
        subtitle: "Lap timer for quick measurements.",
        frame: { x: 154, y: 96, width: 420, height: 460 }
      },
      "text-tools": {
        id: "window:text-tools",
        kind: "text-tools",
        title: "Text Tools",
        subtitle: "Case conversion and text metrics.",
        frame: { x: 176, y: 114, width: 560, height: 430 }
      },
      options: {
        id: "window:options",
        kind: "options",
        title: "Display Options",
        subtitle: "Appearance and workspace preferences.",
        frame: { x: 80, y: 60, width: 700, height: 480 }
      }
    };

    const nextWindow = windowConfig[kind];

    setWindows((previous) => [
      ...previous,
      {
        ...nextWindow,
        minimized: false,
        maximized: false,
        zIndex: zCounter.current++
      }
    ]);
  }

  function closeWindow(id: string) {
    setWindows((previous) => previous.filter((windowItem) => windowItem.id !== id));
  }

  function cascadeWindows() {
    setWindows((previous) => {
      const visible = [...previous]
        .filter((w) => !w.minimized)
        .sort((a, b) => a.zIndex - b.zIndex);

      let nextZ = zCounter.current;
      const patches = new Map<string, Partial<ManagedWindow>>();

      visible.forEach((w, i) => {
        patches.set(w.id, {
          frame: { x: 24 + i * 30, y: 24 + i * 30, width: 820, height: 540 },
          minimized: false,
          maximized: false,
          zIndex: nextZ++
        });
      });

      zCounter.current = nextZ;
      return previous.map((w) => {
        const patch = patches.get(w.id);
        return patch ? { ...w, ...patch } : w;
      });
    });
  }

  function tileWindows() {
    setWindows((previous) => {
      const visible = previous.filter((w) => !w.minimized);
      const count = visible.length;

      if (count === 0) return previous;

      const viewportW = typeof window !== "undefined" ? window.innerWidth : 1280;
      const viewportH = (typeof window !== "undefined" ? window.innerHeight : 800) - 44 - 80;
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const cellW = Math.floor(viewportW / cols);
      const cellH = Math.floor(viewportH / rows);

      let nextZ = zCounter.current;
      const patches = new Map<string, Partial<ManagedWindow>>();

      visible.forEach((w, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        patches.set(w.id, {
          frame: { x: col * cellW, y: 44 + row * cellH, width: cellW, height: cellH },
          minimized: false,
          maximized: false,
          zIndex: nextZ++
        });
      });

      zCounter.current = nextZ;
      return previous.map((w) => {
        const patch = patches.get(w.id);
        return patch ? { ...w, ...patch } : w;
      });
    });
  }

  function minimizeAll() {
    setWindows((previous) => previous.map((w) => ({ ...w, minimized: true })));
  }

  const contextMenus = buildContextMenus(activeWindow?.kind ?? "route", role, pathname);
  const hasOpenUtility = utilityApps.some((app) => windows.some((windowItem) => windowItem.kind === app.kind && !windowItem.minimized));
  const hasOpenAdminWindow =
    role === "ADMIN" &&
    windows.some((windowItem) => windowItem.kind === "route" && !windowItem.minimized);
  const hasOpenDataStudio = windows.some((windowItem) => windowItem.kind === "data-studio" && !windowItem.minimized);

  return (
    <div
      className="desktop-wallpaper relative min-h-screen overflow-hidden text-slate-100"
      data-reduce-transparency={uiPrefs.reduceTransparency || undefined}
    >
      <div
        className="absolute inset-0"
        style={uiPrefs.gradient !== "none" ? { background: gradientStyles[uiPrefs.gradient] } : undefined}
      />

      <header className="desktop-menu-bar fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-1">
          <div className="relative" ref={glassMenuRef}>
            <button
              className={cn(
                "desktop-menu-button flex items-center gap-2 font-semibold text-white",
                (glassMenuOpen || windows.some((w) => w.kind === "about" && !w.minimized)) && "bg-white/10 text-white"
              )}
              onClick={() => setGlassMenuOpen((current) => !current)}
              type="button"
            >
              <PeachLogo className="h-4 w-4" />
              GlassUI
            </button>
            {glassMenuOpen ? (
              <div className="absolute left-0 top-full mt-2 min-w-44 rounded-[14px] border border-white/10 bg-slate-950/85 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white",
                    windows.some((w) => w.kind === "about" && !w.minimized) && "bg-sky-400/15 text-white"
                  )}
                  onClick={() => {
                    openWindow("about");
                    setGlassMenuOpen(false);
                  }}
                  type="button"
                >
                  <Info className="h-4 w-4" />
                  <span className="flex-1">About GlassUI</span>
                </button>
              </div>
            ) : null}
          </div>
          {contextMenus.map((item) =>
            item === "Data" ? (
              <button
                key="Data"
                className={cn("desktop-menu-button", hasOpenDataStudio && "bg-white/10 text-white")}
                onClick={() => openWindow("data-studio")}
                type="button"
              >
                Data
              </button>
            ) : item === "View" ? (
              <div key="View" className="relative" ref={viewMenuRef}>
                <button
                  className={cn("desktop-menu-button", viewMenuOpen && "bg-white/10 text-white")}
                  onClick={() => setViewMenuOpen((current) => !current)}
                  type="button"
                >
                  View
                </button>
                {viewMenuOpen ? (
                  <div className="absolute left-0 top-full mt-2 min-w-52 rounded-[14px] border border-white/10 bg-slate-950/85 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
                    <button
                      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        cascadeWindows();
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      Cascade Windows
                    </button>
                    <button
                      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        tileWindows();
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      Tile Windows
                    </button>
                    <button
                      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        minimizeAll();
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      Minimize All
                    </button>
                    <button
                      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setUiPrefs((current) => ({ ...current, showDock: !current.showDock }));
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      {uiPrefs.showDock ? "Hide Dock" : "Show Dock"}
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        openWindow("options");
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      Options…
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button key={item} className="desktop-menu-button" type="button">
                {item}
              </button>
            )
          )}
          <div className="relative" ref={utilityMenuRef}>
            <button
              className={cn("desktop-menu-button", (utilityMenuOpen || hasOpenUtility) && "bg-white/10 text-white")}
              onClick={() => setUtilityMenuOpen((current) => !current)}
              type="button"
            >
              Utilities
            </button>
            {utilityMenuOpen ? (
              <div className="absolute left-0 top-full mt-2 min-w-52 rounded-[14px] border border-white/10 bg-slate-950/85 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
                {utilityApps.map((app) => {
                  const isOpen = windows.some((windowItem) => windowItem.kind === app.kind && !windowItem.minimized);

                  return (
                    <button
                      key={app.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white",
                        isOpen && "bg-sky-400/15 text-white"
                      )}
                      onClick={() => {
                        openWindow(app.kind);
                        setUtilityMenuOpen(false);
                      }}
                      type="button"
                    >
                      <app.icon className="h-4 w-4" />
                      <span className="flex-1">{app.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {role === "ADMIN" ? (
            <div className="relative" ref={adminMenuRef}>
              <button
                className={cn("desktop-menu-button", (adminMenuOpen || hasOpenAdminWindow) && "bg-white/10 text-white")}
                onClick={() => setAdminMenuOpen((current) => !current)}
                type="button"
              >
                Admin
              </button>
              {adminMenuOpen ? (
                <div className="absolute left-0 top-full mt-2 min-w-56 rounded-[14px] border border-white/10 bg-slate-950/85 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.35)] backdrop-blur-2xl">
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white",
                      windows.some((windowItem) => windowItem.kind === "route" && !windowItem.minimized) && "bg-sky-400/15 text-white"
                    )}
                    onClick={() => {
                      openRouteWindow();
                      setAdminMenuOpen(false);
                    }}
                    type="button"
                  >
                    <Monitor className="h-4 w-4" />
                    <span className="flex-1">Admin Control Plane</span>
                  </button>

                </div>
          ) : null}
        </div>
      ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button className="desktop-status-chip" type="button">
            <Search className="h-4 w-4" />
          </button>
          <button className="desktop-status-chip" type="button">
            <Bell className="h-4 w-4" />
          </button>
          <div className="relative" ref={calendarRef}>
            <button
              className={cn("desktop-status-chip gap-2 px-3 text-xs text-slate-200", calendarOpen && "bg-white/15 text-white")}
              onClick={() => setCalendarOpen((c) => !c)}
              type="button"
              suppressHydrationWarning
            >
              <Wifi className="h-4 w-4" />
              {mounted && now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "--:--"}
            </button>
            {calendarOpen && mounted && now ? <CalendarPopover now={now} /> : null}
          </div>
          <button
            className="desktop-status-chip gap-2 px-3 text-xs font-medium text-slate-100 transition hover:bg-white/15"
            onClick={() => openWindow("profile")}
            type="button"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-300 to-violet-300 text-[11px] font-bold text-slate-950">
              {(userName ?? role).slice(0, 1).toUpperCase()}
            </span>
            {userName ?? role}
          </button>
          <LogoutButton />
        </div>
      </header>

      <main className={cn("relative flex min-h-screen flex-col pt-11", uiPrefs.showDock ? "pb-28" : "pb-0")}>
        <div className="relative flex-1 overflow-hidden bg-slate-950/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[2px]">
          {windows.map((windowItem) => (
            <div key={windowItem.id} className="absolute inset-0" style={{ zIndex: windowItem.zIndex }}>
              <DesktopWindow
                frame={windowItem.frame}
                isFocused={activeWindow?.id === windowItem.id}
                isMaximized={windowItem.maximized}
                isMinimized={windowItem.minimized}
                subtitle={windowItem.subtitle}
                title={windowItem.title}
                onClose={() => closeWindow(windowItem.id)}
                onFocus={() => bringToFront(windowItem.id)}
                onFrameChange={(frame) => updateWindow(windowItem.id, (current) => ({ ...current, frame }))}
                onMinimize={() => updateWindow(windowItem.id, (current) => ({ ...current, minimized: true }))}
                onToggleMaximize={() =>
                  updateWindow(windowItem.id, (current) => ({ ...current, maximized: !current.maximized, minimized: false }))
                }
              >
                {windowItem.kind === "route" ? children : null}
                {windowItem.kind === "sql-explorer" ? <QueryBuilderCard /> : null}
                {windowItem.kind === "visualization-lab" ? <VisualizationCard /> : null}
                {windowItem.kind === "data-studio" ? <DataStudioWindow /> : null}
                {windowItem.kind === "profile" ? <UserProfileWindow role={role} userName={userName} /> : null}

                {windowItem.kind === "about" ? <AboutStudioWindow /> : null}
                {windowItem.kind === "notepad" ? <NotepadAccessory /> : null}
                {windowItem.kind === "calculator" ? <CalculatorAccessory /> : null}
                {windowItem.kind === "stopwatch" ? <StopwatchAccessory /> : null}
                {windowItem.kind === "text-tools" ? <TextToolsAccessory /> : null}
                {windowItem.kind === "options" ? (
                  <DesktopOptionsWindow prefs={uiPrefs} onChange={setUiPrefs} />
                ) : null}
              </DesktopWindow>
            </div>
          ))}
        </div>
      </main>

      {uiPrefs.showDock ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="desktop-dock pointer-events-auto">
            {dockApps.map((app) => {
              const isActive =
                app.windowKind === undefined
                  ? windows.some((windowItem) => windowItem.kind === "route" && !windowItem.minimized)
                  : windows.some((windowItem) => windowItem.kind === app.windowKind && !windowItem.minimized);

              return (
                <button
                  key={app.id}
                  className="group -mt-2 flex flex-col items-center gap-0 pb-1"
                  onClick={() => {
                    if (app.windowKind) {
                      openWindow(app.windowKind);
                      return;
                    }

                    openRouteWindow();
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "desktop-dock-icon",
                      isActive && "border-sky-300/45 bg-sky-300/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_26px_rgba(14,165,233,0.18)]"
                    )}
                  >
                    <app.icon className="h-6 w-6 text-slate-100" />
                  </span>
                  {uiPrefs.dockLabels ? (
                    <span className="text-[10px] font-medium text-slate-200 opacity-0 transition group-hover:opacity-100">
                      {app.label}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
