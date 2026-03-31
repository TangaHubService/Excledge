import type { ReactNode } from "react";

export function POSLayout({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="pos-layout">
      <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '20px', overflow: 'auto' }}>
        {left}
      </div>
      <aside className="cart-panel-standard">
        {right}
      </aside>
    </div>
  );
}
