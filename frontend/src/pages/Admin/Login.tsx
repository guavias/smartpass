import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card/Card";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ employeeId?: string; password?: string }>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const nextErrors: { employeeId?: string; password?: string } = {};
    const trimmedEmployeeId = employeeId.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmployeeId) {
      nextErrors.employeeId = "Employee ID is required.";
    }
    if (!trimmedPassword) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // make real auth check later
    navigate("/admin/dashboard");
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Admin Login</h1>
        <p className={styles.subtitle}>Sign in with your employee credentials to access the dashboard.</p>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Employee Credentials</h2>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <label htmlFor="employeeId" className={styles.label}>Employee ID</label>
            <input
              id="employeeId"
              className={`${styles.input} ${errors.employeeId ? styles.inputError : ""}`}
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                if (errors.employeeId) {
                  setErrors((prev) => ({ ...prev, employeeId: undefined }));
                }
              }}
              autoComplete="username"
              placeholder="Employee ID"
            />
            {errors.employeeId ? <div className={styles.error}>{errors.employeeId}</div> : null}

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

            <button type="submit" className={styles.primaryBtn}>Login</button>
          </form>
        </Card>
      </div>
    </div>
  );
}