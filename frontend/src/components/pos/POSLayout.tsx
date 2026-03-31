import type { ReactNode } from "react";

export function POSLayout({
  top,
  left,
  right,
}: {
  top: ReactNode;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <section className="pos">
      <header className="pos-top">{top}</header>
      <div className="pos-grid">
        <div className="panel">{left}</div>
        {right}
      </div>
    </section>
  );
}
