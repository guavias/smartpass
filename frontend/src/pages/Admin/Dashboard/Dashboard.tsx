import styles from "./Dashboard.module.css";

export default function Dashboard() {

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.row}>
          <h1 className={styles.title}>Admin Dashboard</h1>
        </div>
        <p className={styles.subtitle}>Admin wip</p>
      </section>
    </main>
  );
}