export interface CardProps {
  title: string;
  children: React.ReactNode;
}

export default function Card({ title, children }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "16px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
      }}
    >
      <h2>{title}</h2>
      {children}
    </div>
  );
}
