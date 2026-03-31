import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { Link } from "react-router-dom";
import { Skeleton } from "../components/ui/Skeleton";
import { Pagination } from "../components/Pagination";
import { queryKeys } from "../api/queryKeys";

export function SalesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const branches = useQuery({ queryKey: queryKeys.branches(), queryFn: async () => (await api.get("/branches")).data.data as any[] });
  const list = useQuery({
    queryKey: queryKeys.sales({ page, search, branchId, cashierId, paymentMethod, fromDate, toDate }),
    queryFn: async () =>
      (await api.get("/sales", { params: { page, pageSize: 10, search, branchId: branchId || undefined, cashierId: cashierId || undefined, paymentMethod: paymentMethod || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined } })).data,
  });
  return (
    <section className="page-stack">
      <h1>Sales History</h1>
      <p>Use <Link to="/pos">POS</Link> to record new sales.</p>
      <div className="sales-filters panel">
        <input placeholder="Search invoice/reference" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
          <option value="">All branches</option>
          {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input placeholder="Cashier ID" value={cashierId} onChange={(e) => { setCashierId(e.target.value); setPage(1); }} />
        <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}>
          <option value="">All payments</option>
          <option value="CASH">Cash</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
      </div>
      {list.isLoading ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : (
        <div className="panel">
          <DataTable
            rows={list.data?.data ?? []}
            columns={[
              { key: "invoiceNo", title: "Invoice" },
              { key: "branchId", title: "Branch" },
              { key: "cashierId", title: "Cashier" },
              { key: "paymentMethod", title: "Payment" },
              { key: "certificationStatus", title: "Status" },
              { key: "totalAmount", title: "Total (RWF)" },
              { key: "createdAt", title: "Date", render: (row) => new Date(String(row.createdAt)).toLocaleString() },
            ]}
          />
        </div>
      )}
      {!list.isLoading ? (
        <Pagination page={list.data?.page ?? page} pageSize={list.data?.pageSize ?? 10} total={list.data?.total ?? 0} onChange={setPage} />
      ) : null}
    </section>
  );
}
