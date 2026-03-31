import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { FilterBar, type ReportFilters } from "../../components/reports/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Pagination } from "../../components/Pagination";
import { Skeleton } from "../../components/ui/Skeleton";
import { useReportQuery } from "../../hooks/useReportQuery";

export function LowStockReportPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ReportFilters>({});
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches")).data.data as Array<{ id: string; name: string }> });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data.data as Array<{ id: string; name: string }> });
  const params = useMemo(() => ({ ...filters, page, limit: 10 }), [filters, page]);
  const q = useReportQuery<any>(["report-low-stock", params], "/reports/low-stock", params);
  return (
    <section className="page-stack">
      <h1>Low Stock Report</h1>
      <FilterBar
        filters={filters}
        branches={branches.data ?? []}
        showCategory
        categories={categories.data ?? []}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onReset={() => { setFilters({}); setPage(1); }}
      />
      {q.isLoading ? <Skeleton height={180} /> : (
        <>
          <div className="panel">
            <DataTable rows={q.data?.data ?? []} columns={[{ key: "productName", title: "Product Name" }, { key: "currentStock", title: "Current Stock" }, { key: "minimumLevel", title: "Minimum Level" }, { key: "status", title: "Status" }]} />
          </div>
          <Pagination page={q.data?.meta.page ?? page} pageSize={q.data?.meta.limit ?? 10} total={q.data?.meta.total ?? 0} onChange={setPage} />
        </>
      )}
    </section>
  );
}
