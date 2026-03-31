import { Button } from "../ui/Button";

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  categoryId?: string;
};

export function FilterBar({
  filters,
  branches,
  showCategory,
  categories,
  onChange,
  onReset,
}: {
  filters: ReportFilters;
  branches: Array<{ id: string; name: string }>;
  showCategory?: boolean;
  categories?: Array<{ id: string; name: string }>;
  onChange: (next: ReportFilters) => void;
  onReset: () => void;
}) {
  return (
    <div className="panel report-filterbar">
      <input type="date" value={filters.startDate ?? ""} onChange={(e) => onChange({ ...filters, startDate: e.target.value || undefined })} />
      <input type="date" value={filters.endDate ?? ""} onChange={(e) => onChange({ ...filters, endDate: e.target.value || undefined })} />
      <select value={filters.branchId ?? ""} onChange={(e) => onChange({ ...filters, branchId: e.target.value || undefined })}>
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {showCategory ? (
        <select value={filters.categoryId ?? ""} onChange={(e) => onChange({ ...filters, categoryId: e.target.value || undefined })}>
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button variant="ghost" onClick={onReset}>Reset</Button>
    </div>
  );
}
