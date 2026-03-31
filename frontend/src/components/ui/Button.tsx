import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  loading,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "danger" | "ghost" }) {
  return (
    <button 
      {...props} 
      className={`btn ${variant} ${className}`} 
      disabled={loading || props.disabled}
    >
      {loading ? <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : null}
      <span>{children as ReactNode}</span>
    </button>
  );
}
