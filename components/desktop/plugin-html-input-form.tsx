"use client";

import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { parsePluginHtmlInputFields, type PluginHtmlInputField } from "@/lib/plugins/html-inputs";

const selectClassName =
  "w-full rounded-none border border-white/10 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-400";
const textAreaClassName =
  "min-h-[88px] w-full rounded-none border border-white/10 bg-slate-950/40 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-sky-400";

function stringifyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return "";
}

function renderField(
  field: PluginHtmlInputField,
  value: unknown,
  onChange: (name: string, value: string | number | boolean) => void
) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 border border-white/10 bg-slate-950/25 px-2 py-2 text-[11px] text-slate-200">
        <input
          checked={Boolean(value)}
          className="mt-0.5 h-3.5 w-3.5 border-white/20 bg-slate-950/50"
          onChange={(event) => onChange(field.name, event.target.checked)}
          type="checkbox"
        />
        <span>
          {field.label}
          {field.description ? <span className="mt-1 block text-[10px] text-slate-500">{field.description}</span> : null}
        </span>
      </label>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          className={textAreaClassName}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          value={stringifyValue(value)}
        />
      ) : null}
      {field.type === "select" ? (
        <select
          className={selectClassName}
          onChange={(event) => onChange(field.name, event.target.value)}
          required={field.required}
          value={stringifyValue(value)}
        >
          {field.options?.map((option) => (
            <option key={`${field.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {field.type === "text" || field.type === "number" || field.type === "date" ? (
        <Input
          className="rounded-none px-2 py-1 text-[11px]"
          max={field.max}
          min={field.min}
          onChange={(event) =>
            onChange(field.name, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)
          }
          placeholder={field.placeholder}
          required={field.required}
          step={field.step}
          type={field.type}
          value={field.type === "number" && typeof value === "number" ? String(value) : stringifyValue(value)}
        />
      ) : null}
      {field.description ? <p className="text-[10px] text-slate-500">{field.description}</p> : null}
    </label>
  );
}

export function PluginHtmlInputForm({
  inputForm,
  values,
  onChange,
  emptyMessage
}: {
  inputForm: string | null | undefined;
  values: Record<string, unknown>;
  onChange: (name: string, value: string | number | boolean) => void;
  emptyMessage?: string;
}) {
  const fields = useMemo(() => parsePluginHtmlInputFields(inputForm), [inputForm]);

  if (fields.length === 0) {
    return <p className="text-xs text-slate-400">{emptyMessage ?? "This plugin does not expose workflow inputs."}</p>;
  }

  return <div className="space-y-2">{fields.map((field) => <div key={field.name}>{renderField(field, values[field.name], onChange)}</div>)}</div>;
}
