import { useEffect, useState } from "react";
import { DayPicker, DateRange } from "react-day-picker";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function diffDaysInclusive(from: Date, to: Date) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return days + 1; // inclusive
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseRequestedDays(raw: string, fallback: number, min: number, max: number) {
  const cleaned = raw.trim();
  if (!cleaned) return clamp(fallback, min, max);
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return clamp(fallback, min, max);
  return clamp(Math.round(parsed), min, max);
}

// NEW: clamp a date to [minDate, maxDate]
function clampDate(d: Date, minDate: Date, maxDate: Date) {
  const t = startOfDay(d).getTime();
  const minT = startOfDay(minDate).getTime();
  const maxT = startOfDay(maxDate).getTime();
  if (t < minT) return startOfDay(minDate);
  if (t > maxT) return startOfDay(maxDate);
  return startOfDay(d);
}

type Props = {
  minDays?: number;
  maxDays?: number;
  initialDays?: number;
  onChange?: (value: { startDate?: Date; endDate?: Date; days: number }) => void;
};

export default function DaysRangePicker({
  minDays = 1,
  maxDays = 14,
  initialDays = 1,
  onChange,
}: Props) {
  const [days, setDays] = useState<number>(clamp(initialDays, minDays, maxDays));
  const [daysInput, setDaysInput] = useState<string>(String(clamp(initialDays, minDays, maxDays)));
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  // define allowed booking window: today -> 3 months out
  const today = startOfDay(new Date());
  const maxDate = startOfDay(new Date());
  maxDate.setMonth(maxDate.getMonth() + 3);

  // Helpful derived values
  const startDate = range?.from;
  const endDate = range?.to;

  function formatDateMMDDYYYY(date: Date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }

  function commitDaysInput(rawValue: string) {
    const nextDays = parseRequestedDays(rawValue, days, minDays, maxDays);
    setDays(nextDays);
    setDaysInput(String(nextDays));
  }

  function getRequestedDaysFromInput() {
    return parseRequestedDays(daysInput, days, minDays, maxDays);
  }

  useEffect(() => {
    setDaysInput(String(days));
  }, [days]);

  useEffect(() => {
    if (!startDate) return;

    const desiredTo = addDays(startDate, days - 1);
    const newTo = clampDate(desiredTo, today, maxDate);

    const newDays = clamp(diffDaysInclusive(startDate, newTo), minDays, maxDays);
    setDays(newDays);

    setRange({ from: startDate, to: newTo });
    onChange?.({ startDate, endDate: newTo, days: newDays });

  }, [days]);

  function handleSelect(next: DateRange | undefined) {
    if (!next?.from) {
      setRange(undefined);
      onChange?.({ startDate: undefined, endDate: undefined, days });
      return;
    }

    const clampedFrom = clampDate(next.from, today, maxDate);

    //if user only picked a start date, keep days and compute end date
    if (!next.to) {
      const requestedDays = getRequestedDaysFromInput();
      const desiredTo = addDays(clampedFrom, requestedDays - 1);
      const clampedTo = clampDate(desiredTo, today, maxDate);

      const computedDays = clamp(diffDaysInclusive(clampedFrom, clampedTo), minDays, maxDays);

      const newRange = { from: clampedFrom, to: clampedTo };
      setDays(computedDays);
      setRange(newRange);
      onChange?.({ startDate: newRange.from, endDate: newRange.to, days: computedDays });
      return;
    }

    const clampedTo = clampDate(next.to, today, maxDate);
    const computedDays = clamp(diffDaysInclusive(clampedFrom, clampedTo), minDays, maxDays);

    const finalTo = clampDate(addDays(clampedFrom, computedDays - 1), today, maxDate);
    const finalDays = clamp(diffDaysInclusive(clampedFrom, finalTo), minDays, maxDays);

    const newRange = { from: clampedFrom, to: finalTo };
    setDays(finalDays);
    setRange(newRange);
    onChange?.({ startDate: newRange.from, endDate: newRange.to, days: finalDays });
  }

return (
  <div className="chFormGrid">
    {/*Days*/}
    <div style={{ display: "grid", gap: 10 }}>
      <label
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#000",
          fontWeight: 500,
        }}
      >
        # OF DAYS
      </label>

      <div style={{ position: "relative" }}>
        <input
          type="number"
          className="noSpinnerInput"
          value={daysInput}
          min={minDays}
          max={maxDays}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              setDaysInput("");
              return;
            }
            const digitsOnly = raw.replace(/\D/g, "");
            setDaysInput(digitsOnly);
          }}
          onBlur={(e) => commitDaysInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
            }
          }}
          onWheel={(e) => e.currentTarget.blur()}
          inputMode="numeric"
          style={{
            width: "100%",
            height: 42,
            border: "1px solid #DEDEDE",
            borderRadius: 6,
            padding: "0 64px 0 12px",
            background: "#fff",
            fontFamily: "inherit",
            fontSize: 14,
            color: "#111",
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            height: "100%",
            width: 56,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderTopRightRadius: 6,
            borderBottomRightRadius: 6,
            overflow: "hidden",
            background: "#fff",
            zIndex: 1,
          }}
        >
          <button
            type="button"
            aria-label="Decrease number of days"
            onClick={() => setDays((prev) => clamp(prev - 1, minDays, maxDays))}
            style={{
              border: "1px solid #DEDEDE",
              borderRight: 0,
              background: "transparent",
              color: "rgba(0,0,0,0.55)",
              fontSize: 16,
              fontWeight: 500,
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Increase number of days"
            onClick={() => setDays((prev) => clamp(prev + 1, minDays, maxDays))}
            style={{
              border: "1px solid #DEDEDE",
              background: "transparent",
              color: "rgba(0,0,0,0.55)",
              fontSize: 16,
              fontWeight: 500,
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
          >
            +
          </button>
        </div>

        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid #DEDEDE",
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      </div>
    </div>

    {/* Calendar */}
    <div className="chCalendarShell">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={handleSelect}
        numberOfMonths={1}
        fromDate={today}
        toDate={maxDate}
        fromMonth={today}
        toMonth={maxDate}
        disabled={[{ before: today }, { after: maxDate }]}
      />

      <div className="chHelperText">
        {startDate && endDate ? (
          <>
            {formatDateMMDDYYYY(startDate)} - {formatDateMMDDYYYY(endDate)} ({days} {days === 1 ? "day" : "days"})
          </>
        ) : (
          <>Select a start date to generate the range.</>
        )}
      </div>
    </div>
  </div>
);
}