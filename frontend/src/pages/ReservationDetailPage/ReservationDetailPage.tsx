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

/**
 * Parse an ISO datetime string and ensure it's treated as UTC.
 * The backend always sends UTC times, so we need to ensure they're handled correctly.
 */
function parseUTCDateTime(isoDateTime: string): Date {
  if (!isoDateTime) {
    return new Date(); // Fallback to current time if invalid
  }
  
  // Ensure the string has timezone indicator
  let cleanDateTime = isoDateTime.trim();
  
  // If no timezone indicator is present, assume UTC
  if (!cleanDateTime.includes('Z') && !cleanDateTime.includes('+') && !cleanDateTime.includes('-', 10)) {
    cleanDateTime += 'Z';
  }
  
  return new Date(cleanDateTime);
}

function formatDateMain(isoDateTime: string) {
  const d = parseUTCDateTime(isoDateTime);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(isoDateTime: string) {
  const d = parseUTCDateTime(isoDateTime);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatAccessDateTime(isoDateTime: string): string {
  if (!isoDateTime) return "";
  const d = parseUTCDateTime(isoDateTime);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function qrStatusNote(status: string, start: string, end: string): string {
  if (!start) return "";
  if (status === "inactive") return `QR Code not active until ${formatAccessDateTime(start)}`;
  if (status === "active") return `QR Code active from ${formatAccessDateTime(start)} to ${formatAccessDateTime(end)}`;
  if (status === "expired") return `QR Code expired on ${formatAccessDateTime(end)}`;
  if (status === "revoked") return "This pass has been revoked.";
  return "";
}

export default function ReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const location = useLocation();
  const state = (location.state as LookupState | null) ?? {};
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrPayload, setQrPayload] = useState("");
  const [error, setError] = useState("");
  const [portalStatus, setPortalStatus] = useState<string>("loading");

  const [guestName, setGuestName] = useState("Loading...");
  const [portalToken, setPortalToken] = useState(state.portalToken ?? "");
  const [passType, setPassType] = useState<"visitor" | "guest" | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [numDays, setNumDays] = useState(1);
  const [numAdults, setNumAdults] = useState(0);
  const [numChildren, setNumChildren] = useState(0);
  const passId = state.passId ?? params.id ?? "";

  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  const adults: number = numAdults;
  const children: number = numChildren;
  const days: number = numDays;

  const pricing = {
    adultLine: passType === "visitor" ? paymentAmount : 0,
    childLine: 0,
    subtotal: passType === "visitor" ? paymentAmount : 0,
    tax: 0,
    total: paymentAmount,
  };

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
          setStartDateTime(pass.access_start);
          setEndDateTime(pass.access_end);
          
          // Extract pass-specific data
          const type = pass.pass_type as "visitor" | "guest";
          setPassType(type);
          
          if (type === "visitor" && "payment_amount" in pass && "num_days" in pass) {
            setPaymentAmount(pass.payment_amount);
            setNumDays(pass.num_days);
            setNumAdults(pass.num_adults ?? 1);
            setNumChildren(pass.num_children ?? 0);
          } else if (type === "guest") {
            setNumAdults(pass.num_adults ?? 1);
            setNumChildren(pass.num_children ?? 0);
            if ("payment_amount" in pass && pass.payment_amount != null) {
              setPaymentAmount(pass.payment_amount);
            }
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

  const qrNote = qrStatusNote(portalStatus, startDateTime, endDateTime);
  const qrBlocked = portalStatus === "inactive" || portalStatus === "expired" || portalStatus === "revoked";

  useEffect(() => {
    let isActive = true;

    async function loadPortal() {
      if (!portalToken) return;
      try {
        const portal = await getPortal(portalToken);
        if (!isActive) return;
        setGuestName(portal.holder_name);
        setStartDateTime(portal.access_start);
        setEndDateTime(portal.access_end);
        setPortalStatus(portal.status);
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
    async function fetchQr() {
      try {
        const qr = await getPortalQr(portalToken);
        if (!isActive) return;
        setQrPayload(qr.qr_payload);
        setError("");
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
    };
  }, [isQrOpen, portalToken]);

  return (
    <div className={`${styles.page} chSharedHeroBg`}>
      <div className={styles.overlay} />

      <div className={styles.inner}>
        <h1 className={styles.title}>Your Day Pass</h1>
        <p className={styles.subtitle}>Scan your QR code to access the Crappie House.</p>
        {error ? <p className={styles.subtitle}>{error}</p> : null}

        <Card className={styles.card}>
          <p className={styles.resIdLabel}>Pass # {passId}</p>

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
              <p className={styles.dateMain}>{formatDateMain(startDateTime)}</p>
              <p className={styles.dateSub}>{formatTimeLabel(startDateTime)}</p>
            </div>

            <div className={styles.arrow} aria-hidden="true">
              &rarr;
            </div>

            <div className={styles.dateCell}>
              <p className={styles.dateMain}>{formatDateMain(endDateTime)}</p>
              <p className={styles.dateSub}>{formatTimeLabel(endDateTime)}</p>
            </div>
          </div>

          {qrBlocked ? (
            <p className={styles.qrNote}>{qrNote}</p>
          ) : (
            <>
              <button className={styles.qrBtn} type="button" onClick={() => setIsQrOpen(true)}>
                Access QR Code
              </button>
              {qrNote && <p className={styles.qrNote}>{qrNote}</p>}
            </>
          )}

          {passType === "visitor" && (
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
                <div className={styles.divider} />
                <div className={styles.breakdownTotal}>
                  <span>Total</span>
                  <span>{money(pricing.total)}</span>
                </div>
              </div>
            </div>
          )}

          {passType === "guest" && paymentAmount > 0 && (
            <div className={styles.breakdown}>
              <div className={styles.breakdownSummary}>Payment</div>
              <div className={styles.breakdownBox}>
                <div className={styles.breakdownTotal}>
                  <span>Total Paid</span>
                  <span>{money(paymentAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {isQrOpen && (
        <div className={styles.qrOverlay} role="dialog" aria-modal="true" aria-label="Pass QR code">
          <div className={styles.qrModalCard}>
            <h2 className={styles.qrTitle}>Crappie House Access</h2>

            <div className={styles.qrFrame}>
              {qrPayload ? (
                <img src={qrImageUrl} alt="Day pass QR code" className={styles.qrImage} />
              ) : portalStatus === "active" || portalStatus === "loading" ? (
                <p className={styles.qrHelp}>Loading QR code...</p>
              ) : null}
            </div>

            {qrNote && <p className={styles.qrTimer}>{qrNote}</p>}

            <button className={styles.qrCloseBtn} type="button" onClick={() => setIsQrOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
