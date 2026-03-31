import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { FilterBar, type ReportFilters } from "../../components/reports/FilterBar";
import { DataTable } from "../../components/DataTable";
import { Pagination } from "../../components/Pagination";
import { Skeleton } from "../../components/ui/Skeleton";
import { useReportQuery } from "../../hooks/useReportQuery";

export function TopProductsReportPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ReportFilters>({});
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches")).data.data as Array<{ id: string; name: string }> });
  const params = useMemo(() => ({ ...filters, page, limit: 10 }), [filters, page]);
  const q = useReportQuery<any>(["report-top-products", params], "/reports/top-products", params);
  return (
    <section className="page-stack">
      <h1>Top Selling Products</h1>
      <FilterBar filters={filters} branches={branches.data ?? []} onChange={(v) => { setFilters(v); setPage(1); }} onReset={() => { setFilters({}); setPage(1); }} />
      {q.isLoading ? <Skeleton height={180} /> : (
        <>
          <div className="panel">
            <DataTable rows={q.data?.data ?? []} columns={[{ key: "productName", title: "Product Name" }, { key: "quantitySold", title: "Quantity Sold" }, { key: "totalRevenue", title: "Total Revenue (RWF)" }]} />
          </div>
          <Pagination page={q.data?.meta.page ?? page} pageSize={q.data?.meta.limit ?? 10} total={q.data?.meta.total ?? 0} onChange={setPage} />
        </>
      )}
    </section>
  );
}
