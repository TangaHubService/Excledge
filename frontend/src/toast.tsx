import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Toast = { id: number; type: "success" | "error"; message: string };
const ToastContext = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const value = useMemo(
    () => ({
      push: (t: Omit<Toast, "id">) => {
        const id = Date.now();
        setToasts((s) => [...s, { ...t, id }]);
        setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 2800);
      },
    }),
    [],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
