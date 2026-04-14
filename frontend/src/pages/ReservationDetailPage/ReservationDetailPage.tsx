import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import Card from "../../components/Card/Card";
import personIcon from "../../assets/person.png";
import { ApiError } from "../../api/client";
import { getGuestPass, getVisitorPass, getPortal, getPortalQr, VisitorPassResponse, GuestPassResponse } from "../../api/reservations";
import styles from "./ReservationDetailPage.module.css";

type LookupState = {
  email?: string;
  reservationId?: string;
  portalToken?: string;
  passId?: string;
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
  const params = useParams<{ id: string }>();
  const location = useLocation();
  const state = (location.state as LookupState | null) ?? {};
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [qrPayload, setQrPayload] = useState("");
  const [error, setError] = useState("");
  const [qrRefreshedAt, setQrRefreshedAt] = useState<string>("");
  const [qrFlash, setQrFlash] = useState(false);

  const [reservationId, setReservationId] = useState(state.reservationId ?? "");
  const [guestName, setGuestName] = useState("Loading...");
  const [portalToken, setPortalToken] = useState(state.portalToken ?? "");
  const passId = state.passId ?? params.id ?? "";

  const adults: number = 2;
  const children: number = 1;
  const adultRate = 15;
  const childRate = 10;
  const days: number = 2;
  const [startDateISO, setStartDateISO] = useState("2026-02-15");
  const [endDateISO, setEndDateISO] = useState("2026-02-16");

  const pricing = {
    adultLine: adults * adultRate * days,
    childLine: children * childRate * days,
    subtotal: adults * adultRate * days + children * childRate * days,
    tax: 0,
    total: 0,
  };
  pricing.tax = Number((pricing.subtotal * 0.0825).toFixed(2));
  pricing.total = Number((pricing.subtotal + pricing.tax).toFixed(2));

  const qrImageUrl = useMemo(() => {
    if (!portalToken) return "";
    return `/api/v1/access/portal/${encodeURIComponent(portalToken)}/qr-image?payload=${encodeURIComponent(qrPayload)}`;
  }, [portalToken, qrPayload]);

  useEffect(() => {
    let isActive = true;

    async function loadDetails() {
      if (!passId && !portalToken) return;
      try {
        if (!portalToken && passId) {
          // Try to load as guest pass first, then fall back to visitor pass
          let pass: GuestPassResponse | VisitorPassResponse | null = null;
          try {
            pass = await getGuestPass(passId);
          } catch {
            // If guest fails, try visitor
            try {
              pass = await getVisitorPass(passId);
            } catch {
              throw new Error("Unable to load pass details");
            }
          }
          
          if (!isActive) return;
          setPortalToken(pass.portal_token);
          setGuestName(pass.name);
          setStartDateISO(new Date(pass.access_start).toISOString().slice(0, 10));
          setEndDateISO(new Date(pass.access_end).toISOString().slice(0, 10));
          
          // For guest passes, also set reservation ID if available
          if ('reservation_id' in pass) {
            setReservationId(pass.reservation_id);
          }
        }
      } catch (err) {
        if (!isActive) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Unable to load reservation details.");
        }
      }
    }

    void loadDetails();
    return () => {
      isActive = false;
    };
  }, [passId, portalToken]);

  useEffect(() => {
    let isActive = true;

    async function loadPortal() {
      if (!portalToken) return;
      try {
        const portal = await getPortal(portalToken);
        if (!isActive) return;
        setGuestName(portal.holder_name);
        setStartDateISO(new Date(portal.access_start).toISOString().slice(0, 10));
        setEndDateISO(new Date(portal.access_end).toISOString().slice(0, 10));
      } catch {
        if (!isActive) return;
      }
    }

    void loadPortal();
    return () => {
      isActive = false;
    };
  }, [portalToken]);

  useEffect(() => {
    if (!isQrOpen || !portalToken) return;

    let isActive = true;
    let flashTimer: number | undefined;
    async function fetchQr() {
      try {
        const qr = await getPortalQr(portalToken);
        if (!isActive) return;
        setQrPayload(qr.qr_payload);
        setRefreshSeconds(qr.refresh_seconds);
        setSecondsLeft(qr.refresh_seconds);
        setQrRefreshedAt(new Date().toLocaleTimeString());
        setQrFlash(true);
        setError("");
        flashTimer = window.setTimeout(() => setQrFlash(false), 900);
      } catch (err) {
        if (!isActive) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Unable to load pass QR.");
        }
      }
    }

    void fetchQr();
    return () => {
      isActive = false;
      if (flashTimer) window.clearTimeout(flashTimer);
    };
  }, [isQrOpen, portalToken]);

  useEffect(() => {
    if (!isQrOpen) return;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isQrOpen, refreshSeconds]);

  useEffect(() => {
    if (!isQrOpen || !portalToken) return;
    if (secondsLeft > 0) return;

    async function refreshQr() {
      try {
        const qr = await getPortalQr(portalToken);
        setQrPayload(qr.qr_payload);
        setRefreshSeconds(qr.refresh_seconds);
        setSecondsLeft(qr.refresh_seconds);
        setQrRefreshedAt(new Date().toLocaleTimeString());
        setQrFlash(true);
        window.setTimeout(() => setQrFlash(false), 900);
      } catch {
        setError("Unable to refresh pass QR.");
      }
    }

    void refreshQr();
  }, [secondsLeft, isQrOpen, portalToken]);

  return (
    <div className={`${styles.page} chSharedHeroBg`}>
      <div className={styles.overlay} />

      <div className={styles.inner}>
        <h1 className={styles.title}>Your Day Pass</h1>
        <p className={styles.subtitle}>Scan your QR code to access the Crappie House.</p>
        {error ? <p className={styles.subtitle}>{error}</p> : null}

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

            <div className={`${styles.qrFrame} ${qrFlash ? styles.qrFrameFlash : ""}`}>
              {!qrPayload ? (
                <p className={styles.qrHelp}>Loading QR code...</p>
              ) : (
                <img src={qrImageUrl} alt="Day pass QR code" className={styles.qrImage} />
              )}
            </div>

            <p className={styles.qrTimer}>
              QR refreshes in <span>{secondsLeft}s</span>
            </p>

            {qrRefreshedAt ? <p className={styles.qrRefreshBadge}>QR refreshed at {qrRefreshedAt}</p> : null}

            <button className={styles.qrCloseBtn} type="button" onClick={() => setIsQrOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
