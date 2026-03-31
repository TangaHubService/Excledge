import type { ReactNode } from "react";

type Column<T> = { key: string; title: string; render?: (row: T) => ReactNode };

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data found",
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(row) : (row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : "-")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 500 }}>{emptyMessage}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
