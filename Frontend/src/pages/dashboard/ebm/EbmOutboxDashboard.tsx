import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../lib/api-client';
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
} from '../../../components/ui/card';
import { RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { OUTBOX_STATUS_CONFIG, type EbmOutboxEntry, type EbmOutboxStatus } from '../../../types/ebm';

const API_BASE = import.meta.env.VITE_PUBLIC_API_URL || 'http://localhost:5000';

type GroupedCounts = Record<EbmOutboxStatus, number>;

export function EbmOutboxDashboard() {
  const { t } = useTranslation();
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
      setEntries(data?.data ?? data ?? []);
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
