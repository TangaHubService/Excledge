import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Download, Loader2, ScrollText, ChevronRight, CheckCircle2, AlertTriangle, RefreshCw, Database, Bell, Boxes, Truck, X, Ship } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs";
import { RraItemClassPicker } from "../../../components/inventory/RraItemClassPicker";
import { toast } from "react-toastify";
import { apiClient } from "../../../lib/api-client";
import { useBranch } from "../../../context/BranchContext";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "../../../components/ui/drawer";

const todayIso = () => new Date().toISOString().split("T")[0];
const daysAgoIso = (n: number) => new Date(Date.now() - n * 864e5).toISOString().split("T")[0];

const money = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatInt = (n: number | null | undefined) => (Number(n ?? 0)).toLocaleString("en-US");

async function openPdf(fetcher: () => Promise<Response>, filename: string) {
  const res = await fetcher();
  if (!res.ok) {
    let msg = "Report generation failed";
    try {
      const j = await res.json();
      msg = j?.error ?? j?.message ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface DailyReport {
  reportType: "X" | "Z";
  reportDate: string;
  header: { orgName: string; tin: string | null; mrcNo: string | null; sdcId: string | null; branchName: string | null };
  counters: { firstRcptNo: number | null; lastRcptNo: number | null; lastTotalRcptNo: number | null; receiptCount: number; itemCount: number };
  summary: {
    normalSalesCount: number; normalRefundsCount: number; grossSalesAmt: number; grossRefundAmt: number;
    netSalesAmt: number; totalTaxAmt: number; trainingCount: number; trainingAmt: number; copyCount: number; copyAmt: number;
  };
  taxBands: Record<string, { taxableAmt: number; taxAmt: number; salesAmt: number }>;
  taxRates: Record<string, number>;
  paymentBreakdown: Record<string, number>;
  vsdcConfirmation: { checked: boolean; rptDe?: string; error?: string } | null;
}

interface EjEntry {
  id: number;
  saleId: number | null;
  invoiceNumber: string | null;
  ebmInvoiceNumber: string | null;
  rcptLabel: string | null;
  sdcRcptNo: number | null;
  totalRcptNo: number | null;
  sdcDateTime: string | null;
  ejSent: boolean;
  journalText: string | null;
  createdAt: string;
}

function DailyReportCard() {
  const { userBranches, selectedBranchId } = useBranch();
  const [type, setType] = useState<"X" | "Z">("X");
  const [date, setDate] = useState(todayIso());
  const [branchId, setBranchId] = useState<string>(selectedBranchId ? String(selectedBranchId) : "");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getDailyFiscalReport({ type, date, branchId: branchId || undefined });
      setReport((res?.data ?? res) as DailyReport);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load the report");
    } finally {
      setLoading(false);
    }
  }, [type, date, branchId]);

  // Auto-load, debounced — a Z report also fires a live VSDC cross-check, so
  // wait for the operator to stop changing the filters before running it.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 500);
    return () => clearTimeout(t);
  }, [load]);

  const download = async () => {
    setDownloading(true);
    try {
      await openPdf(
        () => apiClient.getDailyFiscalReportPdf({ type, date, branchId: branchId || undefined }),
        `${type}-report-${date}.pdf`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate the PDF");
    } finally {
      setDownloading(false);
    }
  };

  const taxRows = useMemo(() => {
    if (!report) return [];
    return ["A", "B", "C", "D"]
      .map((code) => ({ code, band: report.taxBands[code] ?? { taxableAmt: 0, taxAmt: 0, salesAmt: 0 }, rate: report.taxRates[code] ?? 0 }))
      .filter(({ code, band }) => code === "B" || band.salesAmt !== 0 || band.taxAmt !== 0);
  }, [report]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> Daily X / Z report
        </CardTitle>
        <CardDescription>
          X is an interim read of the day's totals; Z is the end-of-day closing record and is cross-checked with the VSDC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "X" | "Z")}>
              <SelectTrigger id="fr-type" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="X">X — interim</SelectItem>
                <SelectItem value="Z">Z — closing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr-date">Date</Label>
            <Input id="fr-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fr-branch">Branch</Label>
            <Select value={branchId || "all"} onValueChange={(v) => setBranchId(v === "all" ? "" : v)}>
              <SelectTrigger id="fr-branch" className="w-48"><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {userBranches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={download} disabled={downloading}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download PDF
          </Button>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {type === "Z" && (
          <p className="text-xs text-muted-foreground">
            The Z cross-check with the VSDC only runs when a single branch is selected (the device is registered per branch).
          </p>
        )}

        {report && (
          <div className="grid gap-4 rounded-lg border p-4 text-sm md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Counters</div>
              <Row label="First / last receipt no." value={`${report.counters.firstRcptNo ?? "—"} / ${report.counters.lastRcptNo ?? "—"}`} />
              <Row label="Total receipts (B)" value={report.counters.lastTotalRcptNo ?? "—"} />
              <Row label="Receipts this report" value={report.counters.receiptCount} />
              <Row label="Item lines sold" value={report.counters.itemCount} />
            </div>
            <div className="space-y-1.5">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Sales</div>
              <Row label={`Normal sales (${report.summary.normalSalesCount})`} value={money(report.summary.grossSalesAmt)} />
              <Row label={`Normal refunds (${report.summary.normalRefundsCount})`} value={`-${money(report.summary.grossRefundAmt)}`} />
              <Row label="Net sales" value={money(report.summary.netSalesAmt)} strong />
              <Row label="Total tax" value={money(report.summary.totalTaxAmt)} strong />
            </div>
            <div className="space-y-1.5">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Tax bands</div>
              {taxRows.map(({ code, band, rate }) => (
                <Row key={code} label={`${code} — ${rate}% (taxable / tax)`} value={`${money(band.taxableAmt)} / ${money(band.taxAmt)}`} />
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Payments & non-fiscal</div>
              {Object.entries(report.paymentBreakdown).map(([m, amt]) => (
                <Row key={m} label={m} value={money(amt)} />
              ))}
              <Row label={`Training receipts (${report.summary.trainingCount})`} value={money(report.summary.trainingAmt)} />
              <Row label={`Copy receipts (${report.summary.copyCount})`} value={money(report.summary.copyAmt)} />
            </div>
            {report.reportType === "Z" && (
              <div className="md:col-span-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
                {report.vsdcConfirmation?.checked && !report.vsdcConfirmation.error ? (
                  <><CheckCircle2 className="size-4 text-emerald-600" /> VSDC confirmed the Z-report for {report.vsdcConfirmation.rptDe}.</>
                ) : (
                  <><AlertTriangle className="size-4 text-amber-600" /> {report.vsdcConfirmation?.error ?? "VSDC confirmation not available."}</>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}

interface PluRow {
  itemCd: string; productName: string; unit: string; quantity: number;
  revenue: number; taxAmount: number; transactionCount: number;
}

function PluCard() {
  const [start, setStart] = useState(daysAgoIso(30));
  const [end, setEnd] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PluRow[] | null>(null);
  const [summary, setSummary] = useState<{ uniqueItemCodes: number; totalQuantity: number; totalRevenue: number; totalTax: number } | null>(null);

  const view = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getPluReport({ startDate: start, endDate: end, limit: 500 });
      const data = (res as any)?.data ?? res;
      setRows((data?.items ?? []) as PluRow[]);
      setSummary(data?.summary ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load the PLU report");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    const t = setTimeout(() => { view(); }, 400);
    return () => clearTimeout(t);
  }, [view]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="size-4" /> PLU report</CardTitle>
        <CardDescription>Quantity and revenue per item code, over a date range.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="plu-start">From</Label>
            <Input id="plu-start" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="plu-end">To</Label>
            <Input id="plu-end" type="date" value={end} max={todayIso()} onChange={(e) => setEnd(e.target.value)} className="w-40" />
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await openPdf(() => apiClient.getPluReportPdf({ startDate: start, endDate: end }), "PLU-report.pdf");
              } catch (e: any) {
                toast.error(e?.message ?? "Failed to generate the PLU report");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download PDF
          </Button>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {rows && (
          <>
            {summary && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span><b className="text-foreground tabular-nums">{summary.uniqueItemCodes}</b> item codes</span>
                <span><b className="text-foreground tabular-nums">{formatInt(summary.totalQuantity)}</b> units</span>
                <span><b className="text-foreground tabular-nums">{money(summary.totalRevenue)}</b> revenue</span>
                <span><b className="text-foreground tabular-nums">{money(summary.totalTax)}</b> tax</span>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item code</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No sales in this period.</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.itemCd}>
                      <TableCell className="font-mono text-xs">{r.itemCd}</TableCell>
                      <TableCell>{r.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(r.quantity)} {r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.taxAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ElectronicJournalCard() {
  const [start, setStart] = useState(daysAgoIso(7));
  const [end, setEnd] = useState(todayIso());
  const [entries, setEntries] = useState<EjEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ entry: EjEntry; detail: any } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getElectronicJournal({ startDate: start, endDate: end, limit: 100 });
      const data = res?.data ?? res;
      setEntries((data?.entries ?? []) as EjEntry[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load the electronic journal");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  const openEntry = async (entry: EjEntry) => {
    if (entry.saleId == null) return;
    setDetailLoading(true);
    setSelected({ entry, detail: null });
    try {
      const res = await apiClient.getElectronicJournalEntry(entry.saleId);
      setSelected({ entry, detail: res?.data ?? res });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load the journal entry");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ScrollText className="size-4" /> Electronic journal</CardTitle>
        <CardDescription>
          The journal is issued with every fiscal receipt and holds the same data as the printed slip — open an entry to compare them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ej-start">From</Label>
            <Input id="ej-start" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ej-end">To</Label>
            <Input id="ej-end" type="date" value={end} max={todayIso()} onChange={(e) => setEnd(e.target.value)} className="w-40" />
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />} Refresh
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date / time</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Receipt no.</TableHead>
                <TableHead className="text-center">EJ sent</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No journal entries for this period.</TableCell></TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => openEntry(e)}>
                  <TableCell className="whitespace-nowrap">{e.sdcDateTime ? new Date(e.sdcDateTime).toLocaleString() : new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{e.invoiceNumber ?? e.ebmInvoiceNumber ?? "—"}</TableCell>
                  <TableCell>{e.rcptLabel ?? "NS"}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.sdcRcptNo ?? "—"} / {e.totalRcptNo ?? "—"}</TableCell>
                  <TableCell className="text-center">{e.ejSent ? <CheckCircle2 className="mx-auto size-4 text-emerald-600" /> : <AlertTriangle className="mx-auto size-4 text-amber-600" />}</TableCell>
                  <TableCell className="text-right"><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Electronic journal — {selected?.entry.invoiceNumber ?? selected?.entry.saleId}</DialogTitle>
          </DialogHeader>
          {detailLoading || !selected?.detail ? (
            <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-overline uppercase tracking-wide text-muted-foreground">Journal (EJ_DATA)</div>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{selected.detail.journal?.text}</pre>
              </div>
              <div>
                <div className="mb-1 text-overline uppercase tracking-wide text-muted-foreground">Printed slip</div>
                <div className="max-h-80 space-y-1 overflow-auto rounded-md border p-3 text-xs">
                  {(selected.detail.slip?.items ?? []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between gap-3">
                      <span>{it.name} ×{it.quantity} [{it.taxCode ?? "A"}]</span>
                      <span className="tabular-nums">{money(it.totalPrice)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                    <span>TOTAL</span><span className="tabular-nums">{money(selected.detail.slip?.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>VAT</span><span className="tabular-nums">{money(selected.detail.slip?.vatAmount)}</span>
                  </div>
                </div>
                <div className={`mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${selected.detail.checks?.journalTotalMatchesSlip ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"}`}>
                  {selected.detail.checks?.journalTotalMatchesSlip
                    ? <><CheckCircle2 className="size-4" /> Journal total matches the printed slip.</>
                    : <><AlertTriangle className="size-4" /> Could not confirm the journal total against the slip.</>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface MasterDataStatus {
  counts: { codes: number; itemClasses: number; notices: number; unreadNotices: number };
  cursors: Array<{ resource: string; lastRunAt: string | null; lastResult: string | null }>;
}
interface RraNotice {
  id: number; noticeNo: number; title: string | null; cont: string | null; dtlUrl: string | null;
  regrNm: string | null; regDt: string | null; readAt: string | null;
}

interface ReconcileDetails {
  rraOnly: Array<{ itemCd: string; itemNm?: string; itemClsCd?: string; taxTyCd?: string }>;
  localOnly: Array<{ id: number; name: string; itemCd: string | null; ebmSyncStatus: string | null }>;
  mismatched: Array<{ productId: number; productName: string; itemCd: string; field: string; rra: string | number | null; local: string | number | null }>;
}

function MasterDataCard() {
  const [status, setStatus] = useState<MasterDataStatus | null>(null);
  const [notices, setNotices] = useState<RraNotice[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, n] = await Promise.all([apiClient.getRraMasterDataStatus(), apiClient.listRraNotices()]);
      setStatus(((s as any)?.data ?? s) as MasterDataStatus);
      setNotices((((n as any)?.data ?? n)?.notices ?? []) as RraNotice[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load RRA master-data status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncAll = async () => {
    setSyncing(true);
    try {
      await apiClient.syncAllRraMasterData();
      toast.success("Synced codes, classifications and notices from RRA");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "RRA sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const [reconciling, setReconciling] = useState(false);
  const [diff, setDiff] = useState<ReconcileDetails | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const reconcile = async () => {
    setReconciling(true);
    setDiff(null);
    try {
      const res = await apiClient.reconcileRraItems();
      const out = (res as any)?.data ?? res;
      setDiff(out?.details ?? null);
      toast.success(`Pulled ${out?.pulled ?? 0} item(s) from RRA`);
    } catch (e: any) {
      toast.error(e?.message ?? "Item reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  /** Register a local product with RRA — optionally applying RRA's value on a mismatch first. */
  const pushProduct = async (productId: number, label: string, overrides?: { itemClsCd?: string; taxCode?: string }) => {
    setRowBusy(productId);
    try {
      await apiClient.syncOneProductToRra(productId, overrides ?? {});
      toast.success(`"${label}" registered with RRA`);
      setDiff((d) => d && ({
        ...d,
        localOnly: d.localOnly.filter((x) => x.id !== productId),
        mismatched: d.mismatched.filter((x) => x.productId !== productId),
      }));
    } catch (e: any) {
      toast.error(e?.message ?? "Product sync failed");
    } finally {
      setRowBusy(null);
    }
  };

  const markRead = async (noticeNo: number) => {
    try {
      await apiClient.markRraNoticeRead(noticeNo);
      setNotices((prev) => prev.map((x) => (x.noticeNo === noticeNo ? { ...x, readAt: new Date().toISOString() } : x)));
      setStatus((s) => (s ? { ...s, counts: { ...s.counts, unreadNotices: Math.max(0, s.counts.unreadNotices - 1) } } : s));
    } catch { /* ignore */ }
  };

  const c = status?.counts;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="size-4" /> RRA master data</CardTitle>
        <CardDescription>
          Codes, item classifications (UNSPSC) and notices — pulled from the VSDC and cached locally. Syncs nightly; run it on demand here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={syncAll} disabled={syncing}>
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync now
          </Button>
          <Button variant="outline" onClick={reconcile} disabled={reconciling}>
            {reconciling ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Reconcile items with RRA
          </Button>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : c ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span><b className="text-foreground tabular-nums">{c.codes}</b> codes</span>
              <span><b className="text-foreground tabular-nums">{c.itemClasses}</b> classifications</span>
              <span><b className="text-foreground tabular-nums">{c.notices}</b> notices ({c.unreadNotices} unread)</span>
            </div>
          ) : null}
        </div>

        {diff && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{diff.localOnly.length}</b> local item(s) not yet at RRA ·{" "}
              <b className="text-foreground">{diff.mismatched.length}</b> mismatch(es) ·{" "}
              <b className="text-foreground">{diff.rraOnly.length}</b> at RRA only
            </p>
            {diff.localOnly.length + diff.mismatched.length + diff.rraOnly.length === 0 ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Everything is in sync with RRA.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Item code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.localOnly.map((it) => (
                      <TableRow key={`l-${it.id}`}>
                        <TableCell>{it.name}</TableCell>
                        <TableCell className="font-mono text-xs">{it.itemCd ?? "—"}</TableCell>
                        <TableCell>
                          <span className={it.ebmSyncStatus === "FAILED" ? "text-red-600" : "text-amber-600"}>
                            {it.ebmSyncStatus === "FAILED" ? "Sync failed" : "Not at RRA"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={rowBusy === it.id} onClick={() => pushProduct(it.id, it.name)}>
                            {rowBusy === it.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync to RRA
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {diff.mismatched.map((m, i) => (
                      <TableRow key={`m-${m.productId}-${m.field}-${i}`}>
                        <TableCell>{m.productName}</TableCell>
                        <TableCell className="font-mono text-xs">{m.itemCd}</TableCell>
                        <TableCell className="text-amber-600">
                          {m.field}: <span className="font-mono">{String(m.local ?? "—")}</span> → RRA <span className="font-mono">{String(m.rra ?? "—")}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={rowBusy === m.productId}
                            onClick={() => pushProduct(m.productId, m.productName, m.field === "itemClsCd"
                              ? { itemClsCd: String(m.rra ?? "") }
                              : { taxCode: String(m.rra ?? "") })}
                          >
                            {rowBusy === m.productId ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Use RRA value
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {diff.rraOnly.map((it) => (
                      <TableRow key={`r-${it.itemCd}`}>
                        <TableCell>{it.itemNm ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{it.itemCd}</TableCell>
                        <TableCell className="text-muted-foreground">At RRA only — add it to the catalog manually</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {notices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-overline uppercase tracking-wide text-muted-foreground">
              <Bell className="size-3.5" /> Notices
            </div>
            <div className="divide-y rounded-lg border">
              {notices.slice(0, 8).map((n) => (
                <div key={n.id} className={`flex items-start justify-between gap-3 p-3 text-sm ${n.readAt ? "" : "bg-muted/40"}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-blue-600" />}
                      <span className="font-medium">#{n.noticeNo} — {n.title ?? "(untitled)"}</span>
                    </div>
                    {n.cont && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{n.cont}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.regDt ?? ""}{n.regrNm ? ` · ${n.regrNm}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.dtlUrl && (
                      <a href={n.dtlUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open</a>
                    )}
                    {!n.readAt && (
                      <button type="button" onClick={() => markRead(n.noticeNo)} className="text-xs text-muted-foreground hover:text-foreground">Mark read</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RraPurchaseItem {
  id: number; itemSeq: number; itemNm: string | null; itemCd: string | null;
  qty: string | number; qtyUnitCd: string | null; prc: string | number;
  taxTyCd: string | null; taxblAmt: string | number | null; taxAmt: string | number | null; totAmt: string | number | null;
}
interface RraPurchase {
  id: number; spplrTin: string; spplrNm: string | null; spplrBhfId: string | null; spplrInvcNo: string | number;
  rcptTyCd: string | null; pmtTyCd: string | null; salesDt: string | null; remark: string | null;
  totItemCnt: number | null; totTaxblAmt: string | number | null; totTaxAmt: string | number | null; totAmt: string | number | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  items: RraPurchaseItem[];
}

const PMT_LABEL: Record<string, string> = {
  "01": "Cash", "02": "Cheque", "03": "Credit", "04": "Bank transfer", "05": "Card", "06": "Mobile money", "07": "Other",
};

function StockAndPurchasesCard() {
  const [stock, setStock] = useState<{ counts: Record<string, number>; failures: any[] } | null>(null);
  const [purchases, setPurchases] = useState<RraPurchase[]>([]);
  const [busy, setBusy] = useState<null | "stock" | "purchases">(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [selected, setSelected] = useState<RraPurchase | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([apiClient.getRraStockStatus(), apiClient.listRraPurchases()]);
      setStock(((s as any)?.data ?? s) as any);
      setPurchases((((p as any)?.data ?? p)?.purchases ?? []) as RraPurchase[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load stock / purchase status");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const syncStock = async () => {
    setBusy("stock");
    try {
      const res = await apiClient.syncRraStock();
      const out = (res as any)?.data ?? res;
      toast.success(`Stock sync: ${out?.succeeded ?? 0} sent, ${out?.failed ?? 0} failed`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Stock sync failed");
    } finally { setBusy(null); }
  };

  const syncPurchases = async () => {
    setBusy("purchases");
    try {
      const res = await apiClient.syncRraPurchases();
      const out = (res as any)?.data ?? res;
      toast.success(`Pulled ${out?.cached ?? 0} purchase(s) from RRA`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Purchase pull failed");
    } finally { setBusy(null); }
  };

  const openDetail = (p: RraPurchase) => {
    setSelected(p);
    setRejecting(false);
    setRejectReason("");
  };

  const action = async (id: number, reject: boolean) => {
    setRowBusy(id);
    try {
      await apiClient.confirmRraPurchase(id, reject);
      toast.success(reject ? "Purchase rejected" : "Purchase confirmed with RRA");
      setPurchases((prev) => prev.map((x) => (x.id === id ? { ...x, status: reject ? "REJECTED" : "CONFIRMED" } : x)));
      setSelected(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally { setRowBusy(null); }
  };

  const sc = stock?.counts ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes className="size-4" /> Stock &amp; purchases</CardTitle>
        <CardDescription>
          Non-sale stock movements are reported to the VSDC as stock in/out; B2B purchases issued to you are pulled from RRA and confirmed here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={syncStock} disabled={busy === "stock"}>
            {busy === "stock" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync stock now
          </Button>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span><b className="text-foreground tabular-nums">{sc.PENDING ?? 0}</b> pending</span>
            <span><b className="text-emerald-600 tabular-nums">{sc.SYNCED ?? 0}</b> synced</span>
            <span><b className="text-amber-600 tabular-nums">{sc.FAILED ?? 0}</b> failed</span>
          </div>
        </div>
        {stock?.failures?.length ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            {stock.failures.slice(0, 3).map((f) => (
              <div key={f.id}>{f.product?.name ?? `#${f.id}`} — {f.ebmError}</div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-overline uppercase tracking-wide text-muted-foreground">
              <Truck className="size-3.5" /> Received purchases (RRA)
            </div>
            <Button size="sm" variant="outline" onClick={syncPurchases} disabled={busy === "purchases"}>
              {busy === "purchases" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Pull from RRA
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No purchases pulled from RRA.</TableCell></TableRow>
                )}
                {purchases.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => openDetail(p)}>
                    <TableCell>{p.spplrNm ?? p.spplrTin}</TableCell>
                    <TableCell className="font-mono text-xs">{String(p.spplrInvcNo)}</TableCell>
                    <TableCell>{p.salesDt ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.totItemCnt ?? p.items.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(Number(p.totAmt))}</TableCell>
                    <TableCell>
                      <span className={
                        p.status === "CONFIRMED" ? "text-emerald-600" : p.status === "REJECTED" ? "text-muted-foreground" : "text-amber-600"
                      }>{p.status}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {p.status === "PENDING" ? "Review" : "View"} <ChevronRight className="size-3.5" />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <Drawer open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DrawerContent className="sm:max-w-xl">
          <DrawerHeader className="px-0 pt-0">
            <DrawerTitle>Purchase invoice {selected ? String(selected.spplrInvcNo) : ""}</DrawerTitle>
          </DrawerHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Supplier</span><div>{selected.spplrNm ?? "—"}</div></div>
                <div><span className="text-muted-foreground">Supplier TIN</span><div className="font-mono">{selected.spplrTin}</div></div>
                <div><span className="text-muted-foreground">Invoice no.</span><div className="font-mono">{String(selected.spplrInvcNo)}</div></div>
                <div><span className="text-muted-foreground">Date</span><div>{selected.salesDt ?? "—"}</div></div>
                <div><span className="text-muted-foreground">Payment</span><div>{PMT_LABEL[selected.pmtTyCd ?? ""] ?? selected.pmtTyCd ?? "—"}</div></div>
                <div><span className="text-muted-foreground">Status</span><div>{selected.status}</div></div>
                {selected.remark && <div className="col-span-2"><span className="text-muted-foreground">Remark</span><div>{selected.remark}</div></div>}
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-center">Tax</TableHead>
                      <TableHead className="text-right">Tax amt</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="text-muted-foreground">{it.itemSeq}</TableCell>
                        <TableCell>
                          {it.itemNm ?? "Item"}
                          {it.itemCd && <span className="ml-1 font-mono text-xs text-muted-foreground">{it.itemCd}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(Number(it.qty))} {it.qtyUnitCd ?? ""}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(Number(it.prc))}</TableCell>
                        <TableCell className="text-center">{it.taxTyCd ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(Number(it.taxAmt))}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(Number(it.totAmt))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-end gap-0.5 text-sm">
                <div><span className="text-muted-foreground mr-3">Taxable</span><span className="tabular-nums">{money(Number(selected.totTaxblAmt))}</span></div>
                <div><span className="text-muted-foreground mr-3">Tax</span><span className="tabular-nums">{money(Number(selected.totTaxAmt))}</span></div>
                <div className="font-semibold"><span className="text-muted-foreground mr-3">Total</span><span className="tabular-nums">{money(Number(selected.totAmt))}</span></div>
              </div>

              {selected.status === "PENDING" && (
                rejecting ? (
                  <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Reject this purchase?</p>
                    <p className="text-xs text-red-700/80 dark:text-red-400/80">
                      It will be marked as not accepted and no stock will be recorded. This can't be undone from here.
                    </p>
                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="bg-background"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Back</Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rowBusy === selected.id}
                        onClick={() => action(selected.id, true)}
                      >
                        {rowBusy === selected.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Reject purchase
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between gap-2 border-t pt-3">
                    <Button variant="ghost" onClick={() => setRejecting(true)} disabled={rowBusy === selected.id}>
                      <X className="size-4" /> Reject
                    </Button>
                    <Button onClick={() => action(selected.id, false)} disabled={rowBusy === selected.id}>
                      {rowBusy === selected.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirm with RRA
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

interface RraImport {
  id: number; taskCd: string; dclNo: string | null; dclDe: string; itemSeq: number;
  hsCd: string | null; itemNm: string | null; orgnNatCd: string | null; spplrNm: string | null;
  qty: string | number | null; invcFcurAmt: string | number | null; invcFcurCd: string | null;
  itemClsCd: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; remark: string | null;
}

function ImportDeclarationsCard() {
  const [requestDate, setRequestDate] = useState("");
  const [imports, setImports] = useState<RraImport[]>([]);
  const [lastReq, setLastReq] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<null | { line: RraImport; kind: "approve" | "reject" }>(null);
  const [clsCd, setClsCd] = useState("");
  const [remark, setRemark] = useState("");
  const [rowBusy, setRowBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.listRraImports();
      const data = (res as any)?.data ?? res;
      setImports((data?.imports ?? []) as RraImport[]);
      setLastReq(data?.lastRequestDate ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load import declarations");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await apiClient.syncRraImports(requestDate || undefined);
      const out = (res as any)?.data ?? res;
      toast.success(`Pulled ${out?.cached ?? 0} import line(s) from RRA`);
      setRequestDate("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Import pull failed");
    } finally { setBusy(false); }
  };

  const openAction = (line: RraImport, kind: "approve" | "reject") => {
    setAction({ line, kind });
    setClsCd(line.itemClsCd ?? "");
    setRemark("");
  };

  const submitAction = async () => {
    if (!action) return;
    setRowBusy(true);
    try {
      await apiClient.actionRraImport(action.line.id, action.kind, {
        itemClsCd: action.kind === "approve" ? clsCd || undefined : undefined,
        remark: remark || undefined,
      });
      toast.success(action.kind === "approve" ? "Import line approved with RRA" : "Import line rejected");
      setImports((prev) => prev.map((x) => (x.id === action.line.id ? { ...x, status: action.kind === "approve" ? "APPROVED" : "REJECTED" } : x)));
      setAction(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally { setRowBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ship className="size-4" /> Import declarations</CardTitle>
        <CardDescription>
          Import declaration lines pulled from RRA. Classify and approve or reject each one — an approval books the stock-in. Each pull's request date must be later than the previous one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="imp-date">Request from date <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="imp-date" type="date" value={requestDate} max={todayIso()} onChange={(e) => setRequestDate(e.target.value)} className="w-40" />
          </div>
          <Button onClick={sync} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Pull from RRA
          </Button>
          {lastReq && <span className="text-xs text-muted-foreground">Last request: {lastReq}</span>}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Declaration</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>HS code</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No import declarations pulled from RRA.</TableCell></TableRow>
              )}
              {imports.map((im) => (
                <TableRow key={im.id}>
                  <TableCell className="font-mono text-xs">{im.dclNo ?? im.taskCd}<span className="text-muted-foreground"> · {im.dclDe}</span></TableCell>
                  <TableCell>{im.itemNm ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{im.hsCd ?? "—"}</TableCell>
                  <TableCell>{im.orgnNatCd ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{im.qty != null ? Number(im.qty) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{im.invcFcurAmt != null ? `${Number(im.invcFcurAmt).toLocaleString()} ${im.invcFcurCd ?? ""}` : "—"}</TableCell>
                  <TableCell>
                    <span className={im.status === "APPROVED" ? "text-emerald-600" : im.status === "REJECTED" ? "text-muted-foreground" : "text-amber-600"}>{im.status}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {im.status === "PENDING" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openAction(im, "approve")}>
                          <CheckCircle2 className="size-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openAction(im, "reject")}><X className="size-3.5" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "approve" ? "Approve import line" : "Reject import line"}</DialogTitle>
          </DialogHeader>
          {action && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {action.line.itemNm} — declaration {action.line.dclNo ?? action.line.taskCd}, line {action.line.itemSeq}
              </p>
              {action.kind === "approve" && (
                <RraItemClassPicker value={clsCd} onChange={setClsCd} />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="imp-remark">Remark <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="imp-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Reason / note" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
                <Button onClick={submitAction} disabled={rowBusy}>
                  {rowBusy ? <Loader2 className="size-4 animate-spin" /> : action.kind === "approve" ? <CheckCircle2 className="size-4" /> : <X className="size-4" />}
                  {action.kind === "approve" ? "Approve with RRA" : "Reject"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const TABS = [
  { value: "daily", label: "Daily X / Z", icon: FileText },
  { value: "plu", label: "PLU", icon: FileText },
  { value: "journal", label: "Journal", icon: ScrollText },
  { value: "masterdata", label: "Master data", icon: Database },
  { value: "stock", label: "Stock & purchases", icon: Boxes },
  { value: "imports", label: "Imports", icon: Ship },
] as const;

const TAB_STORAGE_KEY = "fiscal-reports-tab";

export function FiscalReportsPage() {
  const [tab, setTab] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && TABS.some((t) => t.value === saved)) return saved;
    } catch { /* ignore */ }
    return "daily";
  });

  // Small attention signals shown as a dot on the relevant tab.
  const [signals, setSignals] = useState<{ notices: number; imports: number; purchases: number }>({ notices: 0, imports: 0, purchases: 0 });
  useEffect(() => {
    (async () => {
      try {
        const [md, imp, pur] = await Promise.all([
          apiClient.getRraMasterDataStatus().catch(() => null),
          apiClient.listRraImports("PENDING").catch(() => null),
          apiClient.listRraPurchases("PENDING").catch(() => null),
        ]);
        setSignals({
          notices: ((md as any)?.data ?? md)?.counts?.unreadNotices ?? 0,
          imports: (((imp as any)?.data ?? imp)?.imports ?? []).length,
          purchases: (((pur as any)?.data ?? pur)?.purchases ?? []).length,
        });
      } catch { /* ignore */ }
    })();
  }, []);

  const changeTab = (v: string) => {
    setTab(v);
    try { localStorage.setItem(TAB_STORAGE_KEY, v); } catch { /* ignore */ }
  };

  const dotFor = (v: string) => {
    if (v === "masterdata" && signals.notices > 0) return true;
    if (v === "imports" && signals.imports > 0) return true;
    if (v === "stock" && signals.purchases > 0) return true;
    return false;
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-h1 font-semibold">Fiscal reports</h1>
        <p className="text-body-sm text-muted-foreground">
          RRA CIS/VSDC daily X/Z reports, the PLU report, the electronic journal, RRA master data, and stock, purchase &amp; import sync.
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-none gap-1.5 px-3 py-1.5">
                <Icon className="size-4" />
                {label}
                {dotFor(value) && <span className="ml-0.5 size-1.5 rounded-full bg-blue-600" aria-hidden="true" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="daily" className="mt-4"><DailyReportCard /></TabsContent>
        <TabsContent value="plu" className="mt-4"><PluCard /></TabsContent>
        <TabsContent value="journal" className="mt-4"><ElectronicJournalCard /></TabsContent>
        <TabsContent value="masterdata" className="mt-4"><MasterDataCard /></TabsContent>
        <TabsContent value="stock" className="mt-4"><StockAndPurchasesCard /></TabsContent>
        <TabsContent value="imports" className="mt-4"><ImportDeclarationsCard /></TabsContent>
      </Tabs>
    </div>
  );
}

export default FiscalReportsPage;
