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
import { RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink, Loader2, Save, ShieldCheck } from 'lucide-react';
import { OUTBOX_STATUS_CONFIG, type EbmOutboxEntry, type EbmOutboxStatus } from '../../../types/ebm';
import { apiClient } from '../../../lib/api-client';
import type { Branch } from '../../../context/BranchContext';

const API_BASE = import.meta.env.VITE_PUBLIC_API_URL || 'http://localhost:5000';

type GroupedCounts = Record<EbmOutboxStatus, number>;

interface EbmCredForm {
  bhfId?: string | null;
  ebmDeviceId?: string | null;
  ebmSerialNo?: string | null;
  vsdcUrl?: string | null;
}

function EbmCredentialsCard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [orgTin, setOrgTin] = useState('');
  const [form, setForm] = useState<EbmCredForm>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const applyBranch = (branch: Branch) => {
    setForm({
      bhfId: branch.bhfId ?? '',
      ebmDeviceId: branch.ebmDeviceId ?? '',
      ebmSerialNo: branch.ebmSerialNo ?? '',
      vsdcUrl: branch.vsdcUrl ?? '',
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = localStorage.getItem('current_organization_id');
    try {
      const res = await apiClient.getBranches(true);
      const list = Array.isArray(res) ? res : res?.data || [];
      setBranches(list);
      if (list.length > 0) {
        setBranchId(list[0].id);
        applyBranch(list[0]);
      }
    } catch (e) {
      console.error('Failed to load branches for EBM config', e);
    }
    if (orgId) {
      try {
        const org = await apiClient.getOrganization(orgId);
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
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);
    try {
      await apiClient.updateOrganization({ TIN: orgTin });
      if (branchId !== '') {
        await apiClient.updateBranch(branchId, {
          bhfId: form.bhfId ?? '',
          ebmDeviceId: form.ebmDeviceId ?? '',
          ebmSerialNo: form.ebmSerialNo ?? '',
          vsdcUrl: form.vsdcUrl ?? '',
        });
      }
      setSavedMsg('EBM / VSDC credentials saved.');
    } catch (e: any) {
      setErrorMsg(e?.message || e?.response?.data?.error || 'Failed to save EBM credentials.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          EBM / VSDC Credentials
        </CardTitle>
        <CardDescription className="text-sm">
          Organization TIN and per-branch device credentials sent to the RRA VSDC gateway.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-2 space-y-4">
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
            <Label>Branch</Label>
            <Select
              value={branchId === '' ? undefined : String(branchId)}
              onValueChange={(v) => {
                const id = Number(v);
                setBranchId(id);
                const b = branches.find((x) => x.id === id);
                if (b) applyBranch(b);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>bhfId (branch code)</Label>
            <Input
              value={form.bhfId ?? ''}
              onChange={(e) => set('bhfId', e.target.value)}
              placeholder="e.g. 00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>dvcSrlNo / MRC (device serial)</Label>
            <Input
              value={form.ebmSerialNo ?? ''}
              onChange={(e) => set('ebmSerialNo', e.target.value)}
              placeholder="e.g. excelwartest"
            />
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
            <Label>Per-branch VSDC URL (optional)</Label>
            <Input
              value={form.vsdcUrl ?? ''}
              onChange={(e) => set('vsdcUrl', e.target.value)}
              placeholder="Defaults to EBM_API_URL"
            />
          </div>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading credentials…
          </p>
        )}

        {errorMsg && (
          <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
        )}
        {savedMsg && (
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> {savedMsg}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Credentials
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

  const fetchOutbox = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = localStorage.getItem('current_organization_id');
      const res = await fetch(`${API_BASE}/api/organizations/${orgId}/ebm-outbox`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      const data = await res.json();
      setEntries(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
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

  const handleStatusCheck = async (entry: EbmOutboxEntry) => {
    setCheckingId(entry.id);
    try {
      const orgId = localStorage.getItem('current_organization_id');
      await fetch(`${API_BASE}/api/organizations/${orgId}/ebm-outbox/${entry.id}/check-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ idempotencyKey: entry.idempotencyKey }),
      });
      await fetchOutbox();
    } catch {
      console.error('Status check failed');
    } finally {
      setCheckingId(null);
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
      case 'FAILED': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'DEAD_LETTER': return <AlertTriangle className="h-4 w-4 text-rose-500" />;
      case 'PROCESSING': return <Clock className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">EBM / VSDC Outbox Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor fiscalisation status of all sales submitted to the RRA VSDC gateway
          </p>
        </div>
        <Button variant="outline" onClick={fetchOutbox} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Error / Note</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.sale?.saleNumber ?? `#${entry.saleId}`}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.sale?.invoiceNumber ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.sale ? `${Number(entry.sale.totalAmount).toLocaleString()} RWF` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(entry.status)}
                          {getStatusBadge(entry.status)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.retryCount}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={entry.lastError ?? ''}>
                        {entry.status === 'DEAD_LETTER' ? (
                          <span className="text-rose-600 font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            UN-FISCALIZED — Manager intervention required
                          </span>
                        ) : entry.status === 'FAILED' || entry.status === 'PROCESSING' ? (
                          entry.lastError ?? '—'
                        ) : entry.sdcDateTime ? (
                          <span className="text-green-600">SDC: {new Date(entry.sdcDateTime).toLocaleString()}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {(entry.status === 'PENDING' || entry.status === 'PROCESSING' || entry.status === 'FAILED') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusCheck(entry)}
                            disabled={checkingId === entry.id}
                          >
                            {checkingId === entry.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <ExternalLink className="h-3 w-3 mr-1" />
                            )}
                            Check VSDC
                          </Button>
                        )}
                        {entry.status === 'DEAD_LETTER' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                            onClick={() => alert('Compensation flow: reverse inventory & customer balance for sale #' + entry.saleId)}
                          >
                            Request Reversal
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
