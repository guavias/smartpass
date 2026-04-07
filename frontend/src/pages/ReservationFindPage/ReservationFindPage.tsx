import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import { findGuestPortal, getVisitorPass } from "../../api/reservations";
import { ApiError } from "../../api/client";
import styles from "./ReservationFindPage.module.css";

export default function ReservationFindPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [errors, setErrors] = useState<{ email?: string; reservationId?: string; submit?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const nextErrors: { email?: string; reservationId?: string } = {};
    const trimmedEmail = email.trim();
    const trimmedReservationId = reservationId.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    }
    if (!trimmedReservationId) {
      nextErrors.reservationId = "Reservation ID is required.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      try {
        const result = await findGuestPortal({ email: trimmedEmail, reservation_id: trimmedReservationId });
        navigate(`/reservation/${encodeURIComponent(result.id)}`, {
          state: {
            email: trimmedEmail,
            reservationId: result.reservation_id,
            portalToken: result.portal_token,
            passId: result.id,
          },
        });
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) {
          throw error;
        }
      }

      const visitor = await getVisitorPass(trimmedReservationId);
      if (visitor.email.trim().toLowerCase() !== trimmedEmail.toLowerCase()) {
        setErrors((prev) => ({ ...prev, submit: "Email does not match this pass ID." }));
        return;
      }

      navigate(`/reservation/${encodeURIComponent(visitor.id)}`, {
        state: {
          email: trimmedEmail,
          reservationId: trimmedReservationId,
          portalToken: visitor.portal_token,
          passId: visitor.id,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors((prev) => ({ ...prev, submit: error.message }));
      } else {
        setErrors((prev) => ({ ...prev, submit: "Unable to find reservation right now." }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`${styles.page} chSharedHeroBg`}>
      <div className={styles.overlay} />

      <div className={styles.inner}>
        <h1 className={styles.title}>View Your Day Pass</h1>
        <p className={styles.subtitle}>Fill in your details to access your Crappie House day pass.</p>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Pass Details</h2>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <label className={styles.label}>Email</label>
            <input
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="name@email.com"
              inputMode="email"
            />
            {errors.email ? <div className={styles.error}>{errors.email}</div> : null}

            <label className={styles.label}>Reservation ID or Pass ID</label>
            <input
              className={`${styles.input} ${errors.reservationId ? styles.inputError : ""}`}
              value={reservationId}
              onChange={(e) => {
                setReservationId(e.target.value);
                if (errors.reservationId) setErrors((prev) => ({ ...prev, reservationId: undefined }));
              }}
              placeholder="RES-1001 or your pass UUID"
            />
            {errors.reservationId ? <div className={styles.error}>{errors.reservationId}</div> : null}

            {errors.submit ? <div className={styles.error}>{errors.submit}</div> : null}

            <button type="submit" className={styles.primaryBtn}>
              {isSubmitting ? "Finding..." : "View Day Pass"}
            </button>

            <div className={styles.footerText}>
              Don&apos;t have a day pass yet?{" "}
              <Link to="/book-pass" className={styles.bookLink}>
                Purchase Now →
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
