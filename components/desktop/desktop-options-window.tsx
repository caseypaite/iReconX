"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export type UiPrefs = {
  gradient: "aurora" | "sunset" | "ocean" | "forest" | "midnight" | "none";
  reduceTransparency: boolean;
  dockLabels: boolean;
};

export const defaultUiPrefs: UiPrefs = {
  gradient: "aurora",
  reduceTransparency: false,
  dockLabels: true,
};

export const gradientStyles: Record<UiPrefs["gradient"], string> = {
  aurora:
    "radial-gradient(circle at top left,rgba(56,189,248,0.22),transparent 25%),radial-gradient(circle at top right,rgba(168,85,247,0.18),transparent 20%),radial-gradient(circle at bottom,rgba(59,130,246,0.12),transparent 35%)",
  sunset:
    "radial-gradient(circle at top left,rgba(251,146,60,0.22),transparent 25%),radial-gradient(circle at top right,rgba(244,63,94,0.18),transparent 20%),radial-gradient(circle at bottom,rgba(234,179,8,0.10),transparent 35%)",
  ocean:
    "radial-gradient(circle at top left,rgba(20,184,166,0.22),transparent 25%),radial-gradient(circle at top right,rgba(6,182,212,0.18),transparent 20%),radial-gradient(circle at bottom,rgba(59,130,246,0.14),transparent 35%)",
  forest:
    "radial-gradient(circle at top left,rgba(34,197,94,0.18),transparent 25%),radial-gradient(circle at top right,rgba(16,185,129,0.16),transparent 20%),radial-gradient(circle at bottom,rgba(101,163,13,0.12),transparent 35%)",
  midnight:
    "radial-gradient(circle at top left,rgba(99,102,241,0.22),transparent 25%),radial-gradient(circle at top right,rgba(139,92,246,0.18),transparent 20%),radial-gradient(circle at bottom,rgba(67,56,202,0.14),transparent 35%)",
  none: "",
};

const gradientLabels: Record<UiPrefs["gradient"], string> = {
  aurora: "Aurora",
  sunset: "Sunset",
  ocean: "Ocean",
  forest: "Forest",
  midnight: "Midnight",
  none: "None",
};

type DesktopOptionsWindowProps = {
  prefs: UiPrefs;
  onChange: (prefs: UiPrefs) => void;
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      aria-checked={on}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors ${on ? "bg-sky-500" : "bg-slate-700"}`}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-1"}`}
      />
    </button>
  );
}

export function DesktopOptionsWindow({ prefs, onChange }: DesktopOptionsWindowProps) {
  const gradientKeys = Object.keys(gradientStyles) as Array<UiPrefs["gradient"]>;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Background Gradient</CardTitle>
        <CardDescription>Choose the ambient glow style for the desktop background.</CardDescription>
        <div className="mt-4 flex flex-wrap gap-3">
          {gradientKeys.map((key) => (
            <button
              key={key}
              className={`flex flex-col items-center gap-1.5 rounded-lg p-1 transition ${
                prefs.gradient === key
                  ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900"
                  : "hover:ring-1 hover:ring-white/20"
              }`}
              onClick={() => onChange({ ...prefs, gradient: key })}
              type="button"
            >
              <div
                className="h-10 w-16 rounded-md bg-slate-900"
                style={key !== "none" ? { background: `${gradientStyles[key]}, #0f172a` } : { background: "#0f172a" }}
              />
              <span className="text-[11px] text-slate-300">{gradientLabels[key]}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Accessibility</CardTitle>
        <CardDescription>Adjust visual effects to suit your preferences.</CardDescription>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Reduce transparency</p>
              <p className="text-xs text-slate-400">Uses solid backgrounds instead of glass blur effects.</p>
            </div>
            <Toggle
              on={prefs.reduceTransparency}
              onToggle={() => onChange({ ...prefs, reduceTransparency: !prefs.reduceTransparency })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Dock</CardTitle>
        <CardDescription>Customize the application dock behaviour.</CardDescription>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Show dock labels</p>
              <p className="text-xs text-slate-400">Display app name labels under dock icons.</p>
            </div>
            <Toggle
              on={prefs.dockLabels}
              onToggle={() => onChange({ ...prefs, dockLabels: !prefs.dockLabels })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
