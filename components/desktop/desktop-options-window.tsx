"use client";

import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";

export type UiPrefs = {
  theme: "dark" | "light" | "high-contrast";
  gradient: "aurora" | "sunset" | "ocean" | "forest" | "midnight" | "light" | "none";
  reduceTransparency: boolean;
  showDock: boolean;
  dockLabels: boolean;
  menuBarScale: 90 | 100 | 110 | 120;
  workspaceScale: 90 | 100 | 110 | 120;
  dockScale: 90 | 100 | 110 | 120;
};

export const defaultUiPrefs: UiPrefs = {
  theme: "dark",
  gradient: "aurora",
  reduceTransparency: false,
  showDock: true,
  dockLabels: true,
  menuBarScale: 100,
  workspaceScale: 100,
  dockScale: 100,
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
  light:
    "radial-gradient(circle at top left,rgba(255,255,255,0.32),transparent 24%),radial-gradient(circle at top right,rgba(186,230,253,0.26),transparent 22%),radial-gradient(circle at bottom,rgba(221,214,254,0.18),transparent 34%)",
  none: "",
};

const gradientLabels: Record<UiPrefs["gradient"], string> = {
  aurora: "Aurora",
  sunset: "Sunset",
  ocean: "Ocean",
  forest: "Forest",
  midnight: "Midnight",
  light: "Light",
  none: "None",
};

const themeLabels: Record<UiPrefs["theme"], string> = {
  dark: "Dark",
  light: "Light",
  "high-contrast": "High Contrast"
};

const themePreviewStyles: Record<UiPrefs["theme"], React.CSSProperties> = {
  dark: {
    background:
      "linear-gradient(180deg, rgba(30,41,59,0.95) 0%, rgba(2,6,23,0.98) 100%), radial-gradient(circle at top left, rgba(56,189,248,0.22), transparent 42%)"
  },
  light: {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(226,232,240,0.98) 100%), radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 42%)"
  },
  "high-contrast": {
    background:
      "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(0,0,0,1) 100%), radial-gradient(circle at top left, rgba(250,204,21,0.18), transparent 40%)"
  }
};

const scaleOptions = [
  { value: 90, label: "90%" },
  { value: 100, label: "100%" },
  { value: 110, label: "110%" },
  { value: 120, label: "120%" }
] as const;

type DesktopOptionsWindowProps = {
  prefs: UiPrefs;
  onChange: (prefs: UiPrefs) => void;
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      aria-checked={on}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        on ? "bg-sky-500" : "desktop-toggle-off"
      }`}
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
        <HoverSubtitleTitle subtitle="Switch the desktop chrome between dark, light, and high-contrast presets." title="Theme" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(Object.keys(themeLabels) as Array<UiPrefs["theme"]>).map((theme) => (
            <button
              key={theme}
              className={`rounded-xl border p-3 text-left transition ${
                prefs.theme === theme
                  ? "border-sky-400 ring-2 ring-sky-400 ring-offset-2 [--tw-ring-offset-color:var(--desktop-wallpaper-base)]"
                  : "border-white/10 hover:border-white/20"
              }`}
              onClick={() => onChange({ ...prefs, theme })}
              type="button"
            >
              <div className="h-12 rounded-lg border border-black/10" style={themePreviewStyles[theme]} />
              <p className="mt-2 text-sm font-semibold desktop-form-label">{themeLabels[theme]}</p>
              <p className="text-xs desktop-subtle-text">
                {theme === "dark"
                  ? "Glass-focused desktop chrome."
                  : theme === "light"
                    ? "Brighter shell surfaces and menus."
                    : "Sharper borders and stronger contrast."}
              </p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <HoverSubtitleTitle
          subtitle="Choose the ambient glow style for the desktop background."
          title="Background Gradient"
        />
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
              <span className="text-[11px] desktop-subtle-text">{gradientLabels[key]}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <HoverSubtitleTitle subtitle="Adjust visual effects to suit your preferences." title="Accessibility" />
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <HoverHelperLabel
                helper="Uses solid backgrounds instead of glass blur effects."
                label="Reduce transparency"
                labelClassName="desktop-form-label text-sm font-medium"
              />
            </div>
            <Toggle
              on={prefs.reduceTransparency}
              onToggle={() => onChange({ ...prefs, reduceTransparency: !prefs.reduceTransparency })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <HoverSubtitleTitle
          subtitle="Increase font sizes for the desktop chrome, workspace windows, and dock independently."
          title="Typography"
        />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="desktop-form-label text-sm font-medium">Menu bar</span>
            <select
              className="desktop-select w-full rounded-lg px-3 py-2 text-sm outline-none"
              onChange={(event) =>
                onChange({ ...prefs, menuBarScale: Number(event.target.value) as UiPrefs["menuBarScale"] })
              }
              value={prefs.menuBarScale}
            >
              {scaleOptions.map((option) => (
                <option key={`menu-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="desktop-form-label text-sm font-medium">Workspace</span>
            <select
              className="desktop-select w-full rounded-lg px-3 py-2 text-sm outline-none"
              onChange={(event) =>
                onChange({ ...prefs, workspaceScale: Number(event.target.value) as UiPrefs["workspaceScale"] })
              }
              value={prefs.workspaceScale}
            >
              {scaleOptions.map((option) => (
                <option key={`workspace-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="desktop-form-label text-sm font-medium">Dock</span>
            <select
              className="desktop-select w-full rounded-lg px-3 py-2 text-sm outline-none"
              onChange={(event) =>
                onChange({ ...prefs, dockScale: Number(event.target.value) as UiPrefs["dockScale"] })
              }
              value={prefs.dockScale}
            >
              {scaleOptions.map((option) => (
                <option key={`dock-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <HoverSubtitleTitle subtitle="Customize the application dock behaviour." title="Dock" />
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <HoverHelperLabel
                helper="Display the app launcher dock at the bottom of the screen."
                label="Show dock"
                labelClassName="desktop-form-label text-sm font-medium"
              />
            </div>
            <Toggle on={prefs.showDock} onToggle={() => onChange({ ...prefs, showDock: !prefs.showDock })} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <HoverHelperLabel
                helper="Display app name labels under dock icons."
                label="Show dock labels"
                labelClassName="desktop-form-label text-sm font-medium"
              />
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
