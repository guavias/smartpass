import React from "react";
import "./Field.css";

export default function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ch-field">
      <div className="ch-fieldLabel">{label}</div>
      {children}
    </div>
  );
}