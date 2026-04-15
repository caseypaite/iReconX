"use client";

import { DataSourceType } from "@prisma/client";
import { Eye, EyeOff, PlusCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdminAssignableUser, AdminDataSourceRecord } from "@/lib/admin/data-sources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DataSourceFormState = {
  name: string;
  description: string;
  type: DataSourceType;
  host: string;
  port: string;
  schema: string;
  username: string;
  password: string;
  allowedUserIds: string[];
};

const initialForm: DataSourceFormState = {
  name: "",
  description: "",
  type: DataSourceType.POSTGRESQL,
  host: "",
  port: "5432",
  schema: "",
  username: "",
  password: "",
  allowedUserIds: []
};

const typeLabels: Record<DataSourceType, string> = {
  POSTGRESQL: "PostgreSQL",
  MYSQL: "MySQL",
  MONGODB: "MongoDB",
  REST_API: "REST API",
  S3: "Amazon S3",
  BIGQUERY: "BigQuery"
};

function buildFormState(dataSource: AdminDataSourceRecord): DataSourceFormState {
  return {
    name: dataSource.name,
    description: dataSource.description,
    type: dataSource.type,
    host: dataSource.config.host,
    port: `${dataSource.config.port}`,
    schema: dataSource.config.schema,
    username: dataSource.config.username,
    password: dataSource.config.password,
    allowedUserIds: dataSource.allowedUserIds
  };
}

function defaultPortForType(type: DataSourceType) {
  return type === DataSourceType.MYSQL ? "3306" : "5432";
}

export function DataSourceManager() {
  const [dataSources, setDataSources] = useState<AdminDataSourceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<DataSourceFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AdminAssignableUser[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDataSource = useMemo(
    () => dataSources.find((dataSource) => dataSource.id === selectedId) ?? null,
    [dataSources, selectedId]
  );

  const loadDataSources = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/data-sources", {
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            dataSources?: AdminDataSourceRecord[];
            users?: AdminAssignableUser[];
          }
        | null;

      if (!response.ok || !payload?.dataSources || !payload.users) {
        setError(payload?.error ?? "Unable to load governed data sources.");
        setLoading(false);
        return;
      }

      setDataSources(payload.dataSources);
      setAssignableUsers(payload.users);

      const resolvedSelection =
        (nextSelectedId && payload.dataSources.find((dataSource) => dataSource.id === nextSelectedId)?.id) ??
        (selectedId && payload.dataSources.find((dataSource) => dataSource.id === selectedId)?.id) ??
        null;

      setSelectedId(resolvedSelection);
      setForm(resolvedSelection ? buildFormState(payload.dataSources.find((dataSource) => dataSource.id === resolvedSelection)!) : initialForm);
      setLoading(false);
    } catch {
      setError("Unable to load governed data sources.");
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadDataSources();
  }, [loadDataSources]);

  async function saveDataSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/data-sources", {
        method: selectedId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(selectedId ? { id: selectedId } : {}),
          name: form.name,
          description: form.description,
          type: form.type,
          config: {
            host: form.host,
            port: Number(form.port),
            schema: form.schema,
            username: form.username,
            password: form.password
          },
          allowedUserIds: form.allowedUserIds
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            dataSource?: AdminDataSourceRecord;
          }
        | null;

      if (!response.ok || !payload?.dataSource) {
        setError(payload?.error ?? "Unable to save data source.");
        setSaving(false);
        return;
      }

      await loadDataSources(payload.dataSource.id);
      setMessage(selectedId ? "Data source updated." : "Data source created.");
      setSaving(false);
    } catch {
      setError("Unable to save data source.");
      setSaving(false);
    }
  }

  function startNewDataSource() {
    setSelectedId(null);
    setForm(initialForm);
    setShowPassword(false);
    setMessage(null);
    setError(null);
  }

  function selectDataSource(dataSource: AdminDataSourceRecord) {
    setSelectedId(dataSource.id);
    setForm(buildFormState(dataSource));
    setShowPassword(false);
    setMessage(null);
    setError(null);
  }

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Governed data sources</p>
          <p className="mt-1 text-sm text-slate-400">
            Create and edit encrypted connection definitions with a simple host, port, schema, username, and password model.
          </p>
        </div>
        <Button onClick={startNewDataSource} type="button" variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          New data source
        </Button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {loading ? <p className="text-sm text-slate-400">Loading governed data sources...</p> : null}
          {!loading && dataSources.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-5 text-sm text-slate-400">
              No governed data sources yet.
            </p>
          ) : null}
          {dataSources.map((dataSource) => (
            <button
              key={dataSource.id}
              className={cn(
                "w-full rounded-[18px] border px-4 py-3 text-left transition",
                selectedId === dataSource.id
                  ? "border-sky-400/50 bg-sky-400/10 text-white"
                  : "border-white/10 bg-slate-950/20 text-slate-200 hover:bg-white/10"
              )}
              onClick={() => selectDataSource(dataSource)}
              type="button"
            >
              <p className="font-medium">{dataSource.name}</p>
              <p className="mt-1 text-xs text-slate-400">{typeLabels[dataSource.type]}</p>
              <p className="mt-2 text-xs text-slate-500">
                {dataSource.config.host}:{dataSource.config.port}
              </p>
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={saveDataSource}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-name">
                Name
              </label>
              <Input
                id="data-source-name"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Primary warehouse"
                value={form.name}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-type">
                Type
              </label>
              <select
                className="w-full rounded-[18px] border border-white/10 bg-slate-950/40 px-3.5 py-2.5 text-sm text-slate-100 outline-none backdrop-blur-xl focus:border-sky-400"
                id="data-source-type"
                onChange={(event) => {
                  const nextType = event.target.value as DataSourceType;
                  setForm((current) => ({
                    ...current,
                    type: nextType,
                    port: current.port.length > 0 ? current.port : defaultPortForType(nextType)
                  }));
                }}
                value={form.type}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-description">
                Description
              </label>
              <Input
                id="data-source-description"
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Operational reporting database"
                value={form.description}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-host">
                Hostname / IP
              </label>
              <Input
                id="data-source-host"
                onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
                placeholder="db.internal.local"
                value={form.host}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-port">
                Port
              </label>
              <Input
                id="data-source-port"
                inputMode="numeric"
                onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
                placeholder={defaultPortForType(form.type)}
                value={form.port}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-schema">
                Schema
              </label>
              <Input
                id="data-source-schema"
                onChange={(event) => setForm((current) => ({ ...current, schema: event.target.value }))}
                placeholder="analytics"
                value={form.schema}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-username">
                Username
              </label>
              <Input
                id="data-source-username"
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="readonly_user"
                value={form.username}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="data-source-password">
                Password
              </label>
              <div className="flex gap-3">
                <Input
                  id="data-source-password"
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                />
                <Button onClick={() => setShowPassword((current) => !current)} type="button" variant="outline">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-200">Allowed users</label>
              <div className="grid gap-2 rounded-[18px] border border-white/10 bg-slate-950/20 p-4 md:grid-cols-2">
                {assignableUsers.length === 0 ? (
                  <p className="text-sm text-slate-400">No registered users available to assign yet.</p>
                ) : (
                  assignableUsers.map((user) => {
                    const checked = form.allowedUserIds.includes(user.id);

                    return (
                      <label key={user.id} className="flex items-start gap-3 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200">
                        <input
                          checked={checked}
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950/50"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              allowedUserIds: event.target.checked
                                ? [...current.allowedUserIds, user.id]
                                : current.allowedUserIds.filter((value) => value !== user.id)
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-medium text-white">{user.name || user.email}</span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {user.email} · {user.role} · {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-slate-400">Choose the registered users who should be allowed to access this governed data source.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={saving} type="submit">
              {saving ? "Saving..." : selectedDataSource ? "Update data source" : "Create data source"}
            </Button>
            <Button disabled={saving} onClick={startNewDataSource} type="button" variant="outline">
              Clear form
            </Button>
            {selectedDataSource ? <p className="text-sm text-slate-400">Editing {selectedDataSource.name}.</p> : null}
            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
