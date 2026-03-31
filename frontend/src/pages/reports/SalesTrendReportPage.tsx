import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { FilterBar, type ReportFilters } from "../../components/reports/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Pagination } from "../../components/Pagination";
import { Skeleton } from "../../components/ui/Skeleton";
import { useReportQuery } from "../../hooks/useReportQuery";

import { Select } from "../../components/ui/Select";

export function SalesTrendReportPage() {
  const [page, setPage] = useState(1);
  const [groupBy, setGroupBy] = useState<"daily" | "weekly">("daily");
  const [filters, setFilters] = useState<ReportFilters>({});
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches")).data.data as Array<{ id: string; name: string }> });
  const params = useMemo(() => ({ ...filters, page, limit: 10, groupBy }), [filters, page, groupBy]);
  const q = useReportQuery<any>(["report-sales-trend", params], "/reports/sales-trend", params);

  const groupByOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
  ];

  return (
    <section className="page-stack">
      <h1>Sales Trend</h1>
      <div className="report-filterbar-with-extra" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <FilterBar filters={filters} branches={branches.data ?? []} onChange={(v) => { setFilters(v); setPage(1); }} onReset={() => { setFilters({}); setPage(1); }} />
        <div style={{ width: '150px' }}>
          <Select
            value={groupBy}
            onChange={(val) => setGroupBy(val as "daily" | "weekly")}
            options={groupByOptions}
          />
        </div>
      </div>
      {q.isLoading ? <Skeleton height={180} /> : (
        <>
          <div className="panel">
            <DataTable rows={q.data?.data ?? []} columns={[{ key: "period", title: "Date" }, { key: "totalSales", title: "Total Sales (RWF)" }, { key: "transactionCount", title: "Transactions" }]} />
          </div>
          <Pagination page={q.data?.meta.page ?? page} pageSize={q.data?.meta.limit ?? 10} total={q.data?.meta.total ?? 0} onChange={setPage} />
        </>
      )}
    </section>
  );
}
