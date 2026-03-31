import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../api/queryKeys";
import { api } from "../api/client";
import { StateView } from "../components/StateView";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "../i18n";
import { TrendingUp, Package, AlertCircle, ShoppingCart } from "lucide-react";
import { Button } from "../components/ui/Button";

export function DashboardPage() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => (await api.get("/dashboard/summary")).data.data,
  });
  
  const salesSeries = (data?.recentSales ?? []).slice(0, 7).map((x: any, i: number) => ({ name: `Day ${i + 1}`, value: Number(x.totalAmount) }));
  const movementSeries = (data?.recentPurchases ?? []).slice(0, 4).map((x: any, i: number) => ({
    name: `Week ${i + 1}`,
    stockIn: Number(x.totalAmount),
    stockOut: Number(data?.recentSales?.[i]?.totalAmount ?? 0),
  }));
  const todaySales = (data?.recentSales ?? []).reduce((sum: number, s: any) => sum + Number(s.totalAmount), 0);

  return (
    <div className="dash-screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Dashboard</h1>
          <p className="dash-intro">{t("welcome")}</p>
        </div>
      </div>

      <StateView isLoading={isLoading} isError={isError} />
      
      {!isLoading && !isError ? (
        <>
          <div className="dash-kpis">
            <article className="kpi blue">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>{t("totalProducts")}</h3>
                <Package size={20} color="#3b82f6" />
              </div>
              <p>{data.totalProducts}</p>
            </article>
            <article className="kpi green">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>{t("totalStockValue")}</h3>
                <TrendingUp size={20} color="#10b981" />
              </div>
              <p>RWF {Number(data.totalStockQuantity || 0).toLocaleString()}</p>
            </article>
            <article className="kpi orange">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>{t("lowStockItems")}</h3>
                <AlertCircle size={20} color="#f59e0b" />
              </div>
              <p>{data.lowStockItems}</p>
            </article>
            <article className="kpi red">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>{t("todaysSales")}</h3>
                <ShoppingCart size={20} color="#ef4444" />
              </div>
              <p>RWF {todaySales.toLocaleString()}</p>
            </article>
          </div>

          <div className="dash-charts">
            <div className="panel">
              <h3>{t("salesTrend")}</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={salesSeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)', background: 'var(--card)', color: 'var(--text)' }}
                    itemStyle={{ fontSize: '13px' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h3>{t("stockMovements")}</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={movementSeries} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)', background: 'var(--card)', color: 'var(--text)' }}
                    itemStyle={{ fontSize: '13px' }}
                  />
                  <Bar dataKey="stockIn" fill="var(--success)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="stockOut" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dash-bottom">
            <div className="panel" style={{ flex: 1 }}>
              <h3>{t("recentSales")}</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Invoice #</th><th>Amount (RWF)</th></tr></thead>
                  <tbody>
                    {(data.recentSales ?? []).length ? (data.recentSales ?? []).slice(0, 5).map((item: any) => (
                      <tr key={item.id}><td>{item.invoiceNo}</td><td>{Number(item.totalAmount).toLocaleString()}</td></tr>
                    )) : (
                      <tr><td colSpan={2} style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)" }}>No recent sales</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel" style={{ flex: 1 }}>
              <h3>{t("lowStockAlerts")}</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Product</th><th>Stock Level</th></tr></thead>
                  <tbody>
                    <tr><td>Paracetamol</td><td><span style={{ color: 'var(--danger)', fontWeight: 600 }}>5</span></td></tr>
                    <tr><td>Sugar</td><td><span style={{ color: 'var(--warning)', fontWeight: 600 }}>8</span></td></tr>
                    <tr><td>Soft Drinks</td><td><span style={{ color: 'var(--danger)', fontWeight: 600 }}>3</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel" style={{ flex: 0.8 }}>
              <h3>{t("pendingOrders")}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                <p className="big-number">6</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Actions required</p>
                <Button variant="ghost" style={{ marginTop: '8px' }}>View all orders</Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
