import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import { ApiError } from "../../api/client";
import { adminLogin, saveAdminSession } from "../../api/admin";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; submit?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const nextErrors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    }
    if (!trimmedPassword) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      const login = await adminLogin({ email: trimmedEmail, password: trimmedPassword });
      saveAdminSession(login);
      navigate("/admin/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors((prev) => ({ ...prev, submit: error.message }));
      } else {
        setErrors((prev) => ({ ...prev, submit: "Unable to sign in right now." }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Admin Login</h1>
        <p className={styles.subtitle}>Sign in with your admin credentials to access the dashboard.</p>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Admin Credentials</h2>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              autoComplete="username"
              placeholder="admin@smartpass.dev"
            />
            {errors.email ? <div className={styles.error}>{errors.email}</div> : null}

            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              autoComplete="current-password"
              placeholder="Password"
            />
            {errors.password ? <div className={styles.error}>{errors.password}</div> : null}

            {errors.submit ? <div className={styles.error}>{errors.submit}</div> : null}

            <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}