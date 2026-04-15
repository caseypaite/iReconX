"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type CalendarPopoverProps = {
  now: Date;
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarPopover({ now }: CalendarPopoverProps) {
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  const cells = buildCalendarGrid(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function goToday() {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
  }

  const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth;

  return (
    <div className="absolute right-0 top-full z-[200] mt-2 w-72 rounded-[18px] border border-white/10 bg-slate-950/90 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.5)] backdrop-blur-2xl">
      {/* Time + date header */}
      <div className="mb-4 border-b border-white/10 pb-4 text-center">
        <p className="text-4xl font-semibold tabular-nums text-white" suppressHydrationWarning>
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
        <p className="mt-1 text-sm text-slate-400" suppressHydrationWarning>
          {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={prevMonth}
          type="button"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className={cn(
            "rounded-lg px-2 py-0.5 text-sm font-medium transition",
            isCurrentMonth ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
          )}
          onClick={goToday}
          type="button"
          title="Jump to today"
        >
          {MONTHS[viewMonth]} {viewYear}
        </button>
        <button
          className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={nextMonth}
          type="button"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {d}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          const isToday = isCurrentMonth && day === todayDate;
          return (
            <span
              key={i}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs mx-auto",
                day === null && "invisible",
                day !== null && !isToday && "text-slate-300 hover:bg-white/10 cursor-default",
                isToday && "bg-sky-500 font-semibold text-white shadow-[0_0_10px_rgba(14,165,233,0.4)]"
              )}
            >
              {day ?? ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
