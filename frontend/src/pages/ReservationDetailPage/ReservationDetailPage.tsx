import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import Card from "../../components/Card/Card";
import personIcon from "../../assets/person.png";
import styles from "./ReservationDetailPage.module.css";

type LookupState = {
  email?: string;
  lastName?: string;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDateMain(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(iso: string, endOfDay = false) {
  const d = new Date(iso + (endOfDay ? "T23:59:00" : "T00:01:00"));
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ReservationDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const state = (location.state as LookupState | null) ?? {};
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const reservationId = id ?? "12345678";
  const guestLast = state.lastName?.trim() || "Doe";
  const guestName = `John ${guestLast}`;

  const adults: number = 2;
  const children: number = 1;
  const adultRate = 15;
  const childRate = 5;
  const days: number = 2;
  const startDateISO = "2026-02-15";
  const endDateISO = "2026-02-16";

  const pricing = {
    adultLine: adults * adultRate * days,
    childLine: children * childRate * days,
    subtotal: adults * adultRate * days + children * childRate * days,
    tax: 0,
    total: 0,
  };
  pricing.tax = Number((pricing.subtotal * 0.0825).toFixed(2));
  pricing.total = Number((pricing.subtotal + pricing.tax).toFixed(2));

  const qrPayload = useMemo(() => {
    return `reservation:${reservationId}|tick:${refreshTick}`;
  }, [reservationId, refreshTick]);

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
    <div className={`${styles.page} chSharedHeroBg`}>
      <div className={styles.overlay} />

      <div className={styles.inner}>
        <h1 className={styles.title}>Your Day Pass</h1>
        <p className={styles.subtitle}>Scan your QR code to access the Crappie House.</p>

        <Card className={styles.card}>
          <p className={styles.resIdLabel}>Pass #</p>
          <p className={styles.resIdValue}>{reservationId}</p>

          <div className={styles.guestRow}>
            <img src={personIcon} alt="" aria-hidden="true" className={styles.guestIcon} />
            <div>
              <p className={styles.guestName}>{guestName}</p>
              <p className={styles.guestMeta}>
                {adults} Adult{adults === 1 ? "" : "s"}, {children} Child
                {children === 1 ? "" : "ren"}
              </p>
            </div>
          </div>

          <div className={styles.dateRow}>
            <div className={styles.dateCell}>
              <p className={styles.dateMain}>{formatDateMain(startDateISO)}</p>
              <p className={styles.dateSub}>{formatTimeLabel(startDateISO)}</p>
            </div>

            <div className={styles.arrow} aria-hidden="true">
              &rarr;
            </div>

            <div className={styles.dateCell}>
              <p className={styles.dateMain}>{formatDateMain(endDateISO)}</p>
              <p className={styles.dateSub}>{formatTimeLabel(endDateISO, true)}</p>
            </div>
          </div>

          <button className={styles.qrBtn} type="button" onClick={() => setIsQrOpen(true)}>
            Access QR Code
          </button>
          <p className={styles.qrNote}>QR code refreshes every minute.</p>

          <div className={styles.breakdown}>
            <div className={styles.breakdownSummary}>Price Breakdown</div>
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

            <button className={styles.qrCloseBtn} type="button" onClick={() => setIsQrOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
