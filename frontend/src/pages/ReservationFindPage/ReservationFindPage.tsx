import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import styles from "./ReservationFindPage.module.css";

function toReservationId(email: string, lastName: string) {
  const em = email.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const ln = lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const token = `${em}${ln}` || "guest";
  return `PASS-${token.toUpperCase()}`;
}

export default function ReservationFindPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");
  const [errors, setErrors] = useState<{ email?: string; lastName?: string }>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const nextErrors: { email?: string; lastName?: string } = {};
    const trimmedEmail = email.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    }
    if (!trimmedLast) {
      nextErrors.lastName = "Last name is required.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const reservationId = toReservationId(trimmedEmail, trimmedLast);
    navigate(`/reservation/${encodeURIComponent(reservationId)}`, {
      state: { email: trimmedEmail, lastName: trimmedLast },
    });
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

            <label className={styles.label}>Last Name</label>
            <input
              className={`${styles.input} ${errors.lastName ? styles.inputError : ""}`}
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: undefined }));
              }}
              placeholder="Last Name"
            />
            {errors.lastName ? <div className={styles.error}>{errors.lastName}</div> : null}

            <button type="submit" className={styles.primaryBtn}>
              View Day Pass
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
