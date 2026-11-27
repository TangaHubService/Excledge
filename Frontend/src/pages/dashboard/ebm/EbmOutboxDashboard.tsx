import { useEffect, useState, useCallback } from 'react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink, Loader2, Save, ShieldCheck, RotateCcw } from 'lucide-react';
import { OUTBOX_STATUS_CONFIG, type EbmOutboxEntry, type EbmOutboxStatus } from '../../../types/ebm';
import { apiClient } from '../../../lib/api-client';
import type { Branch } from '../../../context/BranchContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";

type GroupedCounts = Record<EbmOutboxStatus, number>;

interface EbmCredForm {
  bhfId?: string | null;
  ebmDeviceId?: string | null;
  ebmSerialNo?: string | null;
  mrcNo?: string | null;
  vsdcUrl?: string | null;
}

type BranchWithMain = Branch & { isDefault?: boolean };

/** Mirrors the backend: the branch marked main, else the first active branch with device credentials, else the first active branch. */
function pickMainBranch(list: BranchWithMain[]): BranchWithMain | undefined {
  const active = list.filter((b) => b.status === 'ACTIVE');
  return active.find((b) => b.isDefault)
    ?? active.find((b) => b.ebmSerialNo || b.ebmDeviceId || b.mrcNo)
    ?? active[0];
}

function EbmCredentialsCard() {
  const [branches, setBranches] = useState<BranchWithMain[]>([]);
  const [mainBranch, setMainBranch] = useState<BranchWithMain | undefined>(undefined);
  const [orgTin, setOrgTin] = useState('');
  const [form, setForm] = useState<EbmCredForm>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [initInfo, setInitInfo] = useState<any>(null);

  const applyBranch = (branch: Branch) => {
    setForm({
      bhfId: branch.bhfId ?? '',
      ebmDeviceId: branch.ebmDeviceId ?? '',
      ebmSerialNo: branch.ebmSerialNo ?? '',
      mrcNo: branch.mrcNo ?? '',
      vsdcUrl: branch.vsdcUrl ?? '',
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = localStorage.getItem('current_organization_id');
    try {
      const res = await apiClient.getBranches(true);
      const list: BranchWithMain[] = Array.isArray(res) ? res : res?.data || [];
      setBranches(list);
      const main = pickMainBranch(list);
      setMainBranch(main);
      if (main) applyBranch(main);
    } catch (e) {
      console.error('Failed to load branches for EBM config', e);
    }
    if (orgId) {
      try {
        const res = await apiClient.getOrganization(orgId);
        const org = res?.organization ?? res?.data?.organization ?? res?.data ?? res;
        setOrgTin(org?.TIN ?? org?.tin ?? '');
      } catch (e) {
        console.error('Failed to load organization for EBM config', e);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key: keyof EbmCredForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSavedMsg(null);
    setErrorMsg(null);
    const mrc = (form.mrcNo ?? '').trim();
    if (mrc && !/^[A-Za-z0-9]{11}$/.test(mrc)) {
      setErrorMsg(`MRC must be exactly 11 letters or digits (you entered ${mrc.length}).`);
      return;
    }
    if (!mainBranch) {
      setErrorMsg('Create a branch first — the main branch holds the RRA/VSDC configuration.');
      return;
    }
    setSaving(true);
    try {
      if (orgTin.trim()) await apiClient.updateOrganization({ TIN: orgTin.trim() });
      await apiClient.updateBranch(mainBranch.id, {
        bhfId: (form.bhfId ?? '').trim(),
        ebmDeviceId: (form.ebmDeviceId ?? '').trim(),
        ebmSerialNo: (form.ebmSerialNo ?? '').trim(),
        mrcNo: (form.mrcNo ?? '').trim().toUpperCase(),
        vsdcUrl: (form.vsdcUrl ?? '').trim(),
      });
      setSavedMsg('RRA / VSDC configuration saved. Every branch uses it.');
      await load();
    } catch (e: any) {
      setErrorMsg(
        (e?.response?.data?.code === 'INVALID_MRC_FORMAT'
          ? 'Invalid MRC. It must be 11 characters: BBBCCNNNNNN (3 developer + 2 certificate characters, then a 6-digit serial).'
          : null) ||
        e?.message ||
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          'Failed to save EBM credentials.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = async () => {
    setInitializing(true);
    setInitInfo(null);
    setErrorMsg(null);
    try {
      const res = await apiClient.initializeEbmDevice(
        mainBranch ? { branchId: mainBranch.id } : {},
      );
      const info = (res as any)?.data ?? res;
      setInitInfo(info);
      setSavedMsg(`Device verified with RRA — SDC ${info?.sdcId ?? '?'} / MRC ${info?.mrcNo ?? '?'}.`);
      if (info?.mrcWarning) setErrorMsg(info.mrcWarning);
      await load();
    } catch (e: any) {
      setErrorMsg(e?.message || e?.response?.data?.error || 'Device initialization failed.');
    } finally {
      setInitializing(false);
    }
  };

  const otherBranches = branches.filter((b) => b.id !== mainBranch?.id);

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          RRA / VSDC Configuration
        </CardTitle>
        <CardDescription className="text-sm">
          One configuration for the whole organization. It is kept on the main branch, and every other
          branch sells, buys and reports under it. Purchases and imports are received on the main branch.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-2 space-y-4">
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {mainBranch ? (
            <>
              <span className="text-muted-foreground">Main branch: </span>
              <span className="font-medium">{mainBranch.name}</span>
              <span className="ml-1 text-xs text-muted-foreground">({mainBranch.code})</span>
              {!mainBranch.isDefault && (
                <span className="ml-2 text-xs text-warning">
                  No branch is marked as main yet — mark one with the star in Organization → Branches.
                </span>
              )}
              {otherBranches.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Working under it: {otherBranches.map((b) => b.name).join(', ')}
                </p>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No active branch yet — create one to hold the RRA/VSDC configuration.</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Organization TIN</Label>
            <Input
              value={orgTin}
              onChange={(e) => setOrgTin(e.target.value)}
              placeholder="e.g. 999945560"
            />
          </div>

          <div className="space-y-1.5">
            <Label>bhfId (RRA branch code)</Label>
            <Input
              value={form.bhfId ?? ''}
              onChange={(e) => set('bhfId', e.target.value)}
              placeholder="e.g. 00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>dvcSrlNo (device serial)</Label>
            <Input
              value={form.ebmSerialNo ?? ''}
              onChange={(e) => set('ebmSerialNo', e.target.value)}
              placeholder="e.g. excelwartest"
            />
          </div>

          <div className="space-y-1.5">
            <Label>MRC (Machine Registration Code)</Label>
            <Input
              value={form.mrcNo ?? ''}
              onChange={(e) => set('mrcNo', e.target.value.toUpperCase())}
              placeholder="e.g. WIS01029467"
              minLength={11}
              maxLength={11}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Exactly 11 characters ({(form.mrcNo ?? '').trim().length}/11): BBBCCNNNNNN — 3 developer + 2 certificate characters, then a 6-digit serial. Printed on every receipt.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>sdcId (device ID)</Label>
            <Input
              value={form.ebmDeviceId ?? ''}
              onChange={(e) => set('ebmDeviceId', e.target.value)}
              placeholder="VSDC device ID from RRA, if provided"
            />
          </div>

          <div className="space-y-1.5">
            <Label>VSDC URL (optional)</Label>
            <Input
              value={form.vsdcUrl ?? ''}
              onChange={(e) => set('vsdcUrl', e.target.value)}
              placeholder="Defaults to EBM_API_URL"
            />
          </div>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading configuration…
          </p>
        )}

        {errorMsg && (
          <p className="text-xs text-danger font-medium">{errorMsg}</p>
        )}
        {savedMsg && (
          <p className="text-xs text-success font-medium flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> {savedMsg}
          </p>
        )}

        {initInfo && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-0.5">
            <p className="font-medium text-foreground">RRA device initialization</p>
            {initInfo.taxpayer && <p>Taxpayer: {initInfo.taxpayer}{initInfo.branch ? ` · ${initInfo.branch}` : ''}</p>}
            <p>SDC ID: <span className="font-mono">{initInfo.sdcId ?? '—'}</span> · MRC: <span className="font-mono">{initInfo.mrcNo ?? '—'}</span>{initInfo.dvcId ? <> · Device: <span className="font-mono">{initInfo.dvcId}</span></> : null}</p>
            <p>RRA last invoice #: {initInfo.lastInvoiceNo ?? 0} · last receipt #: {initInfo.lastReceiptNo ?? 0}{initInfo.seededCounterTo ? ` · local counter seeded to ${initInfo.seededCounterTo}` : ''}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={handleInitialize} disabled={initializing || loading || !mainBranch}>
            {initializing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Initialize with RRA
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !mainBranch}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EbmOutboxDashboard() {
  const [entries, setEntries] = useState<EbmOutboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [reversalEntry, setReversalEntry] = useState<EbmOutboxEntry | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchOutbox = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = apiClient.getOrganizationId();
      const res = await apiClient.request(`/organizations/${orgId}/ebm-outbox`);
      setEntries(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      console.error('Failed to fetch EBM outbox');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOutbox(); }, [fetchOutbox]);

  const counts: GroupedCounts = {
    PENDING: entries.filter((e) => e.status === 'PENDING').length,
    PROCESSING: entries.filter((e) => e.status === 'PROCESSING').length,
    SUCCEEDED: entries.filter((e) => e.status === 'SUCCEEDED').length,
    FAILED: entries.filter((e) => e.status === 'FAILED').length,
    DEAD_LETTER: entries.filter((e) => e.status === 'DEAD_LETTER').length,
  };

  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = entries.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const changePageSize = (value: string) => {
    const size = Number(value);
    setPageSize(size);
    setPage(1);
  };

  const handleStatusCheck = async (entry: EbmOutboxEntry) => {
    setCheckingId(entry.id);
    try {
      const orgId = apiClient.getOrganizationId();
      await apiClient.request(`/organizations/${orgId}/ebm-outbox/${entry.id}/check-status`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: entry.idempotencyKey }),
      });
      await fetchOutbox();
    } catch {
      console.error('Status check failed');
    } finally {
      setCheckingId(null);
    }
  };

  const handleRetry = async (entry: EbmOutboxEntry) => {
    setRetryingId(entry.id);
    try {
      const orgId = apiClient.getOrganizationId();
      await apiClient.request(`/organizations/${orgId}/ebm-outbox/${entry.id}/retry`, {
        method: 'POST',
      });
      toast.success('Sent again to RRA. It will be confirmed in a moment.');
      await fetchOutbox();
    } catch (e: any) {
      toastError(e, "Could not send this again to RRA");
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: EbmOutboxStatus) => {
    const cfg = OUTBOX_STATUS_CONFIG[status];
    return (
      <Badge className={`${cfg.color} border text-xs px-2 py-0.5 rounded-full`} variant="outline">
        {cfg.label}
      </Badge>
    );
  };

  const getStatusIcon = (status: EbmOutboxStatus) => {
    switch (status) {
      case 'SUCCEEDED': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED': return <XCircle className="h-4 w-4 text-danger" />;
      case 'DEAD_LETTER': return <AlertTriangle className="h-4 w-4 text-danger" />;
      case 'PROCESSING': return <Clock className="h-4 w-4 text-primary" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">EBM / VSDC Outbox Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor fiscalisation status of all sales submitted to the RRA VSDC gateway
          </p>
        </div>
        <Button variant="outline" onClick={fetchOutbox} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* EBM Credentials Configuration */}
      <EbmCredentialsCard />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(counts).map(([status, count]) => {
          const cfg = OUTBOX_STATUS_CONFIG[status as EbmOutboxStatus];
          return (
            <Card key={status} className={cfg.color.split(' ').slice(-1)[0]}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className={`text-sm font-medium ${cfg.color.split(' ')[0]}`}>
                  {cfg.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className={`text-3xl font-bold ${cfg.color.split(' ')[0]}`}>{count as number}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mb-2 text-green-400" />
              <p>No outbox entries. All sales are fiscalised.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale #</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Retries</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Error / Note</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.sale?.saleNumber ?? `#${entry.saleId}`}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.sale?.invoiceNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.sale ? `${Number(entry.sale.totalAmount).toLocaleString()} RWF` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(entry.status)}
                          {getStatusBadge(entry.status)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.retryCount}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px]" title={entry.lastError ?? ''}>
                        {entry.status === 'DEAD_LETTER' ? (
                          <div className="space-y-0.5">
                            <span className="text-danger font-semibold flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              UN-FISCALIZED
                            </span>
                            {entry.lastError && (
                              <p className="text-muted-foreground truncate">{entry.lastError}</p>
                            )}
                          </div>
                        ) : entry.status === 'FAILED' || entry.status === 'PROCESSING' ? (
                          <span className="truncate block">{entry.lastError ?? '—'}</span>
                        ) : entry.sdcDateTime ? (
                          <span className="text-success">SDC: {new Date(entry.sdcDateTime).toLocaleString()}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(entry.status === 'PENDING' || entry.status === 'PROCESSING' || entry.status === 'FAILED') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusCheck(entry)}
                              disabled={checkingId === entry.id || retryingId === entry.id}
                            >
                              {checkingId === entry.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ExternalLink className="size-3.5" />
                              )}
                              Check VSDC
                            </Button>
                          )}
                          {(entry.status === 'FAILED' || entry.status === 'DEAD_LETTER') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(entry)}
                              disabled={retryingId === entry.id || checkingId === entry.id}
                            >
                              {retryingId === entry.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="size-3.5" />
                              )}
                              Retry
                            </Button>
                          )}
                          {entry.status === 'DEAD_LETTER' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="bg-danger hover:bg-danger/90 text-white"
                              onClick={() => setReversalEntry(entry)}
                            >
                              Request Reversal
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {entries.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={changePageSize}>
                  <SelectTrigger className="h-8 w-[76px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Page {pageSafe} of {pageCount} · {entries.length} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage(pageSafe - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageSafe >= pageCount}
                  onClick={() => setPage(pageSafe + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={reversalEntry !== null}
        onClose={() => setReversalEntry(null)}
        onConfirm={() => {
          if (reversalEntry) {
            toast.info(`Reversal requested for sale #${reversalEntry.saleId}. The stock and customer balance will be put back.`);
          }
          setReversalEntry(null);
        }}
        title="Request Reversal"
        message={reversalEntry
          ? `This will reverse inventory and customer balance for sale #${reversalEntry.saleId}. Continue?`
          : ''}
        confirmText="Confirm Reversal"
        variant="destructive"
      />
    </div>
  );
}
