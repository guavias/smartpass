import React from "react";
import styles from "./Card.module.css";

type Props = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export default function Card({ title, children, className }: Props) {
  return (
    <section className={`${styles["ch-card"]} ${className ?? ""}`}>
      {title ? <h2 className={styles["ch-cardTitle"]}>{title}</h2> : null}
      {children}
    </section>
  );
}