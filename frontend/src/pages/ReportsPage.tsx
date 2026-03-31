import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { Skeleton } from "../components/ui/Skeleton";
import { Pagination } from "../components/Pagination";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ReportsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [range, setRange] = useState("30d");
  const pageSize = 8;
  const filters = useMemo(() => ({ range }), [range]);

  const stock = useQuery({ queryKey: ["report-stock-on-hand", filters], queryFn: async () => (await api.get("/reports/stock-on-hand")).data.data as any[] });
  const low = useQuery({ queryKey: ["report-low-stock", filters], queryFn: async () => (await api.get("/reports/low-stock")).data.data as any[] });
  const top = useQuery({ queryKey: ["report-top", filters], queryFn: async () => (await api.get("/reports/top-selling-products")).data.data as any[] });
  const sales = useQuery({ queryKey: ["report-sales", filters], queryFn: async () => (await api.get("/reports/sales")).data.data as any[] });
  const purchases = useQuery({ queryKey: ["report-purchases", filters], queryFn: async () => (await api.get("/reports/purchases")).data.data as any[] });
  const movements = useQuery({ queryKey: ["report-movements", filters], queryFn: async () => (await api.get("/reports/stock-movement")).data.data as any[] });
  const value = useQuery({ queryKey: ["report-value", filters], queryFn: async () => (await api.get("/reports/inventory-value-summary")).data.data });

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stock.data ?? [];
    return (stock.data ?? []).filter((x: any) => String(x.productId).toLowerCase().includes(q) || String(x.branchId).toLowerCase().includes(q));
  }, [search, stock.data]);
  const pagedStock = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStock.slice(start, start + pageSize);
  }, [filteredStock, page]);

  const salesSeries = useMemo(
    () => (sales.data ?? []).slice(0, 8).reverse().map((x: any, i) => ({ name: `D${i + 1}`, value: Number(x.totalAmount) })),
    [sales.data],
  );
  const movementSeries = useMemo(
    () => (movements.data ?? []).slice(0, 8).reverse().map((x: any, i) => ({ name: `M${i + 1}`, value: Math.abs(Number(x.quantityDelta)) })),
    [movements.data],
  );
  const loading = stock.isLoading || low.isLoading || top.isLoading || sales.isLoading || purchases.isLoading || movements.isLoading || value.isLoading;

  return (
    <section className="reports">
      <header className="reports-head">
        <h1>Reports</h1>
        <div className="reports-filters">
          <input placeholder="Search stock table..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </header>

      <div className="reports-charts">
        <div className="panel">
          <h3>Sales Trend</h3>
          {loading ? <Skeleton height={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={salesSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line dataKey="value" stroke="var(--primary)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="panel">
          <h3>Stock Movement Volume</h3>
          {loading ? <Skeleton height={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={movementSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="var(--success)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Inventory Value Summary</h3>
        <p className="report-highlight">RWF {Number(value.data?.totalValue ?? 0).toLocaleString()}</p>
      </div>

      <div className="reports-grid">
        <div className="panel">
          <h3>Stock On Hand</h3>
          {stock.isLoading ? <Skeleton height={180} /> : (
            <>
              <DataTable rows={pagedStock} columns={[{ key: "branchId", title: "Branch" }, { key: "productId", title: "Product" }, { key: "quantity", title: "Qty" }]} />
              <Pagination page={page} pageSize={pageSize} total={filteredStock.length} onChange={setPage} />
            </>
          )}
        </div>
        <div className="panel">
          <h3>Top Selling Products</h3>
          {top.isLoading ? <Skeleton height={180} /> : (
            <DataTable rows={top.data ?? []} columns={[{ key: "productName", title: "Product" }, { key: "quantity", title: "Qty Sold" }]} />
          )}
        </div>
      </div>
    </section>
  );
}
