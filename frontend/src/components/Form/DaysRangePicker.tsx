import { useEffect, useState } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";

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
  return days + 1; //inclusive
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
  durationLabel?: "days" | "nights";
  selectedRange?: { startDate?: Date; endDate?: Date };
  onChange?: (value: { startDate?: Date; endDate?: Date; days: number }) => void;
};

export default function DaysRangePicker({
  minDays = 1,
  maxDays = 14,
  initialDays = 1,
  durationLabel = "days",
  selectedRange,
  onChange,
}: Props) {
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  //today -> 3 months out
  const today = startOfDay(new Date());
  const maxDate = startOfDay(new Date());
  maxDate.setMonth(maxDate.getMonth() + 3);

  const startDate = range?.from;
  const endDate = range?.to;
  const checkoutDate = startDate && endDate ? addDays(endDate, 1) : undefined;
  const safeCheckoutDate =
    checkoutDate && checkoutDate.getTime() <= maxDate.getTime() ? checkoutDate : undefined;
  const selectedDays =
    startDate && endDate ? clamp(diffDaysInclusive(startDate, endDate), minDays, maxDays) : undefined;

  useEffect(() => {
    if (!selectedRange) return;

    const from = selectedRange.startDate ? startOfDay(selectedRange.startDate) : undefined;
    const to = selectedRange.endDate ? startOfDay(selectedRange.endDate) : undefined;

    if (!from) {
      setRange(undefined);
      return;
    }

    setRange({ from, to: to ?? from });
  }, [selectedRange?.startDate, selectedRange?.endDate]);

  function formatDateMMDDYYYY(date: Date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }

  function setRangeFromDates(from?: Date, to?: Date) {
    setRange(from ? { from: startOfDay(from), to: to ? startOfDay(to) : undefined } : undefined);
  }

  function applyRange(from: Date, to: Date) {
    let nextFrom = startOfDay(from);
    let nextTo = startOfDay(to);

    if (nextTo.getTime() < nextFrom.getTime()) {
      const swap = nextFrom;
      nextFrom = nextTo;
      nextTo = swap;
    }

    nextFrom = clampDate(nextFrom, today, maxDate);
    nextTo = clampDate(nextTo, today, maxDate);

    const computedDays = clamp(diffDaysInclusive(nextFrom, nextTo), minDays, maxDays);
    const adjustedTo = clampDate(addDays(nextFrom, computedDays - 1), today, maxDate);
    const finalDays = clamp(diffDaysInclusive(nextFrom, adjustedTo), minDays, maxDays);

    setRangeFromDates(nextFrom, adjustedTo);
    onChange?.({ startDate: nextFrom, endDate: adjustedTo, days: finalDays });
  }

  function handleSelect(next: DateRange | undefined) {
    if (!next?.from) {
      setRange(undefined);
      onChange?.({ startDate: undefined, endDate: undefined, days: clamp(initialDays, minDays, maxDays) });
      return;
    }

    const clampedFrom = clampDate(next.from, today, maxDate);

    if (!next.to) {
      setRangeFromDates(clampedFrom, undefined);
      onChange?.({ startDate: clampedFrom, endDate: undefined, days: 1 });
      return;
    }

    applyRange(clampedFrom, next.to);
  }

return (
  <div className="chFormGrid">
    {/* Calendar */}
    <div className="chCalendarShell">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={handleSelect}
        modifiers={{ checkout: safeCheckoutDate }}
        modifiersClassNames={{ checkout: "rdp-day_checkout" }}
        numberOfMonths={1}
        fromDate={today}
        toDate={maxDate}
        fromMonth={today}
        toMonth={maxDate}
        disabled={[{ before: today }, { after: maxDate }]}
        showOutsideDays
      />

      <div className="chHelperText">
        {startDate && endDate ? (
          <>
            {formatDateMMDDYYYY(startDate)} - {formatDateMMDDYYYY(endDate)} ({selectedDays} {selectedDays === 1 ? durationLabel.slice(0, -1) : durationLabel})
          </>
        ) : (
          <>Select a start and end date.</>
        )}
      </div>
    </div>
  </div>
);
}