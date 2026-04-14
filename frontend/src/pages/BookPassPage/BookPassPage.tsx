import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import dayjs, { Dayjs } from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import { Popover } from "@mui/material";
import Card from "../../components/Card/Card";
import Field from "../../components/Form/Field";
import { createVisitorPass } from "../../api/reservations";
import { ApiError } from "../../api/client";
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
const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID as string | undefined;
const SQUARE_ENV = (import.meta.env.VITE_SQUARE_ENV as string | undefined)?.toLowerCase() ?? "sandbox";
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID as string | undefined;
const SQUARE_SCRIPT_URL =
  SQUARE_ENV === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";

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

function formatCardNumberInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiryInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCvvInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatPhoneInput(value: string, keepTrailingHyphen = true) {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length < 3) return digits;
  if (digits.length === 3) return keepTrailingHyphen ? `${digits}-` : digits;
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 6) {
    return keepTrailingHyphen ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidPhone(phone: string) {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone);
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [squareReady, setSquareReady] = useState(false);
  const [fallbackCardNumber, setFallbackCardNumber] = useState("");
  const [fallbackCardExpiry, setFallbackCardExpiry] = useState("");
  const [fallbackCardCvv, setFallbackCardCvv] = useState("");
  const phoneDeleteKeyRef = useRef(false);
  const squareCardContainerRef = useRef<HTMLDivElement | null>(null);
  const squareCardRef = useRef<any>(null);
  const squareScriptPromiseRef = useRef<Promise<void> | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadSquareCard() {
      if (!SQUARE_APP_ID) {
        setSquareReady(false);
        return;
      }

      if (!squareScriptPromiseRef.current) {
        squareScriptPromiseRef.current = new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-square-sdk="true"]');
          if (existing) {
            resolve();
            return;
          }

          const script = document.createElement("script");
          script.src = SQUARE_SCRIPT_URL;
          script.async = true;
          script.dataset.squareSdk = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Unable to load Square Web Payments SDK"));
          document.head.appendChild(script);
        });
      }

      try {
        await squareScriptPromiseRef.current;
        if (cancelled) return;

        const square = (window as typeof window & { Square?: any }).Square;
        if (!square) {
          throw new Error("Square SDK not available");
        }

        const payments = square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        const card = await payments.card();
        squareCardRef.current = card;

        if (squareCardContainerRef.current) {
          squareCardContainerRef.current.innerHTML = "";
          await card.attach(squareCardContainerRef.current);
        }

        if (!cancelled) {
          setSquareReady(true);
        }
      } catch (error) {
        if (cancelled) return;
        setSquareReady(false);
        squareCardRef.current = null;
      }
    }

    void loadSquareCard();

    return () => {
      cancelled = true;
      try {
        squareCardRef.current?.destroy?.();
      } catch {
        // ignore cleanup failures
      }
      squareCardRef.current = null;
    };
  }, []);

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

  async function handlePay() {
    const nextErrors: Record<string, string> = {};
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFirst) nextErrors.firstName = "First name is required.";
    if (!trimmedLast) nextErrors.lastName = "Last name is required.";
    if (!startDate || !endDate) nextErrors.bookingDates = "Access dates are required.";
    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!isValidEmail(trimmedEmail)) {
      nextErrors.email = "Email must be in a valid format (name@email.com).";
    }

    if (!trimmedPhone) {
      nextErrors.phone = "Phone number is required.";
    } else if (!isValidPhone(trimmedPhone)) {
      nextErrors.phone = "Phone number must be in xxx-xxx-xxxx format.";
    }

    if (adults + children < 1) {
      nextErrors.guests = "At least one guest is required.";
    }

    if (!squareReady) {
      const fallbackDigits = fallbackCardNumber.replace(/\D/g, "");
      if (fallbackDigits.length < 12) {
        nextErrors.paymentCard = "Enter a valid card number.";
      }
      if (!/^\d{2}\/\d{2}$/.test(fallbackCardExpiry)) {
        nextErrors.paymentCard = "Enter card expiry as MM/YY.";
      }
      if (fallbackCardCvv.length < 3) {
        nextErrors.paymentCard = "Enter a valid CVV.";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitError("");

    const safeStartDate = startDate ?? today;
    const safeEndDate = endDate ?? safeStartDate;

    try {
      setIsSubmitting(true);
      let paymentSourceId = "cnon:card-nonce-ok";

      if (squareCardRef.current) {
        const tokenResult = await squareCardRef.current.tokenize();
        if (tokenResult.status !== "OK") {
          throw new Error(tokenResult.errors?.[0]?.message ?? "Square tokenization failed");
        }
        paymentSourceId = tokenResult.token;
      }

      const idempotencyKey = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const visitor = await createVisitorPass({
        name: `${trimmedFirst} ${trimmedLast}`,
        email: trimmedEmail,
        phone: trimmedPhone,
        vehicle_info: "N/A",
        num_days: days,
        payment_amount: pricing.total,
        payment_method: "card",
        payment_source_id: paymentSourceId,
        idempotency_key: idempotencyKey,
      });

      navigate("/confirmation", {
        state: {
          passId: visitor.id,
          portalToken: visitor.portal_token,
          email: trimmedEmail,
          preferredContact,
          firstName: trimmedFirst,
          lastName: trimmedLast,
          phone: trimmedPhone,
          adults,
          children,
          startDateISO: safeStartDate.toISOString().slice(0, 10),
          endDateISO: safeEndDate.toISOString().slice(0, 10),
          days,
          subtotal: pricing.subtotal,
          tax: pricing.tax,
          total: pricing.total,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : "Unable to complete purchase right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Purchase Your Day Pass</h1>
        <p className={styles.subtitle}>Fill in your details to purchase Crappie House access.</p>

        <div className={styles.grid}>
          {/*left card*/}
          <Card className={styles.card}>
            <div className={styles.cardHeader}>Pass Details</div>

            <div className={styles.formGrid}>
              <Field label="FIRST NAME">
                <input
                  className={`${styles.input} ${errors.firstName ? styles.inputError : ""}`}
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: "" }));
                  }}
                  placeholder="First Name"
                />
                {errors.firstName && <div className={styles.fieldError}>{errors.firstName}</div>}
              </Field>

              <Field label="LAST NAME">
                <input
                  className={`${styles.input} ${errors.lastName ? styles.inputError : ""}`}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: "" }));
                  }}
                  placeholder="Last Name"
                />
                {errors.lastName && <div className={styles.fieldError}>{errors.lastName}</div>}
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
                {errors.guests && <div className={styles.fieldError}>{errors.guests}</div>}
              </Field>

              <div className={styles.fullRow}>
                <Field label="ACCESS DATES">
                  <input
                    className={`${styles.input} ${styles.bookingDateInput} ${errors.bookingDates ? styles.inputError : ""}`}
                    value={bookingDatesInput}
                    onChange={(e) => {
                      setBookingDatesInput(e.target.value);
                      if (errors.bookingDates) setErrors((prev) => ({ ...prev, bookingDates: "" }));
                    }}
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
                  {errors.bookingDates && <div className={styles.fieldError}>{errors.bookingDates}</div>}
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="EMAIL">
                  <input
                    className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    placeholder="Enter your email"
                    inputMode="email"
                  />
                  {errors.email && <div className={styles.fieldError}>{errors.email}</div>}
                </Field>
              </div>

              <div className={styles.fullRow}>
                <Field label="PHONE NUMBER">
                  <input
                    className={`${styles.input} ${errors.phone ? styles.inputError : ""}`}
                    value={phone}
                    onKeyDown={(e) => {
                      phoneDeleteKeyRef.current = e.key === "Backspace" || e.key === "Delete";
                    }}
                    onChange={(e) => {
                      setPhone(formatPhoneInput(e.target.value, !phoneDeleteKeyRef.current));
                      phoneDeleteKeyRef.current = false;
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                    }}
                    placeholder="xxx-xxx-xxxx"
                    inputMode="tel"
                    maxLength={12}
                  />
                  {errors.phone && <div className={styles.fieldError}>{errors.phone}</div>}
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

            <div className={styles.payMethods}>
              <button type="button" className={styles.walletBtn}>
                Apple Pay
              </button>

              <button type="button" className={styles.walletBtn}>
                Google Pay
              </button>

              <div className={styles.orLine}>or pay with card</div>

              {squareReady ? (
                <div className={styles.squareCardShell}>
                  <div ref={squareCardContainerRef} className={styles.squareCardContainer} />
                </div>
              ) : (
                <>
                  <input
                    className={`${styles.input} ${errors.paymentCard ? styles.inputError : ""}`}
                    value={fallbackCardNumber}
                    onChange={(e) => {
                      setFallbackCardNumber(formatCardNumberInput(e.target.value));
                      if (errors.paymentCard) setErrors((prev) => ({ ...prev, paymentCard: "" }));
                    }}
                    placeholder="Card Number"
                    inputMode="numeric"
                  />
                  <div className={styles.cardRow}>
                    <input
                      className={`${styles.input} ${errors.paymentCard ? styles.inputError : ""}`}
                      value={fallbackCardExpiry}
                      onChange={(e) => {
                        setFallbackCardExpiry(formatExpiryInput(e.target.value));
                        if (errors.paymentCard) setErrors((prev) => ({ ...prev, paymentCard: "" }));
                      }}
                      placeholder="MM/YY"
                      inputMode="numeric"
                    />
                    <input
                      className={`${styles.input} ${errors.paymentCard ? styles.inputError : ""}`}
                      value={fallbackCardCvv}
                      onChange={(e) => {
                        setFallbackCardCvv(formatCvvInput(e.target.value));
                        if (errors.paymentCard) setErrors((prev) => ({ ...prev, paymentCard: "" }));
                      }}
                      placeholder="CVV"
                      inputMode="numeric"
                    />
                  </div>
                </>
              )}

              {errors.paymentCard ? <div className={styles.fieldError}>{errors.paymentCard}</div> : null}

              <button className={styles.payBtn} onClick={handlePay} disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : `Pay ${money(pricing.total)}`}
              </button>

              {submitError ? <div className={styles.fieldError}>{submitError}</div> : null}

              <div className={styles.payFinePrint}>
                Payments will be processed by Square. Your day pass is active after successful payment.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}