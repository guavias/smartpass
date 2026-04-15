import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import styles from "./OvernightBookingConfirmationPage.module.css";

type ConfirmationState = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  preferredContact?: "Email" | "Phone";
  adults?: number;
  children?: number;
  pets?: number;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  stayType?: string;
  nightlyRate?: number;
  subtotal?: number;
  tax?: number;
  total?: number;
};

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatPrettyDate(iso?: string) {
  if (!iso) return "Not selected";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not selected";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "2-digit", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

export default function OvernightBookingConfirmationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as ConfirmationState | null) ?? {};

  const data = {
    firstName: state.firstName?.trim() || "Guest",
    lastName: state.lastName?.trim() || "",
    email: state.email?.trim() || "guest@example.com",
    phone: state.phone?.trim() || "",
    preferredContact: state.preferredContact ?? "Email",
    adults: Math.max(0, state.adults ?? 1),
    children: Math.max(0, state.children ?? 0),
    pets: Math.max(0, state.pets ?? 0),
    checkIn: state.checkIn,
    checkOut: state.checkOut,
    nights: Math.max(1, state.nights ?? 1),
    stayType: state.stayType ?? "Cabin Studio",
    nightlyRate: state.nightlyRate ?? 145,
    subtotal: state.subtotal ?? 145,
    tax: state.tax ?? 0,
    total: state.total ?? 145,
  };

  const dateRangeText = useMemo(() => {
    return `${formatPrettyDate(data.checkIn)} - ${formatPrettyDate(data.checkOut)} (${data.nights} ${
      data.nights === 1 ? "night" : "nights"
    })`;
  }, [data.checkIn, data.checkOut, data.nights]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Booking Confirmation</h1>

        <p className={styles.subtitle}>
          Your cabin booking has been submitted.
          <br />
          A receipt has been sent to <span className={styles.bold}>{data.email}</span>.
        </p>

        <div className={styles.ctaRow}>
          <button className={styles.ghostBtn} type="button" onClick={() => navigate("/demo/overnight-booking")}>
            Book Another Stay
          </button>
        </div>

        <Card className={styles.card}>
          <div className={styles.cardTitle}>Booking Summary</div>

          <div className={styles.summaryGrid}>
            <div className={styles.label}>Name</div>
            <div className={styles.value}>
              {data.firstName} {data.lastName}
            </div>

            <div className={styles.label}>Stay Type</div>
            <div className={styles.value}>{data.stayType}</div>

            <div className={styles.label}>Dates</div>
            <div className={styles.value}>{dateRangeText}</div>

            <div className={styles.label}>Guests</div>
            <div className={styles.value}>
              {data.adults} adult{data.adults === 1 ? "" : "s"}, {data.children} child
              {data.children === 1 ? "" : "ren"}, {data.pets} pet{data.pets === 1 ? "" : "s"}
            </div>

            <div className={styles.label}>Contact</div>
            <div className={styles.value}>
              {data.email}
              {data.phone ? <div className={styles.muted}>{data.phone}</div> : null}
            </div>

            <div className={styles.label}>Preferred Contact</div>
            <div className={styles.value}>{data.preferredContact}</div>

            <div className={styles.label}>Total Paid</div>
            <div className={styles.value}>
              <span className={styles.total}>{money(data.total)}</span>
            </div>
          </div>

          <details className={styles.breakdown} open>
            <summary className={styles.breakdownSummary}>Price Breakdown</summary>
            <div className={styles.breakdownBox}>
              <div className={styles.row}>
                <span>
                  {data.stayType} ({money(data.nightlyRate)} x {data.nights} {data.nights === 1 ? "night" : "nights"})
                </span>
                <span>{money(data.subtotal)}</span>
              </div>
              <div className={styles.row}>
                <span>Tax</span>
                <span>{money(data.tax)}</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.rowStrong}>
                <span>Total</span>
                <span>{money(data.total)}</span>
              </div>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}
