import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { Link } from "react-router-dom";
import { Skeleton } from "../components/ui/Skeleton";
import { Pagination } from "../components/Pagination";
import { queryKeys } from "../api/queryKeys";
import { FileText, Search, Filter, Calendar, CreditCard, User, Store } from "lucide-react";
import { Select } from "../components/ui/Select";

export function SalesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const branches = useQuery({ 
    queryKey: queryKeys.branches(), 
    queryFn: async () => (await api.get("/branches")).data.data as any[] 
  });
  
  const list = useQuery({
    queryKey: queryKeys.sales({ page, search, branchId, cashierId, paymentMethod, fromDate, toDate }),
    queryFn: async () =>
      (await api.get("/sales", { 
        params: { 
          page, 
          pageSize: 10, 
          search, 
          branchId: branchId || undefined, 
          cashierId: cashierId || undefined, 
          paymentMethod: paymentMethod || undefined, 
          fromDate: fromDate || undefined, 
          toDate: toDate || undefined 
        } 
      })).data,
  });

  return (
    <div className="page-stack">
      <div className="section-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Sales Transactions</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
            View and manage historical sales data. Use <Link to="/pos" style={{ color: 'var(--primary)', fontWeight: 600 }}>POS</Link> for new sales.
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Filter size={18} color="var(--primary)" />
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Advanced Filters</h3>
        </div>
        
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="form-field">
            <label><Search size={12} style={{ marginRight: '4px' }} /> Invoice / Reference</label>
            <input placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          
          <div className="form-field">
            <label><Store size={12} style={{ marginRight: '4px' }} /> Branch</label>
            <Select
              value={branchId}
              onChange={(val) => { setBranchId(val); setPage(1); }}
              placeholder="All Branches"
              options={[
                { value: "", label: "All Branches" },
                ...(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name }))
              ]}
            />
          </div>

          <div className="form-field">
            <label><User size={12} style={{ marginRight: '4px' }} /> Cashier ID</label>
            <input placeholder="ID..." value={cashierId} onChange={(e) => { setCashierId(e.target.value); setPage(1); }} />
          </div>

          <div className="form-field">
            <label><CreditCard size={12} style={{ marginRight: '4px' }} /> Payment</label>
            <Select
              value={paymentMethod}
              onChange={(val) => { setPaymentMethod(val); setPage(1); }}
              placeholder="All Methods"
              options={[
                { value: "", label: "All Methods" },
                { value: "CASH", label: "Cash" },
                { value: "MOBILE_MONEY", label: "Mobile Money" }
              ]}
            />
          </div>

          <div className="form-field">
            <label><Calendar size={12} style={{ marginRight: '4px' }} /> From Date</label>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
          </div>

          <div className="form-field">
            <label><Calendar size={12} style={{ marginRight: '4px' }} /> To Date</label>
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
          </div>
        </div>
      </div>

      {list.isLoading ? (
        <div className="panel" style={{ display: "grid", gap: '12px' }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      ) : (
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={18} color="var(--primary)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Recent Invoices</h3>
          </div>
          
          <DataTable
            rows={list.data?.data ?? []}
            columns={[
              { key: "invoiceNo", title: "Invoice", render: (row: any) => <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{String(row.invoiceNo)}</span> },
              { key: "branchId", title: "Branch", render: (row: any) => <span>Branch #{String(row.branchId)}</span> },
              { key: "cashierId", title: "Cashier", render: (row: any) => <span style={{ color: 'var(--text-muted)' }}>ID: {String(row.cashierId)}</span> },
              { key: "paymentMethod", title: "Method", render: (row: any) => (
                <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {String(row.paymentMethod)}
                </span>
              )},
              { key: "certificationStatus", title: "Status", render: (row: any) => (
                <span style={{ color: row.certificationStatus === 'CERTIFIED' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                  {String(row.certificationStatus)}
                </span>
              )},
              { key: "totalAmount", title: "Total (RWF)", render: (row: any) => <span style={{ fontWeight: 700 }}>{Number(row.totalAmount).toLocaleString()}</span> },
              { key: "createdAt", title: "Date", render: (row: any) => <span style={{ color: 'var(--text-muted)' }}>{new Date(String(row.createdAt)).toLocaleDateString()}</span> },
            ]}
          />
          
          <div style={{ marginTop: '16px' }}>
            <Pagination 
              page={list.data?.page ?? page} 
              pageSize={list.data?.pageSize ?? 10} 
              total={list.data?.total ?? 0} 
              onChange={setPage} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
