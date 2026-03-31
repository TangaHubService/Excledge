import type { ReactNode } from "react";

type Column<T> = { key: keyof T; title: string; render?: (row: T) => ReactNode };

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
    <table className="table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={String(c.key)}>{c.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((c) => (
                <td key={String(c.key)}>{c.render ? c.render(row) : String(row[c.key] ?? "-")}</td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: "center", color: "var(--muted)" }}>
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
