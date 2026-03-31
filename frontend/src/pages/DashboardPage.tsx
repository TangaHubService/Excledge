import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../api/queryKeys";
import { api } from "../api/client";
import { StateView } from "../components/StateView";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "../i18n";

export function DashboardPage() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => (await api.get("/dashboard/summary")).data.data,
  });
  const salesSeries = (data?.recentSales ?? []).slice(0, 7).map((x: any, i: number) => ({ name: `S${i + 1}`, value: Number(x.totalAmount) }));
  const movementSeries = (data?.recentPurchases ?? []).slice(0, 4).map((x: any, i: number) => ({
    name: `W${i + 1}`,
    stockIn: Number(x.totalAmount),
    stockOut: Number(data?.recentSales?.[i]?.totalAmount ?? 0),
  }));
  const todaySales = (data?.recentSales ?? []).reduce((sum: number, s: any) => sum + Number(s.totalAmount), 0);

  return (
    <section className="dash-screen">
      <p className="dash-intro">{t("welcome")}</p>
      <StateView isLoading={isLoading} isError={isError} />
      {!isLoading && !isError ? (
        <>
          <div className="dash-kpis">
            <article className="kpi blue"><h3>{t("totalProducts")}</h3><p>{data.totalProducts}</p></article>
            <article className="kpi green"><h3>{t("totalStockValue")}</h3><p>RWF {Number(data.totalStockQuantity || 0).toLocaleString()}</p></article>
            <article className="kpi orange"><h3>{t("lowStockItems")}</h3><p>{data.lowStockItems}</p></article>
            <article className="kpi red"><h3>{t("todaysSales")}</h3><p>RWF {todaySales.toLocaleString()}</p></article>
          </div>
          <div className="dash-charts">
            <div className="panel">
              <h3>{t("salesTrend")}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={salesSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="value" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h3>{t("stockMovements")}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={movementSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="stockIn" fill="#3f8c51" />
                  <Bar dataKey="stockOut" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="dash-bottom">
            <div className="panel">
              <h3>{t("recentSales")}</h3>
              <table className="table">
                <thead><tr><th>Invoice #</th><th>Amount (RWF)</th></tr></thead>
                <tbody>
                  {(data.recentSales ?? []).slice(0, 5).map((item: any) => (
                    <tr key={item.id}><td>{item.invoiceNo}</td><td>{Number(item.totalAmount).toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>{t("lowStockAlerts")}</h3>
              <table className="table">
                <thead><tr><th>Product</th><th>Stock Level</th></tr></thead>
                <tbody>
                  <tr><td>Paracetamol</td><td>5</td></tr>
                  <tr><td>Sugar</td><td>8</td></tr>
                  <tr><td>Soft Drinks</td><td>3</td></tr>
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>{t("pendingPurchaseOrders")}</h3>
              <p className="big-number">6</p>
              <p>{t("monthlyReports")}</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
