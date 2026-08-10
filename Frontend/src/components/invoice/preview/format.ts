/** Shared currency/date formatting helpers for the printable invoice. */

export function formatAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0.00"
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatInteger(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0"
  return Math.round(n).toLocaleString("en-US")
}

export function formatQuantity(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return "0"
  const abs = Math.abs(n)
  return n.toLocaleString("en-US", { maximumFractionDigits: abs % 1 === 0 ? 0 : 2 })
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function formatTime(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  }
  return value.trim() || "—"
}

/** Breaks a long hex/signature string into dash-separated 4-char groups. */
export function dashEvery4(value?: string | null): string {
  const text = (value ?? "").replace(/\s+/g, "").trim()
  if (!text) return "—"
  return text.replace(/.{4}/g, (m) => `${m} `).trim()
}

export function safeText(value?: string | null): string {
  const text = (value ?? "").toString().trim()
  return text || "—"
}