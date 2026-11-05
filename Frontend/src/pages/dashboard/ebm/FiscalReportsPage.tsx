import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Download, Loader2, ScrollText, ChevronRight, CheckCircle2, AlertTriangle, RefreshCw, Database, Bell, Boxes, Truck, X, Ship, Shield, Eye, ExternalLink, Send, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs";
import { RraItemClassPicker } from "../../../components/inventory/RraItemClassPicker";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { parseInventoryGetProductsResponse } from "../../../lib/inventory-response";
import { toast } from "react-toastify";
import { toastError, toastWarning } from "../../../lib/friendly-error";
import { apiClient } from "../../../lib/api-client";
import { useBranch } from "../../../context/BranchContext";
import { Button } from "../../../components/ui/button";
import { StatusBadge } from "../../../components/ui/status-badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";

const todayIso = () => new Date().toISOString().split("T")[0];
const daysAgoIso = (n: number) => new Date(Date.now() - n * 864e5).toISOString().split("T")[0];

/**
 * Truncate for table cells without colliding into neighbors. Caps characters at `max`, and also
 * uses CSS ellipsis inside a bounded width.
 */
function TruncatedText({
  value,
  max = 50,
  className,
}: {
  value: string | null | undefined;
  max?: number;
  className?: string;
}) {
  const full = (value ?? "").trim();
  if (!full) return <span className={className}>—</span>;
  const truncated = full.length > max;
  const display = truncated ? `${full.slice(0, max)}…` : full;
  const text = (
    <span
      className={`block min-w-0 max-w-full truncate ${className ?? ""}`}
      title={truncated ? undefined : full}
    >
      {display}
    </span>
  );
  if (!truncated) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="m-0 block w-full min-w-0 max-w-full cursor-default border-0 bg-transparent p-0 text-left text-inherit"
        >
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="z-[80] max-w-xs whitespace-pre-wrap break-words">
        {full}
      </TooltipContent>
    </Tooltip>
  );
}

const formatDclDe = (raw: string | null | undefined): string => {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return raw ?? "—";
};

const formatLastReqDt = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length >= 14) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}`;
  }
  if (d.length >= 8) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return raw;
};

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
    openingDeposit?: number; proformaCount?: number; proformaAmt?: number;
    discountTotal?: number; otherReductionsAmt?: number; incompleteSalesCount?: number;
  };
  taxBands: Record<string, { taxableAmt: number; taxAmt: number; salesAmt: number }>;
  taxRates: Record<string, number>;
  paymentBreakdown: Record<string, number>;
  vsdcConfirmation: { checked: boolean; rptDe?: string; savedAt?: string; error?: string } | null;
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
  const [sendingZ, setSendingZ] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getDailyFiscalReport({ type, date, branchId: branchId || undefined });
      setReport((res?.data ?? res) as DailyReport);
    } catch (e: any) {
      toastError(e, "Could not load the report");
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
      toastError(e, "Could not generate the PDF");
    } finally {
      setDownloading(false);
    }
  };

  // The VSDC saves the Z report for "now", so it can only be sent for today, per device (branch).
  const canSendZ = type === "Z" && !!branchId && date === todayIso();
  const sendZ = async () => {
    setSendingZ(true);
    try {
      const res = await apiClient.submitVsdcZReport({ branchId: Number(branchId) });
      const out = (res as any)?.data ?? res;
      if (out?.verified) toast.success(`Z report for ${out.rptDeDate ?? date} was sent to RRA and confirmed.`);
      else toastWarning(`Z report for ${out?.rptDeDate ?? date} was sent, but RRA has not confirmed it yet. Check again in a few minutes.`, out?.verifyError);
      await load();
    } catch (e: any) {
      toastError(e, "Could not send the Z report to RRA");
    } finally {
      setSendingZ(false);
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
          {type === "Z" && (
            <Button onClick={sendZ} disabled={!canSendZ || sendingZ}>
              {sendingZ ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Z report to RRA
            </Button>
          )}
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {type === "Z" && (
          <p className="text-xs text-muted-foreground">
            The VSDC cross-check and sending to RRA need a single branch (the device is registered per branch). Sending is only for today&apos;s Z report.
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
              <Row label={`Normal refunds (${report.summary.normalRefundsCount})`} value={report.summary.grossRefundAmt ? `-${money(report.summary.grossRefundAmt)}` : money(0)} />
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
              <Row label="Opening deposit" value={money(report.summary.openingDeposit ?? 0)} />
              <Row label={`Proforma receipts (${report.summary.proformaCount ?? 0})`} value={money(report.summary.proformaAmt ?? 0)} />
              <Row label="All discounts" value={money(report.summary.discountTotal ?? 0)} />
              <Row label="Other reductions (voids)" value={money(report.summary.otherReductionsAmt ?? 0)} />
              <Row label="Incomplete sales" value={report.summary.incompleteSalesCount ?? 0} />
            </div>
            {report.reportType === "Z" && (
              <div className="md:col-span-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
                {report.vsdcConfirmation?.checked && !report.vsdcConfirmation.error ? (
                  <><CheckCircle2 className="size-4 text-success" /> VSDC confirmed the Z-report for {report.vsdcConfirmation.rptDe}.</>
                ) : report.vsdcConfirmation?.savedAt ? (
                  <><CheckCircle2 className="size-4 text-success" /> Z report saved at the VSDC at {new Date(report.vsdcConfirmation.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. RRA could not confirm it: {report.vsdcConfirmation.error}</>
                ) : (
                  <><AlertTriangle className="size-4 text-warning" /> {report.vsdcConfirmation?.error ?? "VSDC confirmation not available."}</>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}

type StatTone = "default" | "success" | "warning" | "danger";
const STAT_TONE: Record<StatTone, string> = {
  default: "border-border bg-muted/40 text-foreground",
  success: "border-success/25 bg-success/10 text-success dark:text-emerald-300",
  warning: "border-warning/30 bg-warning/10 text-warning dark:text-amber-300",
  danger: "border-danger/25 bg-danger/10 text-danger dark:text-red-300",
};

/** Compact count pill used for the summary line above each table. */
function Stat({ value, label, tone = "default", title }: { value: ReactNode; label: string; tone?: StatTone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-xs ${STAT_TONE[tone]}`}>
      <b className="text-sm font-semibold tabular-nums">{value}</b>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");

/** RRA line status as a badge — an approved import/purchase is a finished state, so it shows green. */
function RraStatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "").toUpperCase();
  const tone = key === "APPROVED" || key === "CONFIRMED" ? "SUCCESS" : key === "REJECTED" ? "DECLINED" : key;
  return <StatusBadge status={tone} label={titleCase(key || "unknown")} />;
}

/** Short code (receipt label, movement type) in a neutral monospace chip. */
function CodeChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

interface PluRow {
  itemCd: string; productName: string; unit: string; quantity: number;
  revenue: number; taxAmount: number; transactionCount: number;
  unitPrice: number; taxRate: number; remainingQty: number;
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
      toastError(e, "Could not load the PLU report");
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
                toastError(e, "Could not generate the PLU report");
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
              <div className="flex flex-wrap gap-2">
                <Stat value={summary.uniqueItemCodes} label="item codes" />
                <Stat value={formatInt(summary.totalQuantity)} label="units" />
                <Stat value={money(summary.totalRevenue)} label="revenue" />
                <Stat value={money(summary.totalTax)} label="tax" />
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item code</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Tax rate</TableHead>
                    <TableHead className="text-right">Qty sold</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No sales in this period.</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.itemCd}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.itemCd}</TableCell>
                      <TableCell className="font-medium">{r.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.unitPrice ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.taxRate ?? 0}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(r.quantity)} {r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(r.remainingQty ?? 0)} {r.unit}</TableCell>
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
      toastError(e, "Could not load the electronic journal");
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
      toastError(e, "Could not load the journal entry");
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
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
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
                <TableHead>EJ sent</TableHead>
                <TableHead className="w-10" />
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
                  <TableCell><CodeChip>{e.rcptLabel ?? "NS"}</CodeChip></TableCell>
                  <TableCell className="text-right tabular-nums">{e.sdcRcptNo ?? "—"} / {e.totalRcptNo ?? "—"}</TableCell>
                  <TableCell>{e.ejSent ? <StatusBadge status="SUCCESS" label="Sent" /> : <StatusBadge status="PROCESSING" label="Not sent" />}</TableCell>
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
                <div className={`mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${selected.detail.checks?.journalTotalMatchesSlip ? "bg-success/10 text-success dark:bg-success/40 dark:text-emerald-400" : "bg-warning/10 text-warning dark:bg-warning/40 dark:text-amber-400"}`}>
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
      toastError(e, "Could not load RRA master-data status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.syncAllRraMasterData();
      const outcomes = (((res as any)?.data ?? res)?.outcomes ?? []) as Array<{ resource: string; ok: boolean; upserted?: number; error?: string }>;
      const failed = outcomes.filter((o) => !o.ok);
      const names: Record<string, string> = { codes: "codes", itemClasses: "classifications", notices: "notices" };
      if (failed.length === 0) {
        toast.success(`Updated from RRA: ${outcomes.map((o) => `${o.upserted ?? 0} ${names[o.resource] ?? o.resource}`).join(", ")}.`);
      } else {
        toastWarning(`Some RRA data could not be updated (${failed.map((o) => names[o.resource] ?? o.resource).join(", ")}). Try again in a few minutes.`, failed.map((o) => `${o.resource}: ${o.error ?? "failed"}`).join("; "));
      }
      await load();
    } catch (e: any) {
      toastError(e, "Could not sync with RRA");
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
      toast.success(`Compared your items with RRA: ${out?.pulled ?? 0} item(s) received.`);
    } catch (e: any) {
      toastError(e, "Could not compare your items with RRA");
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
      toastError(e, "Could not register the product with RRA");
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
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync master data
          </Button>
          <Button variant="outline" onClick={reconcile} disabled={reconciling}>
            {reconciling ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Reconcile items with RRA
          </Button>
          <Button
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const res = await apiClient.syncRraBranches();
                const out = (res as any)?.data ?? res;
                toast.success(`RRA has ${out?.fetched ?? 0} branch(es) for your TIN; ${out?.matched ?? 0} match your branches here.`);
                await load();
              } catch (e: any) {
                toastError(e, "Could not sync branches with RRA");
              } finally {
                setSyncing(false);
              }
            }}
          >
            Sync branches
          </Button>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : c ? (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Stat value={formatInt(c.codes)} label="codes" tone={c.codes > 0 ? "default" : "warning"} />
              <Stat
                value={formatInt(c.itemClasses)}
                label="classifications"
                tone={c.itemClasses > 0 ? "default" : "warning"}
                title={c.itemClasses > 0 ? undefined : "Not pulled from RRA yet. Press Sync master data."}
              />
              <Stat value={c.notices} label={`notices · ${c.unreadNotices} unread`} tone={c.unreadNotices > 0 ? "warning" : "default"} />
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
              <p className="rounded-md bg-success/10 px-3 py-2 text-xs text-success dark:bg-success/40 dark:text-emerald-400">
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
                          {it.ebmSyncStatus === "FAILED"
                            ? <StatusBadge status="FAILED" label="Sync failed" />
                            : <StatusBadge status="PROCESSING" label="Not at RRA" />}
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge status="PROCESSING" label="Mismatch" />
                            <span className="text-xs text-muted-foreground">
                              {m.field}: <span className="font-mono text-foreground">{String(m.local ?? "—")}</span> → RRA <span className="font-mono text-foreground">{String(m.rra ?? "—")}</span>
                            </span>
                          </div>
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge status="DRAFT" label="At RRA only" />
                            <span className="text-xs text-muted-foreground">Add it to the catalog manually</span>
                          </div>
                        </TableCell>
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
                      {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                      <span className="font-medium">#{n.noticeNo} — {n.title ?? "(untitled)"}</span>
                    </div>
                    {n.cont && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{n.cont}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatLastReqDt(n.regDt)}{n.regrNm ? ` · ${n.regrNm}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {n.dtlUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={n.dtlUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Open</a>
                      </Button>
                    )}
                    {!n.readAt && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n.noticeNo)}>
                        <Check className="size-3.5" /> Mark read
                      </Button>
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

interface CatalogProduct {
  id: number;
  name: string;
  itemCd?: string | null;
  sku?: string | null;
  unitPrice?: number | string | null;
  itemType?: string | null;
}

const priceOf = (p?: CatalogProduct) => (p?.unitPrice != null ? String(Number(p.unitPrice)) : "");

function unwrapApiData(res: unknown): any {
  let cur: any = res;
  if (cur?.success === true && cur.data != null) cur = cur.data;
  // Some proxies double-wrap: { success, data: { data: {...} } }.
  // Do not unwrap again when this already looks like a stock-status payload.
  const looksLikeDomainPayload =
    cur?.counts != null
    || Array.isArray(cur?.pending)
    || Array.isArray(cur?.failures)
    || cur?.imports != null;
  if (
    !looksLikeDomainPayload
    && cur?.data != null
    && typeof cur.data === "object"
    && !Array.isArray(cur.data)
  ) {
    cur = cur.data;
  }
  return cur;
}

type StockLedgerRow = {
  id: number;
  movementType: string;
  quantity: number;
  direction: string;
  reference?: string | null;
  referenceType?: string | null;
  ebmError?: string | null;
  ebmSyncStatus?: string | null;
  createdAt: string;
  product?: { name?: string | null; itemCd?: string | null } | null;
};

function stockPendingReason(row: StockLedgerRow): string {
  if (row.movementType === "SALE") {
    return row.reference
      ? `Waiting for sale ${row.reference} to be fiscalized`
      : "Waiting for the linked sale to be fiscalized";
  }
  return row.ebmError?.trim() || "Queued for VSDC";
}

function StockSyncCard() {
  const [stock, setStock] = useState<{
    counts: Record<string, number>;
    failures: StockLedgerRow[];
    pending?: StockLedgerRow[];
  } | null>(null);
  const [busy, setBusy] = useState<null | "stock" | "moves">(null);

  const load = useCallback(async () => {
    try {
      const s = await apiClient.getRraStockStatus();
      const stockData = unwrapApiData(s);
      setStock({
        counts: (stockData?.counts && typeof stockData.counts === "object") ? stockData.counts : {},
        failures: Array.isArray(stockData?.failures) ? stockData.failures : [],
        pending: Array.isArray(stockData?.pending) ? stockData.pending : [],
      });
    } catch (e: any) {
      toastError(e, "Could not load stock status");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const syncStock = async () => {
    setBusy("stock");
    try {
      const res = await apiClient.syncRraStock();
      const out = (res as any)?.data ?? res;
      toast.success(
        `Stock sent to RRA: ${out?.succeeded ?? 0} line(s) sent`
          + (out?.failed ? `, ${out.failed} not sent (try again later)` : "")
          + (out?.deferred ? `, ${out.deferred} waiting for their sale to be confirmed` : "") + ".",
      );
      await load();
    } catch (e: any) {
      toastError(e, "Could not send stock to RRA");
    } finally { setBusy(null); }
  };

  const syncStockMoves = async () => {
    setBusy("moves");
    try {
      const res = await apiClient.syncRraStockMoves();
      const out = (res as any)?.data ?? res;
      toast.success(`Received ${out?.fetched ?? 0} stock movement(s) from RRA; ${out?.applied ?? 0} line(s) added to your stock.`);
      await load();
    } catch (e: any) {
      toastError(e, "Could not get stock movements from RRA");
    } finally { setBusy(null); }
  };

  const sc = stock?.counts ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Boxes className="size-4" /> Stock sync</CardTitle>
        <CardDescription>
          Every stock movement, sales included, is reported to the VSDC as stock in/out.
          B2B purchases are managed under <span className="font-medium text-foreground">Purchases</span> in the sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={syncStock} disabled={busy === "stock"}>
            {busy === "stock" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync stock now
          </Button>
          <Button variant="outline" onClick={syncStockMoves} disabled={busy === "moves"}>
            {busy === "moves" ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} Pull stock moves
          </Button>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Stat value={formatInt(sc.PENDING ?? 0)} label="pending" tone={(sc.PENDING ?? 0) > 0 ? "warning" : "default"} title="Inventory ledger rows waiting to be sent to VSDC" />
            <Stat value={formatInt(sc.SYNCED ?? 0)} label="synced" tone="success" />
            <Stat value={formatInt(sc.FAILED ?? 0)} label="failed" tone={(sc.FAILED ?? 0) > 0 ? "danger" : "default"} />
          </div>
        </div>

        {(sc.PENDING ?? 0) > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-warning dark:text-amber-300">
              Pending stock sync ({sc.PENDING}) — SALE rows wait until their invoice is fiscalized; other rows send when you press “Sync stock now”
            </div>
            {(stock?.pending?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-warning/30 dark:border-amber-900/50">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Why waiting</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stock?.pending ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          <div>{row.product?.name ?? `#${row.id}`}</div>
                          {row.product?.itemCd ? (
                            <div className="font-mono text-[10px] text-muted-foreground">{row.product.itemCd}</div>
                          ) : null}
                        </TableCell>
                        <TableCell><CodeChip>{row.movementType}</CodeChip></TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.direction === "OUT" ? "−" : "+"}
                          {formatInt(Number(row.quantity))}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[18rem] text-sm text-warning dark:text-amber-400">
                          {stockPendingReason(row)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning dark:border-amber-900/50 dark:bg-warning/30 dark:text-amber-400">
                {sc.PENDING} ledger row(s) are PENDING, but details could not be loaded. Refresh the page or press “Sync stock now”.
              </p>
            )}
          </div>
        ) : null}

        {stock?.failures?.length ? (
          <div className="max-h-48 space-y-1 overflow-auto rounded-md bg-warning/10 px-3 py-2 text-xs text-warning dark:bg-warning/40 dark:text-amber-400">
            <div className="font-medium">Stock movements RRA rejected ({sc.FAILED ?? stock.failures.length}) — fix the cause, then press “Sync stock now”:</div>
            {stock.failures.map((f) => (
              <div key={f.id}>
                <span className="font-medium">{f.product?.name ?? `#${f.id}`}</span>
                {" · "}{f.movementType} {f.direction === "OUT" ? "−" : "+"}{formatInt(Number(f.quantity))}
                {" · "}{new Date(f.createdAt).toLocaleString()} — {f.ebmError}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type RraImportStatus = "PENDING" | "APPROVED" | "REJECTED";
type RraImportStatusFilter = "ALL" | RraImportStatus;

interface RraImport {
  id: number;
  taskCd: string;
  dclNo: string | null;
  dclDe: string;
  itemSeq: number;
  hsCd: string | null;
  itemNm: string | null;
  orgnNatCd: string | null;
  exptNatCd: string | null;
  spplrNm: string | null;
  agntNm: string | null;
  pkg: string | number | null;
  pkgUnitCd: string | null;
  qty: string | number | null;
  qtyUnitCd: string | null;
  totWt: string | number | null;
  netWt: string | number | null;
  invcFcurAmt: string | number | null;
  invcFcurCd: string | null;
  invcFcurExcrt: string | number | null;
  itemCd: string | null;
  itemClsCd: string | null;
  status: RraImportStatus;
  remark: string | null;
  actionedAt: string | null;
  linkedProductId: number | null;
  pullState?: "NEW" | "RESENT" | null;
  copyNo?: number;
}

interface RraImportLatestPull {
  at: string;
  lines: number;
  created: number;
}

function ImportDetailRows({ line }: { line: RraImport }) {
  const qty = line.qty != null ? `${Number(line.qty).toLocaleString()} ${line.qtyUnitCd ?? ""}`.trim() : "—";
  const pkg = line.pkg != null ? `${Number(line.pkg).toLocaleString()} ${line.pkgUnitCd ?? ""}`.trim() : "—";
  const invoice = line.invcFcurAmt != null
    ? `${Number(line.invcFcurAmt).toLocaleString()} ${line.invcFcurCd ?? ""}`.trim()
    : "—";
  const rows: Array<{ label: string; value: ReactNode; wide?: boolean }> = [
    { label: "Declaration no.", value: line.dclNo ?? "—" },
    { label: "Declaration date", value: formatDclDe(line.dclDe) },
    { label: "Task code", value: <span className="font-mono text-xs">{line.taskCd}</span> },
    { label: "Line", value: line.itemSeq },
    { label: "Supplier", value: line.spplrNm?.trim() || "—", wide: true },
    { label: "Agent", value: line.agntNm?.trim() || "—", wide: true },
    { label: "Item name", value: line.itemNm?.trim() || "—", wide: true },
    { label: "HS code", value: <span className="font-mono text-xs">{line.hsCd ?? "—"}</span> },
    { label: "Origin nation", value: line.orgnNatCd ?? "—" },
    { label: "Export nation", value: line.exptNatCd ?? "—" },
    { label: "Quantity", value: qty },
    { label: "Package", value: pkg },
    { label: "Total weight", value: line.totWt != null ? Number(line.totWt).toLocaleString() : "—" },
    { label: "Net weight", value: line.netWt != null ? Number(line.netWt).toLocaleString() : "—" },
    { label: "Invoice amount", value: invoice },
    { label: "Exchange rate", value: line.invcFcurExcrt != null ? Number(line.invcFcurExcrt).toLocaleString() : "—" },
    { label: "Item code", value: <span className="font-mono text-xs">{line.itemCd ?? "—"}</span> },
    { label: "Item class", value: <span className="font-mono text-xs">{line.itemClsCd ?? "—"}</span> },
    { label: "Status", value: <RraStatusBadge status={line.status} /> },
    { label: "Actioned at", value: line.actionedAt ? new Date(line.actionedAt).toLocaleString() : "—" },
    { label: "Remark", value: line.remark?.trim() || "—", wide: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className={r.wide ? "col-span-2" : undefined}>
          <div className="text-xs text-muted-foreground">{r.label}</div>
          <div className="break-words">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function ImportDeclarationsCard() {
  const [imports, setImports] = useState<RraImport[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  // Default to every pulled line; "Pending" alone hid approved/rejected lines and looked like a short pull.
  const [statusFilter, setStatusFilter] = useState<RraImportStatusFilter>("ALL");
  const [lastReq, setLastReq] = useState<string | null>(null);
  const [latestPull, setLatestPull] = useState<RraImportLatestPull | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<RraImport | null>(null);
  const [action, setAction] = useState<null | { line: RraImport; kind: "approve" | "reject" }>(null);
  const [clsCd, setClsCd] = useState("");
  const [remark, setRemark] = useState("");
  const [rowBusy, setRowBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [linkProductId, setLinkProductId] = useState("__new__");
  const [itemNm, setItemNm] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiClient.listRraImports(statusFilter === "ALL" ? undefined : statusFilter);
      const data = (res as any)?.data ?? res;
      setImports((data?.imports ?? []) as RraImport[]);
      setPendingCount(Number(data?.pending ?? 0));
      setLastReq(data?.lastRequestDate ?? null);
      setLatestPull((data?.latestPull ?? null) as RraImportLatestPull | null);
    } catch (e: any) {
      toastError(e, "Could not load import declarations");
    }
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await apiClient.syncRraImports();
      const out = (res as any)?.data ?? res;
      const pulled = Number(out?.cached ?? 0);
      const failed = Number(out?.failed ?? 0);
      if (failed > 0) {
        // Backend keeps the last request date, so pulling again retries the failed lines.
        toast.warning(`RRA sent ${Number(out?.fetched ?? 0)} import line(s): ${pulled} saved, ${failed} could not be saved. Pull again to retry.`);
      } else if (pulled === 0) {
        // RRA only returns lines declared since the last request, so a repeat pull is often 0.
        toast.success("No new import declarations from RRA since the last check.");
      } else {
        // RRA re-sends lines it already delivered; say how many are actually new.
        const created = Number(out?.created ?? pulled);
        const reopened = Number(out?.reopened ?? 0);
        const known = pulled - created - reopened;
        toast.success(
          `RRA sent ${pulled} line(s): ${created} new`
            + (reopened > 0 ? `, ${reopened} waiting at RRA and pending again` : "")
            + (known > 0 ? `, ${known} already in your list` : ""),
        );
      }
      await load();
      if (out?.lastReqDt) setLastReq(String(out.lastReqDt));
    } catch (e: any) {
      toastError(e, "Could not get import declarations from RRA");
    } finally { setBusy(false); }
  };

  const openAction = (line: RraImport, kind: "approve" | "reject") => {
    setAction({ line, kind });
    setClsCd(line.itemClsCd ?? "");
    setRemark("");
    setLinkProductId("__new__");
    setItemNm(line.itemNm ?? "");
    setSellingPrice("");
    setExpiryDate("");
    if (kind === "approve") {
      apiClient.getProducts({ page: 1, limit: 500 })
        .then((res) => {
          const items = parseInventoryGetProductsResponse(res).items as CatalogProduct[];
          setCatalog(items);
          const nm = (line.itemNm ?? "").trim().toLowerCase();
          const match = nm ? items.find((p) => p.name.trim().toLowerCase() === nm) : undefined;
          if (match) {
            setLinkProductId(String(match.id));
            setSellingPrice(priceOf(match));
            setItemNm(match.name);
          }
        })
        .catch(() => setCatalog([]));
    }
  };

  const submitAction = async () => {
    if (!action) return;
    const approve = action.kind === "approve";
    const createNew = linkProductId === "__new__";
    const linkId = createNew ? NaN : Number(linkProductId);
    const price = Number(sellingPrice);
    if (approve && !clsCd && createNew && !action.line.itemClsCd) {
      toast.error("Pick an RRA item classification to create the product");
      return;
    }
    if (approve && !action.line.hsCd?.trim()) {
      toast.error("RRA did not send a product code (HS code) for this declaration, so it cannot be approved. Ask RRA or your customs agent to correct it.");
      return;
    }
    setRowBusy(true);
    try {
      const res = await apiClient.actionRraImport(action.line.id, action.kind, {
        itemClsCd: approve ? clsCd || undefined : undefined,
        remark: remark || undefined,
        linkProductId: approve && linkId > 0 ? linkId : undefined,
        createProduct: approve && createNew ? true : undefined,
        itemNm: approve && createNew ? (itemNm.trim() || undefined) : undefined,
        sellingPrice: approve && price > 0 ? price : undefined,
        expiryDate: approve && expiryDate ? expiryDate : undefined,
      });
      const out = (res as any)?.data ?? res;
      if (out?.warning) toastWarning(String(out.warning));
      else toast.success(action.kind === "approve" ? "Import declaration approved with RRA." : "Import declaration rejected.");
      setAction(null);
      await load();
    } catch (e: any) {
      toastError(e, "Could not complete this action");
    } finally { setRowBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ship className="size-4" /> Import declarations</CardTitle>
        <CardDescription>
          Import declaration lines pulled from RRA. Classify and approve or reject each one — an approval books the stock-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={sync} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Pull from RRA
          </Button>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RraImportStatusFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-950 dark:text-sky-100">
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Last request</span>
            <span className="font-mono font-semibold tabular-nums">
              {lastReq ? formatLastReqDt(lastReq) : "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Stat value={imports.length} label={statusFilter === "ALL" ? "lines" : `${statusFilter.toLowerCase()} lines`} />
            <Stat value={pendingCount} label="awaiting action" tone={pendingCount > 0 ? "warning" : "default"} />
          </div>
        </div>

        {latestPull && (
          <p className="text-sm text-muted-foreground">
            Latest pull with lines ({new Date(latestPull.at).toLocaleString()}): RRA sent {latestPull.lines},
            {" "}{latestPull.created} new and {latestPull.lines - latestPull.created} sent again.
          </p>
        )}

        <TooltipProvider>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="table-fixed w-full min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[10rem]">Declaration</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Qty</TableHead>
                  <TableHead className="w-[8.5rem] text-right">Invoice</TableHead>
                  <TableHead className="w-[6.5rem]">Status</TableHead>
                  <TableHead className="w-[10.5rem] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      {statusFilter === "ALL"
                        ? "No import declarations pulled from RRA."
                        : `No ${statusFilter.toLowerCase()} import lines.`}
                    </TableCell>
                  </TableRow>
                )}
                {imports.map((im) => (
                  <TableRow key={im.id}>
                    <TableCell className="overflow-hidden whitespace-nowrap font-mono text-xs">
                      <div className="truncate">{im.dclNo ?? im.taskCd}</div>
                      <div className="truncate text-muted-foreground">{formatDclDe(im.dclDe)} · line {im.itemSeq}</div>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <div className="min-w-0 max-w-full">
                        <TruncatedText value={im.spplrNm} max={50} />
                      </div>
                    </TableCell>
                    <TableCell className="overflow-hidden font-medium">
                      <div className="min-w-0 max-w-full">
                        <TruncatedText value={im.itemNm} max={50} />
                      </div>
                    </TableCell>
                    <TableCell className="overflow-hidden text-right tabular-nums whitespace-nowrap">
                      <span className="block truncate">
                        {im.qty != null ? `${Number(im.qty).toLocaleString()} ${im.qtyUnitCd ?? ""}`.trim() : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="overflow-hidden text-right tabular-nums whitespace-nowrap">
                      <span className="block truncate">
                        {im.invcFcurAmt != null
                          ? `${Number(im.invcFcurAmt).toLocaleString()} ${im.invcFcurCd ?? ""}`.trim()
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <div className="flex flex-col items-start gap-1">
                        <RraStatusBadge status={im.status} />
                        {im.pullState === "NEW" && <StatusBadge status="SHIPPED" label="New" />}
                        {im.pullState === "RESENT" && <StatusBadge status="DRAFT" label="Sent again" />}
                      </div>
                    </TableCell>
                    <TableCell className="overflow-hidden text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1">
                        {im.status === "PENDING" && (
                          <>
                            <Button size="sm" onClick={() => openAction(im, "approve")}>
                              <Check className="size-3.5" /> Approve
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              aria-label="Reject"
                              title="Reject"
                              onClick={() => openAction(im, "reject")}
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button size="icon-sm" variant="ghost" aria-label="View details" title="View details" onClick={() => setDetail(im)}>
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      </CardContent>

      <Drawer open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DrawerContent className="sm:max-w-lg">
          <DrawerHeader className="px-0 pt-0">
            <DrawerTitle>Import line details</DrawerTitle>
          </DrawerHeader>
          {detail && (
            <div className="space-y-4">
              <ImportDetailRows line={detail} />
              {detail.status === "PENDING" && (
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => { setDetail(null); openAction(detail, "reject"); }}>
                    <X className="size-4" /> Reject
                  </Button>
                  <Button onClick={() => { setDetail(null); openAction(detail, "approve"); }}>
                    <CheckCircle2 className="size-4" /> Approve
                  </Button>
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{action?.kind === "approve" ? "Approve import line" : "Reject import line"}</DialogTitle>
          </DialogHeader>
          {action && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {action.kind === "approve" ? "Approve" : "Reject"}{" "}
                <span className="font-medium text-foreground">{action.line.itemNm?.trim() || "this line"}</span>
                {" "}({action.line.dclNo ?? action.line.taskCd}, line {action.line.itemSeq}).
                {(action.line.copyNo ?? 0) > 0 && action.kind === "approve" && (
                  <span className="mt-2 block text-warning">
                    You already actioned this line, but RRA still shows it as waiting. Approving adds its
                    {" "}full quantity to stock again.
                  </span>
                )}
              </p>
              {action.kind === "approve" && (
                <>
                  {!action.line.hsCd?.trim() && (
                    <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning dark:border-amber-900/50 dark:bg-warning/30 dark:text-amber-400">
                      This line has no HS code from RRA. Approval is blocked until RRA supplies one.
                    </p>
                  )}
                  <RraItemClassPicker
                    value={clsCd}
                    onChange={setClsCd}
                    required={linkProductId === "__new__" && !action.line.itemClsCd}
                  />
                  {linkProductId !== "__new__" && !clsCd && (
                    <p className="text-xs text-muted-foreground">Left empty, the receiving product&apos;s RRA classification is used.</p>
                  )}
                  <div className="space-y-1.5">
                    <Label>Receive into product</Label>
                    <SearchableSelect
                      value={linkProductId}
                      onChange={(value) => {
                        setLinkProductId(value);
                        const prod = catalog.find((p) => String(p.id) === value);
                        if (prod) {
                          setSellingPrice(priceOf(prod));
                          setItemNm(prod.name);
                        } else if (value === "__new__") {
                          setItemNm(action.line.itemNm ?? "");
                        }
                      }}
                      placeholder="Create as a new product"
                      searchPlaceholder="Search your products..."
                      emptyText="No matching products."
                      options={[
                        { value: "__new__", label: "Create as a new product", emphasized: true },
                        ...catalog.filter((p) => p.itemType !== "SERVICE").map((p) => ({
                          value: String(p.id),
                          label: p.name,
                          sublabel: p.itemCd ?? p.sku ?? undefined,
                        })),
                      ]}
                    />
                  </div>
                  {linkProductId === "__new__" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="imp-item-nm">Name in your inventory</Label>
                      <Input
                        id="imp-item-nm"
                        value={itemNm}
                        onChange={(e) => setItemNm(e.target.value)}
                        placeholder={action.line.itemNm ?? "Imported item"}
                      />
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="imp-sell-price">Selling price</Label>
                      <Input
                        id="imp-sell-price"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        placeholder="Set selling price"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="imp-expiry">Expiry date <span className="text-muted-foreground">(optional)</span></Label>
                      <Input id="imp-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="imp-remark">Remark <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="imp-remark" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Reason / note" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
                <Button variant={action.kind === "approve" ? "default" : "destructive"} onClick={submitAction} disabled={rowBusy}>
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

function PurchasesImportDetailReportCard() {
  const [start, setStart] = useState(daysAgoIso(30));
  const [end, setEnd] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = async () => {
    setBusy(true);
    try {
      const res = await apiClient.getPurchasesReport({ startDate: start, endDate: end });
      setData((res as any)?.data ?? res);
    } catch (e: any) {
      toastError(e, "Could not load purchases / importation report");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary;
  const importation = data?.importation;
  const orders = (data?.orders ?? []) as any[];
  const importItems = (importation?.items ?? []) as any[];
  const rraPurchases = data?.rraPurchases;
  const rraInvoices = (rraPurchases?.items ?? []) as any[];
  const [section, setSection] = useState("rra");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Truck className="size-4" /> Purchases &amp; importation</CardTitle>
        <CardDescription>
          Detailed purchases and importation report (RRA checklist §25) — local purchase orders, supplier invoices received from RRA, and import declaration lines.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={load} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Load report
          </Button>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2">
            <Stat value={summary.orderCount ?? 0} label="purchase orders" />
            <Stat value={money(summary.totalPurchases)} label="PO total" />
            {rraPurchases?.summary && (
              <>
                <Stat value={rraPurchases.summary.invoices ?? 0} label="RRA invoices" />
                <Stat value={money(rraPurchases.summary.totalAmt)} label="invoice total" />
                <Stat value={rraPurchases.summary.PENDING ?? 0} label="to review" tone={(rraPurchases.summary.PENDING ?? 0) > 0 ? "warning" : "default"} />
              </>
            )}
            <Stat value={money((summary.totalTax ?? 0) + (rraPurchases?.summary?.totalTax ?? 0))} label="tax" />
            {importation?.summary && (
              <>
                <Stat value={importation.summary.lines ?? 0} label="import lines" />
                <Stat value={importation.summary.PENDING ?? 0} label="pending" tone={(importation.summary.PENDING ?? 0) > 0 ? "warning" : "default"} />
                <Stat value={importation.summary.APPROVED ?? 0} label="approved" tone="success" />
              </>
            )}
          </div>
        )}

        <Tabs value={section} onValueChange={setSection}>
          <TabsList>
            <TabsTrigger value="orders">Purchase orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="rra">RRA invoices ({rraInvoices.length})</TabsTrigger>
            <TabsTrigger value="imports">Imports ({importItems.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="mt-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No purchase orders in this range.</TableCell></TableRow>
                )}
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>{o.supplierName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDclDe(o.orderedAt)}</TableCell>
                    <TableCell><StatusBadge status={String(o.status ?? "")} /></TableCell>
                    <TableCell className="text-right tabular-nums">{o.itemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(o.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </TabsContent>

          <TabsContent value="rra" className="mt-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rraInvoices.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No supplier invoices from RRA in this range.</TableCell></TableRow>
                )}
                {rraInvoices.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.spplrInvcNo}</TableCell>
                    <TableCell>
                      <div>{p.spplrNm || "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">TIN {p.spplrTin}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDclDe(p.salesDt)}</TableCell>
                    <TableCell><RraStatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{p.totItemCnt ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.totTaxAmt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.totAmt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </TabsContent>

          <TabsContent value="imports" className="mt-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Declaration</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>HS</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importItems.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No import declaration lines in this range.</TableCell></TableRow>
                )}
                {importItems.map((i, idx) => (
                  <TableRow key={`${i.taskCd}-${i.dclDe}-${i.itemSeq}-${idx}`}>
                    <TableCell className="font-mono text-xs">
                      <div>{i.dclNo ?? i.taskCd}</div>
                      <div className="text-muted-foreground">{formatDclDe(i.dclDe)}</div>
                    </TableCell>
                    <TableCell>{i.supplier || "—"}</TableCell>
                    <TableCell className="font-medium">{i.itemNm ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{i.hsCd ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.qty != null ? formatInt(Number(i.qty)) : "—"}</TableCell>
                    <TableCell><RraStatusBadge status={i.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AuditorOverviewCard() {
  const { selectedBranchId } = useBranch();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getRraAuditOverview(selectedBranchId ?? undefined);
      setData((res as any)?.data ?? res);
    } catch (e: any) {
      toastError(e, "Could not load auditor overview");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-4" /> Auditor overview
        </CardTitle>
        <CardDescription>
          CIS §7.26 — software settings, device registration, sync cursors, and outbox health for competent auditors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
        {data && (
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">CIS software</div>
              <Row label="App" value={data.cis?.appName ?? "—"} />
              <Row label="EBM enabled" value={data.cis?.ebmEnabled ? "Yes" : "No"} />
              <Row label="Protocol" value={data.cis?.ebmProtocol ?? "—"} />
              <Row label="Environment" value={data.cis?.environment ?? "—"} />
              <Row label="VSDC timeout (ms)" value={data.cis?.requestTimeoutMs ?? "—"} />
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Organization</div>
              <Row label="Name" value={data.organization?.name ?? "—"} />
              <Row label="TIN" value={data.organization?.TIN ?? "—"} />
              <Row label="Training mode" value={data.organization?.trainingMode ? "On" : "Off"} />
              <Row label="Last VSDC contact" value={data.organization?.lastSuccessfulVdsContact ? new Date(data.organization.lastSuccessfulVdsContact).toLocaleString() : "—"} />
              <Row label="VAT registered" value={data.settings?.vatRegistered ? "Yes" : "No"} />
            </div>
            <div className="space-y-1.5 rounded-lg border p-3 md:col-span-2">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Branches / devices</div>
              {(data.branches ?? []).length === 0 ? (
                <p className="text-muted-foreground">No active branches.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead>bhfId</TableHead>
                      <TableHead>SDC</TableHead>
                      <TableHead>MRC</TableHead>
                      <TableHead>Initialized</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.branches ?? []).map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell>{b.name}</TableCell>
                        <TableCell>{b.bhfId ?? "—"}</TableCell>
                        <TableCell>{b.ebmDeviceId ?? "—"}</TableCell>
                        <TableCell>{b.ebmSerialNo ?? "—"}</TableCell>
                        <TableCell>{b.ebmInitializedAt ? new Date(b.ebmInitializedAt).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Outbox</div>
              {Object.entries(data.outboxByStatus ?? {}).map(([status, count]) => (
                <Row key={status} label={<StatusBadge status={status} />} value={formatInt(Number(count))} />
              ))}
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Last fiscal sale</div>
              {data.lastFiscalSale ? (
                <>
                  <Row label="Sale #" value={data.lastFiscalSale.saleNumber} />
                  <Row label="Invoice" value={data.lastFiscalSale.invoiceNumber ?? "—"} />
                  <Row label="Label" value={data.lastFiscalSale.rcptLabel ?? "—"} />
                  <Row label="When" value={new Date(data.lastFiscalSale.createdAt).toLocaleString()} />
                </>
              ) : (
                <p className="text-muted-foreground">No fiscal sales yet.</p>
              )}
            </div>
            <div className="space-y-1.5 rounded-lg border p-3 md:col-span-2">
              <div className="text-overline uppercase tracking-wide text-muted-foreground">Sync cursors</div>
              {(data.syncCursors ?? []).length === 0 ? (
                <p className="text-muted-foreground">No cursors recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>lastReqDt</TableHead>
                      <TableHead>Last run</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.syncCursors ?? []).map((c: any) => (
                      <TableRow key={c.resource}>
                        <TableCell className="font-medium">{c.resource}</TableCell>
                        <TableCell className="font-mono text-xs">{formatLastReqDt(c.lastReqDt)}</TableCell>
                        <TableCell>{c.lastRunAt ? new Date(c.lastRunAt).toLocaleString() : "—"}</TableCell>
                        <TableCell className="max-w-[320px]">
                          {c.lastResult ? (
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                status={/^(OK|REWOUND|VERIFIED)/.test(c.lastResult) ? "SUCCESS" : /^(PARTIAL|SAVED_UNVERIFIED)/.test(c.lastResult) ? "PROCESSING" : "FAILED"}
                                label={c.lastResult.split(/[:\s]/)[0]}
                              />
                              <span className="truncate text-xs text-muted-foreground" title={c.lastResult}>
                                {c.lastResult.replace(/^[A-Z_]+:?\s*/, "") || "—"}
                              </span>
                            </div>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TABS = [
  { value: "daily", label: "Daily X / Z", icon: FileText },
  { value: "plu", label: "PLU", icon: FileText },
  { value: "journal", label: "Journal", icon: ScrollText },
  { value: "masterdata", label: "Master data", icon: Database },
  { value: "stock", label: "Stock sync", icon: Boxes },
  { value: "imports", label: "Imports", icon: Ship },
  { value: "detail", label: "Purchases report", icon: Truck },
  { value: "audit", label: "Auditor", icon: Shield },
] as const;

const TAB_STORAGE_KEY = "fiscal-reports-tab";

export function FiscalReportsPage() {
  const [tab, setTab] = useState<string>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      if (fromUrl && TABS.some((t) => t.value === fromUrl)) return fromUrl;
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && TABS.some((t) => t.value === saved)) return saved;
    } catch { /* ignore */ }
    return "daily";
  });

  // Small attention signals shown as a dot on the relevant tab.
  const [signals, setSignals] = useState<{ notices: number; imports: number }>({ notices: 0, imports: 0 });
  useEffect(() => {
    (async () => {
      try {
        const [md, imp] = await Promise.all([
          apiClient.getRraMasterDataStatus().catch(() => null),
          apiClient.listRraImports("PENDING").catch(() => null),
        ]);
        setSignals({
          notices: ((md as any)?.data ?? md)?.counts?.unreadNotices ?? 0,
          imports: (((imp as any)?.data ?? imp)?.imports ?? []).length,
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
    return false;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fiscal reports</h1>
        <p className="text-body-sm text-muted-foreground">
          RRA CIS/VSDC daily X/Z reports, the PLU report, the electronic journal, RRA master data, stock sync, and import declarations. B2B purchases live under Purchases in the sidebar.
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-none gap-1.5 px-3 py-1.5">
                <Icon className="size-4" />
                {label}
                {dotFor(value) && <span className="ml-0.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="daily" className="mt-4"><DailyReportCard /></TabsContent>
        <TabsContent value="plu" className="mt-4"><PluCard /></TabsContent>
        <TabsContent value="journal" className="mt-4"><ElectronicJournalCard /></TabsContent>
        <TabsContent value="masterdata" className="mt-4"><MasterDataCard /></TabsContent>
        <TabsContent value="stock" className="mt-4"><StockSyncCard /></TabsContent>
        <TabsContent value="imports" className="mt-4"><ImportDeclarationsCard /></TabsContent>
        <TabsContent value="detail" className="mt-4"><PurchasesImportDetailReportCard /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditorOverviewCard /></TabsContent>
      </Tabs>
    </div>
  );
}

export default FiscalReportsPage;
