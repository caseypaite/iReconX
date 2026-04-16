"use client";

import { DatabaseZap, Eye, EyeOff, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";

import {
  adminSettingCategories,
  type AdminSettingCategory,
  type AdminSettingField,
  type AdminSettingKey,
  type AdminSettingValueMap
} from "@/lib/admin/settings-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { DataSourceManager } from "@/components/admin/data-source-manager";
import { UserManager, type ManagedUser } from "@/components/admin/user-manager";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ConsoleSectionKey = AdminSettingCategory | "USER_MANAGEMENT";

const categoryIcons = {
  SECURITY: ShieldCheck,
  IDENTITIES: Users,
  DATA_SOURCES: DatabaseZap
} satisfies Record<AdminSettingCategory, typeof ShieldCheck>;

function buildValueMap(fields: AdminSettingField[]) {
  return fields.reduce(
    (values, field) => {
      values[field.key] = field.value;
      return values;
    },
    {} as AdminSettingValueMap
  );
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Loaded from current environment";
  }

  return `Saved ${new Date(value).toLocaleString()}`;
}

export function AdminSettingsConsole({
  initialFields,
  users
}: {
  initialFields: AdminSettingField[];
  users: ManagedUser[];
}) {
  const [fields, setFields] = useState(initialFields);
  const [values, setValues] = useState<AdminSettingValueMap>(() => buildValueMap(initialFields));
  const [activeCategory, setActiveCategory] = useState<ConsoleSectionKey>("SECURITY");
  const [revealedSecrets, setRevealedSecrets] = useState<Partial<Record<AdminSettingKey, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fieldsByCategory = useMemo(
    () =>
      adminSettingCategories.map((category) => ({
        ...category,
        fields: fields.filter((field) => field.category === category.key)
      })),
    [fields]
  );
  const sections = useMemo(
    () => [
      fieldsByCategory[0],
      fieldsByCategory[1],
      {
        key: "USER_MANAGEMENT" as const,
        label: "User management",
        description: "Review identities, enrollment state, and account access without leaving the control plane.",
        fields: [] as AdminSettingField[]
      },
      fieldsByCategory[2]
    ],
    [fieldsByCategory]
  );

  const activeSection = sections.find((category) => category.key === activeCategory) ?? sections[0];
  const hasUnsavedChanges = activeSection.fields.some((field) => values[field.key] !== field.value);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            fields?: AdminSettingField[];
          }
        | null;

      if (!response.ok || !payload?.fields) {
        setError(payload?.error ?? "Unable to save admin settings.");
        setPending(false);
        return;
      }

      setFields(payload.fields);
      setValues(buildValueMap(payload.fields));
      setMessage(`${activeSection.label} settings saved to the database and current .env file.`);
      setPending(false);
    } catch {
      setError("Unable to save admin settings.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit">
        <HoverSubtitleTitle
          subtitle="Switch between security, identity, and data source settings from one admin console."
          title="Configuration panels"
        />
        <div className="mt-5 space-y-2">
          {sections.map((category) => {
            const Icon = category.key === "USER_MANAGEMENT" ? Users : categoryIcons[category.key];
            const isActive = category.key === activeCategory;
            const dirtyCount = category.fields.filter((field) => values[field.key] !== field.value).length;

            return (
              <button
                key={category.key}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition",
                  isActive
                    ? "border-sky-400/50 bg-sky-400/10 text-white"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                )}
                onClick={() => {
                  setActiveCategory(category.key);
                  setError(null);
                  setMessage(null);
                }}
                type="button"
              >
                <span className="mt-0.5 rounded-full border border-white/10 bg-white/5 p-2">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <HoverHelperLabel
                      helper={category.description}
                      label={category.label}
                      labelClassName="font-medium"
                      wrapperClassName="max-w-full"
                    />
                    {dirtyCount > 0 ? <span className="text-xs text-amber-300">{dirtyCount} unsaved</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <HoverSubtitleTitle subtitle={activeSection.description} title={activeSection.label} />
          </div>
        </div>

        {activeSection.key === "USER_MANAGEMENT" ? (
          <div className="mt-5">
            <UserManager initialUsers={users} />
          </div>
        ) : (
          <div className="mt-5 space-y-8">
            <form className="space-y-5" id="admin-settings-form" onSubmit={saveSettings}>
              {activeSection.fields.map((field) => {
                const isSecret = field.isSecret;
                const isVisible = Boolean(revealedSecrets[field.key]);

                return (
                  <div key={field.key} className="rounded-[18px] border border-white/10 bg-slate-950/35 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <label className="text-sm font-medium text-white" htmlFor={field.key}>
                          {field.label}
                        </label>
                        <p className="mt-1 text-sm text-slate-400">{field.description}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>{field.source === "database" ? "Database override" : field.source === "environment" ? "Environment value" : "Default/blank"}</p>
                        <p className="mt-1">{formatUpdatedAt(field.updatedAt)}</p>
                        {field.updatedByEmail ? <p className="mt-1">Updated by {field.updatedByEmail}</p> : null}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <Input
                        id={field.key}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setValues((current) => ({
                            ...current,
                            [field.key]: nextValue
                          }));
                        }}
                        required={field.required}
                        type={isSecret ? (isVisible ? "text" : "password") : field.inputType}
                        value={values[field.key]}
                      />
                      {isSecret ? (
                        <Button
                          onClick={() =>
                            setRevealedSecrets((current) => ({
                              ...current,
                              [field.key]: !current[field.key]
                            }))
                          }
                          type="button"
                          variant="outline"
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">{field.key}</span>
                      <span className="text-slate-400">{field.helperText}</span>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={pending || !hasUnsavedChanges} type="submit">
                  {pending ? "Saving..." : `Save ${activeSection.label}`}
                </Button>
                <Button
                  disabled={pending || !hasUnsavedChanges}
                  onClick={() => {
                    setValues(buildValueMap(fields));
                    setError(null);
                    setMessage(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset unsaved changes
                </Button>
                <p className="text-sm text-slate-400">
                  Restart env-dependent services after saving to guarantee every runtime picks up new values.
                </p>
                {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
                {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              </div>
            </form>

            {activeSection.key === "DATA_SOURCES" ? <DataSourceManager /> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
