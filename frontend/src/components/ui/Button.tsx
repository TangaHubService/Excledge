import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  loading,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "danger" | "ghost" }) {
  return (
    <button {...props} className={`btn ${variant}`} disabled={loading || props.disabled}>
      {loading ? <span className="spinner" /> : null}
      <span>{children as ReactNode}</span>
    </button>
  );
}
