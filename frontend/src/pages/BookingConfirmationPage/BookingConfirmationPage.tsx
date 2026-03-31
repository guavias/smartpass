import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import styles from "./BookingConfirmationPage.module.css";

type ConfirmationState = {
  reservationId: string;
  passUrl: string;
  email: string;
  preferredContact?: "Email" | "Phone";

  //booking details
  firstName: string;
  lastName: string;
  phone?: string;

  adults: number;
  children: number;
  startDateISO: string;
  endDateISO: string;  
  days: number;

  subtotal: number;
  tax: number;
  total: number;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatPrettyDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "2-digit", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const last4 = digits.slice(-4);
  return `(***) ***-${last4}`;
}
export default function BookingConfirmationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmationState | null;
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(60);

  //mock info
  const baseData: ConfirmationState = state ?? {
    reservationId: "1234567",
    passUrl: `${window.location.origin}/pass/1234567`,
    email: "john@email.com",
    preferredContact: "Email",
    firstName: "John",
    lastName: "Smith",
    phone: "(469) 555-0137",
    adults: 2,
    children: 1,
    startDateISO: "2026-02-01",
    endDateISO: "2026-02-03",
    days: 3,
    subtotal: 120,
    tax: 9.90,
    total: 129.90,
  };

  const data: ConfirmationState = {
    ...baseData,
    reservationId: "1234567",
    passUrl: `${window.location.origin}/pass/1234567`,
  };

  const dateRangeText = useMemo(() => {
    return `${formatPrettyDate(data.startDateISO)} – ${formatPrettyDate(data.endDateISO)} (${data.days} ${
      data.days === 1 ? "day" : "days"
    })`;
  }, [data.startDateISO, data.endDateISO, data.days]);

  const preferred = data.preferredContact ?? "Email";
  const contactLine =
    preferred === "Email"
      ? `We sent a secure link to access your day pass to ${data.email}.`
      : `We texted a secure link to access your day pass to ${maskPhone(data.phone ?? "")}.`;
  const qrPayload = useMemo(() => {
    return `reservation:${data.reservationId}|tick:${refreshTick}`;
  }, [data.reservationId, refreshTick]);

  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrPayload)}`;
  }, [qrPayload]);

  useEffect(() => {
    if (!isQrOpen) return;

    setSecondsLeft(60);
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRefreshTick((tick) => tick + 1);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isQrOpen]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Day Pass Confirmation</h1>

        <p className={styles.subtitle}>
          Your Crappie House Day Pass has been purchased.
          <br />
          A pass receipt has been sent to <span className={styles.bold}>{data.email}</span>.
        </p>
        <p className={styles.contactLine}>{contactLine}</p>

        {/*top button*/}
        <div className={styles.ctaRow}>
          <button className={styles.ghostBtn} type="button" onClick={() => navigate("/")}>
            Purchase Another Pass
          </button>
        </div>

        <div className={styles.grid}>
          {/*left*/}
          <Card className={styles.card}>
            <div className={styles.cardTitle}>Pass Summary</div>

            <div className={styles.summaryGrid}>
              <div className={styles.label}>Pass ID</div>
              <div className={styles.value}>
                <span className={styles.mono}>{data.reservationId}</span>
              </div>

              <div className={styles.label}>Name</div>
              <div className={styles.value}>
                {data.firstName} {data.lastName}
              </div>

              <div className={styles.label}>Dates</div>
              <div className={styles.value}>{dateRangeText}</div>

              <div className={styles.label}>Guests</div>
              <div className={styles.value}>
                {data.adults} adult{data.adults === 1 ? "" : "s"}, {data.children} child
                {data.children === 1 ? "" : "ren"}
              </div>

              <div className={styles.label}>Contact</div>
              <div className={styles.value}>
                {data.email}
                {data.phone ? <div className={styles.muted}>{data.phone}</div> : null}
              </div>

              <div className={styles.label}>Total Paid</div>
              <div className={styles.value}>
                <span className={styles.total}>{money(data.total)}</span>
              </div>

              <div className={styles.label}>Paid With</div>
              <div className={styles.value}>Card ending in xxxx</div>
            </div>

            <details className={styles.breakdown} open>
              <summary className={styles.breakdownSummary}>Price Breakdown</summary>
              <div className={styles.breakdownBox}>
                <div className={styles.row}>
                  <span>Subtotal</span>
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

          {/*right*/}
          <Card className={styles.card}>
            <div className={styles.cardTitle}>Access Your Pass</div>
            <p className={styles.small}>
              Your pass QR is protected and is only visible while your pass is active.
            </p>

            <button
              className={styles.primaryBtnWide}
              type="button"
              onClick={() => setIsQrOpen(true)}
            >
              View Your Pass Here
            </button>

            <div className={styles.passSecurityBox}>
              <div className={styles.passSecurityTitle}>Pass Security</div>
              <ul className={styles.passSecurityList}>
                <li>QR code appears only when the pass is active.</li>
                <li>QR code refreshes automatically every minute.</li>
              </ul>
            </div>

            <div className={styles.support}>
              Questions? Email{" "}
              <a className={styles.link} href="mailto:info@hi-line-resort.com">
                info@hi-line-resort.com
              </a>{" "}
              and include your pass ID <span className={styles.mono}>{data.reservationId}</span>.
            </div>
          </Card>
        </div>

        {isQrOpen && (
          <div className={styles.qrOverlay} role="dialog" aria-modal="true" aria-label="Pass QR code">
            <div className={styles.qrModalCard}>
              <h2 className={styles.qrTitle}>Crappie House Access</h2>

              <div className={styles.qrFrame}>
                <img src={qrImageUrl} alt="Day pass QR code" className={styles.qrImage} />
              </div>

              <p className={styles.qrTimer}>
                QR refreshes in <span>{secondsLeft}s</span>
              </p>

              <p className={styles.qrHelp}>
                Hold the QR code up to the scanner at the Crappie House dock.
              </p>

              <button className={styles.qrCloseBtn} type="button" onClick={() => setIsQrOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}