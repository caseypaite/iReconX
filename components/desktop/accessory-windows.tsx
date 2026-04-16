"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Pin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { cn } from "@/lib/utils";

function AccessoryPanel({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-950/35">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <HoverHelperLabel
              helper={description}
              label={title}
              labelClassName="text-sm font-semibold text-white"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}

type NoteRecord = {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

const noteColors: Record<string, { bg: string; dot: string; ring: string }> = {
  yellow:  { bg: "bg-yellow-400/8",  dot: "bg-yellow-300",  ring: "ring-yellow-400/40" },
  pink:    { bg: "bg-pink-400/8",    dot: "bg-pink-400",    ring: "ring-pink-400/40" },
  blue:    { bg: "bg-sky-400/8",     dot: "bg-sky-400",     ring: "ring-sky-400/40" },
  green:   { bg: "bg-emerald-400/8", dot: "bg-emerald-400", ring: "ring-emerald-400/40" },
  purple:  { bg: "bg-violet-400/8",  dot: "bg-violet-400",  ring: "ring-violet-400/40" },
  slate:   { bg: "bg-slate-400/8",   dot: "bg-slate-400",   ring: "ring-slate-400/40" },
};

export function NotepadAccessory() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    fetch("/api/notes")
      .then((r) => r.json())
      .then((data: { notes: NoteRecord[] }) => {
        setNotes(data.notes);
        if (data.notes.length > 0) {
          setSelectedId(data.notes[0].id);
          setContent(data.notes[0].content);
        }
      })
      .catch(() => {});
  }, []);

  const selectNote = useCallback((note: NoteRecord) => {
    setSelectedId(note.id);
    setContent(note.content);
    setSaveStatus("idle");
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const createNote = useCallback(() => {
    fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json())
      .then((data: { note: NoteRecord }) => {
        setNotes((prev) => [data.note, ...prev]);
        setSelectedId(data.note.id);
        setContent(data.note.content);
        setSaveStatus("idle");
      })
      .catch(() => {});
  }, []);

  const deleteNote = useCallback((id: string) => {
    fetch(`/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      const idx = prev.findIndex((n) => n.id === id);
      const nextSelected = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      setSelectedId(nextSelected?.id ?? null);
      setContent(nextSelected?.content ?? "");
      return next;
    });
  }, []);

  const togglePin = useCallback((note: NoteRecord) => {
    const pinned = !note.pinned;
    fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }).catch(() => {});
    setNotes((prev) => {
      const updated = prev.map((n) => n.id === note.id ? { ...n, pinned } : n);
      return [...updated].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    });
  }, []);

  const changeColor = useCallback((colorKey: string) => {
    if (!selectedNote) return;
    fetch(`/api/notes/${selectedNote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: colorKey }),
    }).catch(() => {});
    setNotes((prev) => prev.map((n) => n.id === selectedNote.id ? { ...n, color: colorKey } : n));
  }, [selectedNote]);

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    setSaveStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    debounceRef.current = setTimeout(() => {
      if (!selectedId) return;
      const now = new Date().toISOString();
      setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, content: value, updatedAt: now } : n));
      fetch(`/api/notes/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      })
        .then(() => {
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch(() => setSaveStatus("idle"));
    }, 800);
  }, [selectedId]);

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content]
  );

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="flex w-44 shrink-0 flex-col border-r border-white/10">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Notes</span>
          <button onClick={createNote} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => selectNote(note)}
              className={cn(
                "w-full text-left px-2.5 py-2 rounded-[10px] flex items-start gap-2 text-xs transition",
                note.id === selectedId
                  ? "bg-sky-400/15 text-white"
                  : "text-slate-400 hover:bg-white/8 hover:text-slate-200"
              )}
            >
              <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", noteColors[note.color]?.dot ?? "bg-yellow-300")} />
              <span className="line-clamp-2 leading-relaxed">
                {note.content.trim().slice(0, 60) || "Empty note"}
              </span>
              {note.pinned && <Pin className="ml-auto mt-0.5 h-2.5 w-2.5 shrink-0 text-sky-400" />}
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      {selectedNote ? (
        <div className={cn("flex flex-1 flex-col min-w-0", noteColors[selectedNote.color]?.bg ?? "")}>
          {/* Top bar */}
          <div className="flex h-10 items-center gap-1.5 border-b border-white/10 px-3 shrink-0">
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", noteColors[selectedNote.color]?.dot ?? "bg-yellow-300")} />
            <span className="flex-1 truncate text-xs text-slate-300">
              {selectedNote.content.trim().slice(0, 40) || "New note"}
            </span>
            <button
              onClick={() => togglePin(selectedNote)}
              className={cn("rounded p-1 transition", selectedNote.pinned ? "text-sky-300" : "text-slate-500 hover:text-slate-300")}
              title={selectedNote.pinned ? "Unpin" : "Pin"}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => deleteNote(selectedNote.id)}
              className="rounded p-1 text-slate-500 transition hover:text-rose-400"
              title="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={createNote}
              className="rounded p-1 text-slate-500 transition hover:text-white"
              title="New note"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            className="resize-none w-full flex-1 min-h-0 bg-transparent p-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Start writing..."
            spellCheck={false}
          />

          {/* Status bar */}
          <div className="flex h-8 shrink-0 items-center justify-between border-t border-white/10 px-3">
            <span className="text-[10px] text-slate-500">
              {content.length} chars · {wordCount} words
              {saveStatus === "saving" ? " · Saving…" : saveStatus === "saved" ? " · Saved" : ""}
            </span>
            <div className="flex items-center gap-1">
              {Object.keys(noteColors).map((colorKey) => (
                <button
                  key={colorKey}
                  onClick={() => changeColor(colorKey)}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full transition ring-offset-1",
                    noteColors[colorKey].dot,
                    selectedNote.color === colorKey ? `ring-2 ${noteColors[colorKey].ring}` : ""
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <p className="text-sm">No notes yet</p>
          <button
            onClick={createNote}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
          >
            Create your first note
          </button>
        </div>
      )}
    </div>
  );
}

type CalculatorOperator = "+" | "-" | "*" | "/";

function isEditableEventTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function applyCalculation(left: number, right: number, operator: CalculatorOperator) {
  if (operator === "+") {
    return left + right;
  }

  if (operator === "-") {
    return left - right;
  }

  if (operator === "*") {
    return left * right;
  }

  return right === 0 ? NaN : left / right;
}

function formatCalculatorValue(value: number) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  const normalized = Number.parseFloat(value.toFixed(8));
  return `${normalized}`;
}

export function CalculatorAccessory({ isFocused = false }: { isFocused?: boolean }) {
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<CalculatorOperator | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  const inputDigit = useCallback((digit: string) => {
    setDisplay((current) => {
      if (overwrite || current === "Error") {
        setOverwrite(false);
        return digit;
      }

      return current === "0" ? digit : `${current}${digit}`;
    });
  }, [overwrite]);

  const inputDecimal = useCallback(() => {
    setDisplay((current) => {
      if (overwrite || current === "Error") {
        setOverwrite(false);
        return "0.";
      }

      return current.includes(".") ? current : `${current}.`;
    });
  }, [overwrite]);

  const clearAll = useCallback(() => {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setOverwrite(true);
  }, []);

  const commitOperator = useCallback((nextOperator: CalculatorOperator) => {
    const currentValue = Number.parseFloat(display);

    if (!Number.isFinite(currentValue)) {
      clearAll();
      return;
    }

    if (storedValue === null || operator === null) {
      setStoredValue(currentValue);
    } else {
      const result = applyCalculation(storedValue, currentValue, operator);
      setStoredValue(result);
      setDisplay(formatCalculatorValue(result));
    }

    setOperator(nextOperator);
    setOverwrite(true);
  }, [clearAll, display, operator, storedValue]);

  const resolveCalculation = useCallback(() => {
    if (operator === null || storedValue === null) {
      return;
    }

    const currentValue = Number.parseFloat(display);
    const result = applyCalculation(storedValue, currentValue, operator);

    setDisplay(formatCalculatorValue(result));
    setStoredValue(null);
    setOperator(null);
    setOverwrite(true);
  }, [display, operator, storedValue]);

  function toggleSign() {
    if (display === "0" || display === "Error") {
      return;
    }

    setDisplay((current) => `${Number.parseFloat(current) * -1}`);
  }

  function applyPercent() {
    if (display === "Error") {
      return;
    }

    setDisplay((current) => `${Number.parseFloat(current) / 100}`);
    setOverwrite(true);
  }

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableEventTarget(event.target)) {
        return;
      }

      if (event.code.startsWith("Numpad") && event.code.length === "Numpad0".length) {
        inputDigit(event.code.slice(-1));
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadDecimal") {
        inputDecimal();
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadAdd") {
        commitOperator("+");
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadSubtract") {
        commitOperator("-");
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadMultiply") {
        commitOperator("*");
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadDivide") {
        commitOperator("/");
        event.preventDefault();
        return;
      }

      if (event.code === "NumpadEnter") {
        resolveCalculation();
        event.preventDefault();
        return;
      }

      if (event.code === "Escape") {
        clearAll();
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearAll, commitOperator, inputDecimal, inputDigit, isFocused, resolveCalculation]);

  const buttons = [
    ["C", "+/-", "%", "/"],
    ["7", "8", "9", "*"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"]
  ];

  return (
    <AccessoryPanel title="Calculator" description="Quick arithmetic without leaving the dashboard.">
      <div className="flex h-full min-h-[320px] flex-col gap-4">
        <div className="rounded-[18px] border border-white/10 bg-slate-950/75 px-4 py-5 text-right">
          <p className="text-xs text-slate-500">{operator ?? "\u00A0"}</p>
          <p className="truncate text-3xl font-semibold text-white">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {buttons.flat().map((key) => {
            const isOperator = ["/", "*", "-", "+"].includes(key);

            return (
              <Button
                key={key}
                className="h-12"
                onClick={() => {
                  if (key === "C") {
                    clearAll();
                    return;
                  }

                  if (key === "+/-") {
                    toggleSign();
                    return;
                  }

                  if (key === "%") {
                    applyPercent();
                    return;
                  }

                  if (isOperator) {
                    commitOperator(key as CalculatorOperator);
                    return;
                  }

                  inputDigit(key);
                }}
                type="button"
                variant={isOperator ? "default" : "outline"}
              >
                {key}
              </Button>
            );
          })}
          <Button className="col-span-2 h-12" onClick={() => inputDigit("0")} type="button" variant="outline">
            0
          </Button>
          <Button className="h-12" onClick={inputDecimal} type="button" variant="outline">
            .
          </Button>
          <Button className="h-12" onClick={resolveCalculation} type="button">
            =
          </Button>
        </div>
      </div>
    </AccessoryPanel>
  );
}

function formatElapsedTime(totalMs: number) {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const centiseconds = Math.floor((totalMs % 1000) / 10)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}.${centiseconds}`;
}

export function StopwatchAccessory() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running || startedAtRef.current === null) {
      if (!running) {
        startedAtRef.current = null;
      }
      return;
    }

    const interval = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 20);

    return () => window.clearInterval(interval);
  }, [running]);

  return (
    <AccessoryPanel title="Stopwatch" description="Track quick timings for queries, checks, or manual runs.">
      <div className="flex h-full min-h-[320px] flex-col gap-4">
        <div className="rounded-[18px] border border-white/10 bg-slate-950/75 px-4 py-5 text-center">
          <p className="text-4xl font-semibold tabular-nums text-white">{formatElapsedTime(elapsedMs)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              if (running) {
                setRunning(false);
                return;
              }

              startedAtRef.current = Date.now() - elapsedMs;
              setRunning(true);
            }}
            type="button"
          >
            {running ? "Pause" : "Start"}
          </Button>
          <Button onClick={() => setLaps((current) => [elapsedMs, ...current].slice(0, 6))} type="button" variant="outline">
            Lap
          </Button>
          <Button
            onClick={() => {
              setRunning(false);
              setElapsedMs(0);
              setLaps([]);
            }}
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        </div>
        <div className="grid gap-2">
          {laps.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
              No laps recorded yet.
            </div>
          ) : (
            laps.map((lap, index) => (
              <div
                key={`${lap}-${index}`}
                className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
              >
                <span className="text-slate-300">Lap {laps.length - index}</span>
                <span className="font-medium tabular-nums text-white">{formatElapsedTime(lap)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AccessoryPanel>
  );
}

function toTitleCase(text: string) {
  return text.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export function TextToolsAccessory() {
  const [text, setText] = useState("");

  const stats = useMemo(() => {
    const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
    const lines = text.length === 0 ? 0 : text.split("\n").length;

    return {
      words,
      lines,
      characters: text.length
    };
  }, [text]);

  return (
    <AccessoryPanel title="Text Tools" description="Case conversion and quick text metrics for ad-hoc cleanup.">
      <div className="flex h-full min-h-[320px] flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{stats.characters} chars</Badge>
          <Badge>{stats.words} words</Badge>
          <Badge>{stats.lines} lines</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setText((current) => current.toUpperCase())} type="button" variant="outline">
            UPPERCASE
          </Button>
          <Button onClick={() => setText((current) => current.toLowerCase())} type="button" variant="outline">
            lowercase
          </Button>
          <Button onClick={() => setText((current) => toTitleCase(current))} type="button" variant="outline">
            Title Case
          </Button>
          <Button onClick={() => setText((current) => current.trim())} type="button" variant="ghost">
            Trim
          </Button>
        </div>
        <textarea
          className="min-h-0 flex-1 resize-none rounded-[18px] border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400"
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste text here to normalize casing and inspect counts..."
          spellCheck={false}
          value={text}
        />
      </div>
    </AccessoryPanel>
  );
}
