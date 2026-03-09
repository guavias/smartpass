import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import dayjs, { Dayjs } from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import { Popover } from "@mui/material";
import Card from "../../components/Card/Card";
import Field from "../../components/Form/Field";
import styles from "./BookPassPage.module.css";

type HeroRange = { startDate?: Date; endDate?: Date; days: number };
type NavState = { adults?: number; children?: number; range?: HeroRange };

type RangeCalendarDayProps = PickersDayProps & {
  rangeStart?: Date;
  rangeEnd?: Date;
};

const ADULT_PRICE_PER_DAY = 15;
const CHILD_PRICE_PER_DAY = 10;
const TX_TAX_RATE = 0.0825;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatRange(start?: Date, end?: Date) {
  if (!start || !end) return "Select dates on the previous page";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "2-digit", year: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function formatDateMMDDYYYY(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function diffDaysInclusive(from: Date, to: Date) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return days + 1;
}

function clampDate(d: Date, minDate: Date, maxDate: Date) {
  const t = startOfDay(d).getTime();
  const minT = startOfDay(minDate).getTime();
  const maxT = startOfDay(maxDate).getTime();
  if (t < minT) return startOfDay(minDate);
  if (t > maxT) return startOfDay(maxDate);
  return startOfDay(d);
}

function parseQuantity(raw: string) {
  if (!raw.trim()) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function coerceDate(value: unknown) {
  if (!value) return undefined;
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parseRangeInput(raw: string) {
  const match = raw
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;

  const [, sm, sd, sy, em, ed, ey] = match;
  const start = new Date(Number(sy), Number(sm) - 1, Number(sd));
  const end = new Date(Number(ey), Number(em) - 1, Number(ed));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;

  return { start, end };
}

function RangeCalendarDay(props: RangeCalendarDayProps) {
  const { day, rangeStart, rangeEnd, ...other } = props;

  const start = rangeStart ? dayjs(rangeStart) : null;
  const end = rangeEnd ? dayjs(rangeEnd) : null;
  const isStart = !!start && day.isSame(start, "day");
  const isEnd = !!end && day.isSame(end, "day");
  const inRange = !!start && !!end && day.isAfter(start, "day") && day.isBefore(end, "day");
  const isSingleDay = isStart && isEnd;
  const connector = "rgba(81, 171, 213, 0.5)";

  return (
    <PickersDay
      {...other}
      day={day}
      disableMargin
      disableRipple
      disableTouchRipple
      focusRipple={false}
      sx={{
        width: 36,
        height: 36,
        minWidth: 36,
        maxWidth: 36,
        borderRadius: 0,
        padding: 0,
        opacity: 1,
        ...(inRange
          ? {
              background: connector,
              color: "#111",
            }
          : {}),
        ...(isStart && !isSingleDay
          ? {
              background:
                `radial-gradient(circle, #51ABD5 66%, transparent 67%), linear-gradient(to right, transparent 50%, ${connector} 50%)`,
              color: "#fff",
            }
          : {}),
        ...(isEnd && !isSingleDay
          ? {
              background:
                `radial-gradient(circle, #51ABD5 66%, transparent 67%), linear-gradient(to right, ${connector} 50%, transparent 50%)`,
              color: "#fff",
            }
          : {}),
        ...(isSingleDay
          ? {
              background: "radial-gradient(circle, #51ABD5 66%, transparent 67%)",
              color: "#fff",
            }
          : {}),
        outline: "none",
        boxShadow: "none",
        border: 0,
        transition: "none",
        "&.Mui-selected, &.Mui-selected:hover": {
          background: "transparent",
          backgroundColor: "transparent",
          color: "inherit",
          opacity: 1,
          boxShadow: "none",
          outline: "none",
          border: 0,
        },
        "&.Mui-focusVisible": {
          outline: "none",
          boxShadow: "none",
          border: 0,
        },
        "&.MuiPickersDay-root": {
          outline: "none",
          boxShadow: "none",
          border: 0,
        },
        "&::after": {
          display: "none",
        },
        "&:hover": {
          background: isSingleDay
            ? "radial-gradient(circle, #51ABD5 66%, transparent 67%)"
            : isStart
              ? `radial-gradient(circle, #51ABD5 66%, transparent 67%), linear-gradient(to right, transparent 50%, ${connector} 50%)`
              : isEnd
                ? `radial-gradient(circle, #51ABD5 66%, transparent 67%), linear-gradient(to right, ${connector} 50%, transparent 50%)`
                : inRange
                  ? connector
                  : "transparent",
        },
      }}
    />
  );
}

export default function BookPassPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as NavState | null) ?? null;

  //pull values from hero page
  const initialAdults = clamp(state?.adults ?? 2, 1, 5);
  const initialChildren = clamp(state?.children ?? 1, 0, 4);
  const initialRange = {
    startDate: coerceDate(state?.range?.startDate),
    endDate: coerceDate(state?.range?.endDate),
    days: clamp(state?.range?.days ?? 1, 1, 14),
  };

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"Email" | "Phone">("Email");
  const [adultsInput, setAdultsInput] = useState(String(initialAdults));
  const [childrenInput, setChildrenInput] = useState(String(initialChildren));
  const [range, setRange] = useState<HeroRange>(initialRange);
  const [bookingDatesInput, setBookingDatesInput] = useState<string>("");
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null);
  const [pendingStart, setPendingStart] = useState<Date | undefined>(undefined);

  const adults = parseQuantity(adultsInput);
  const children = parseQuantity(childrenInput);

  const days = clamp(range.days ?? 1, 1, 14);

  const startDate = range.startDate ? startOfDay(new Date(range.startDate)) : undefined;
  const endDate = range.endDate ? startOfDay(new Date(range.endDate)) : undefined;

  const today = startOfDay(new Date());
  const maxDate = startOfDay(new Date());
  maxDate.setMonth(maxDate.getMonth() + 3);

  function normalizeAndSetRange(start?: Date, end?: Date) {
    if (!start && !end) {
      setRange({ startDate: undefined, endDate: undefined, days: 1 });
      return;
    }

    let from = clampDate(start ?? end ?? today, today, maxDate);
    let to = clampDate(end ?? from, today, maxDate);

    if (to.getTime() < from.getTime()) {
      const swap = from;
      from = to;
      to = swap;
    }

    const computedDays = clamp(diffDaysInclusive(from, to), 1, 14);
    const adjustedTo = clampDate(addDays(from, computedDays - 1), today, maxDate);
    const finalDays = clamp(diffDaysInclusive(from, adjustedTo), 1, 14);

    setRange({ startDate: from, endDate: adjustedTo, days: finalDays });
  }

  const calendarOpen = Boolean(calendarAnchor);

  useEffect(() => {
    if (!startDate || !endDate) {
      setBookingDatesInput("MM/DD/YYYY - MM/DD/YYYY");
      return;
    }

    setBookingDatesInput(`${formatDateMMDDYYYY(startDate)} - ${formatDateMMDDYYYY(endDate)}`);
  }, [startDate, endDate]);

  function commitBookingDatesInput() {
    const parsed = parseRangeInput(bookingDatesInput);
    if (!parsed) {
      if (!startDate || !endDate) {
        setBookingDatesInput("MM/DD/YYYY - MM/DD/YYYY");
      } else {
        setBookingDatesInput(`${formatDateMMDDYYYY(startDate)} - ${formatDateMMDDYYYY(endDate)}`);
      }
      return;
    }

    normalizeAndSetRange(parsed.start, parsed.end);
  }

  function handleCalendarSelect(value: Dayjs | null) {
    if (!value || !value.isValid()) return;
    const clicked = startOfDay(value.toDate());

    if (!pendingStart) {
      setPendingStart(clicked);
      setRange({ startDate: clicked, endDate: clicked, days: 1 });
      return;
    }

    normalizeAndSetRange(pendingStart, clicked);
    setPendingStart(undefined);
  }

  const pricing = useMemo(() => {
    const adultLine = adults * days * ADULT_PRICE_PER_DAY;
    const childLine = children * days * CHILD_PRICE_PER_DAY;
    const subtotal = adultLine + childLine;
    const tax = +(subtotal * TX_TAX_RATE).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    return { adultLine, childLine, subtotal, tax, total };
  }, [adults, children, days]);

  //mock pay
  function handlePay() {
    //later implementation: call backend to create payment + reservation, then confirm payment with Square SDK
    if (!firstName.trim() || !lastName.trim()) return alert("Please enter your first and last name.");
    if (!email.trim()) return alert("Please enter your email.");
    alert("Frontend-only placeholder: payment flow will be connected to Square via backend.");
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Complete Your Reservation</h1>
        <p className={styles.subtitle}>Fill in your details to reserve your Crappie House pass.</p>

        <div className={styles.grid}>
          {/*left card*/}
          <Card className={styles.card}>
            <div className={styles.cardHeader}>Reservation Details</div>

            <div className={styles.formGrid}>
              <Field label="FIRST NAME">
                <input
                  className={styles.input}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                />
              </Field>

              <Field label="LAST NAME">
                <input
                  className={styles.input}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                />
              </Field>

              <Field label="# OF ADULTS">
                <div className={styles.stepperWrap}>
                  <input
                    type="number"
                    min={0}
                    className={`${styles.input} ${styles.stepperInput} noSpinnerInput`}
                    value={adultsInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setAdultsInput("");
                        return;
                      }
                      setAdultsInput(raw.replace(/\D/g, ""));
                    }}
                    onBlur={() => setAdultsInput(String(parseQuantity(adultsInput)))}
                  />
                  <div className={styles.stepperBtns}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      aria-label="Decrease adults"
                      onClick={() => setAdultsInput(String(Math.max(0, parseQuantity(adultsInput) - 1)))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      aria-label="Increase adults"
                      onClick={() => setAdultsInput(String(parseQuantity(adultsInput) + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </Field>

              <Field label="# OF CHILDREN">
                <div className={styles.stepperWrap}>
                  <input
                    type="number"
                    min={0}
                    className={`${styles.input} ${styles.stepperInput} noSpinnerInput`}
                    value={childrenInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setChildrenInput("");
                        return;
                      }
                      setChildrenInput(raw.replace(/\D/g, ""));
                    }}
                    onBlur={() => setChildrenInput(String(parseQuantity(childrenInput)))}
                  />
                  <div className={styles.stepperBtns}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      aria-label="Decrease children"
                      onClick={() => setChildrenInput(String(Math.max(0, parseQuantity(childrenInput) - 1)))}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      aria-label="Increase children"
                      onClick={() => setChildrenInput(String(parseQuantity(childrenInput) + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </Field>

              <div className={styles.fullRow}>
                <Field label="BOOKING DATES">
                  <input
                    className={`${styles.input} ${styles.bookingDateInput}`}
                    value={bookingDatesInput}
                    onChange={(e) => setBookingDatesInput(e.target.value)}
                    onBlur={commitBookingDatesInput}
                    onClick={(e) => setCalendarAnchor(e.currentTarget)}
                    placeholder="MM/DD/YYYY - MM/DD/YYYY"
                  />
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <Popover
                      open={calendarOpen}
                      anchorEl={calendarAnchor}
                      onClose={() => {
                        setCalendarAnchor(null);
                        setPendingStart(undefined);
                      }}
                      disableRestoreFocus
                      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                      transformOrigin={{ vertical: "top", horizontal: "left" }}
                      PaperProps={{ sx: { p: 1.5, mt: 1, zIndex: 1800 } }}
                    >
                      <DateCalendar
                        value={dayjs((pendingStart ?? endDate ?? startDate ?? today))}
                        onChange={handleCalendarSelect}
                        minDate={dayjs(today)}
                        maxDate={dayjs(maxDate)}
                        shouldDisableDate={(date) => date.isBefore(dayjs(today), "day") || date.isAfter(dayjs(maxDate), "day")}
                        disableHighlightToday
                        slots={{
                          day: (dayProps) => (
                            <RangeCalendarDay
                              {...dayProps}
                              rangeStart={pendingStart ?? startDate}
                              rangeEnd={pendingStart ? pendingStart : endDate}
                            />
                          ),
                        }}
                      />
                    </Popover>
                  </LocalizationProvider>
                  <div className={styles.helper}>
                    {formatRange(startDate, endDate)} · {days} {days === 1 ? "day" : "days"} selected
                  </div>
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="EMAIL">
                  <input
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    inputMode="email"
                  />
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PHONE NUMBER">
                  <input
                    className={styles.input}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone Number"
                    inputMode="tel"
                  />
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PREFERRED CONTACT METHOD">
                  <select
                    className={styles.input}
                    value={preferredContact}
                    onChange={(e) => setPreferredContact(e.target.value as "Email" | "Phone")}
                  >
                    <option value="Email">Email</option>
                    <option value="Phone">Phone</option>
                  </select>
                </Field>
              </div>

              <div className={styles.actions}>
                <button className={styles.backBtn} onClick={() => navigate("/")}>
                  Back
                </button>
              </div>
            </div>
          </Card>

          {/*right card*/}
          <Card className={styles.card}>
            <div className={styles.payHeader}>
              <div className={styles.payTitle}>Payment</div>
              <div className={styles.payTotal}>Total: {money(pricing.total)} USD</div>
            </div>

            <details className={styles.breakdown} open>
              <summary className={styles.breakdownSummary}>Price Breakdown</summary>
              <div className={styles.breakdownBox}>
                {adults > 0 && (
                  <div className={styles.breakdownRow}>
                    <span>
                      {adults} Adult Day Pass × {days} {days === 1 ? "day" : "days"}
                    </span>
                    <span>{money(pricing.adultLine)}</span>
                  </div>
                )}
                {children > 0 && (
                  <div className={styles.breakdownRow}>
                    <span>
                      {children} Child Day Pass × {days} {days === 1 ? "day" : "days"}
                    </span>
                    <span>{money(pricing.childLine)}</span>
                  </div>
                )}
                <div className={styles.breakdownRow}>
                  <span>Tax (TX 8.25%)</span>
                  <span>{money(pricing.tax)}</span>
                </div>
                <div className={styles.divider} />
                <div className={styles.breakdownTotal}>
                  <span>Total</span>
                  <span>{money(pricing.total)}</span>
                </div>
              </div>
            </details>

            {/*payment ui placeholder before backend integration*/}
            <div className={styles.payMethods}>
              <button type="button" className={styles.walletBtn} onClick={() => alert("Square Apple Pay placeholder")}>
                Apple Pay
              </button>
              <button type="button" className={styles.walletBtn} onClick={() => alert("Square Google Pay placeholder")}>
                Google Pay
              </button>

              <div className={styles.orLine}>
                <span>or pay with card</span>
              </div>

              {/*mock before square integration*/}
              <input className={styles.input} placeholder="Card Number" />
              <div className={styles.cardRow}>
                <input className={styles.input} placeholder="MM/YY" />
                <input className={styles.input} placeholder="CVV" />
              </div>

              <button className={styles.payBtn} onClick={handlePay}>
                Pay {money(pricing.total)}
              </button>

              <div className={styles.payFinePrint}>
                Payments will be processed by Square. Your reservation is confirmed after successful payment.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}