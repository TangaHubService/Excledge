import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { apiClient } from "../../../lib/api-client";
import { useBranch } from "../../../context/BranchContext";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

type TransferRow = {
  id: number;
  status: string;
  fromBranchId: number;
  toBranchId: number;
  notes: string | null;
  fromBranch: { name: string; code: string };
  toBranch: { name: string; code: string };
  items: Array<{
    quantity: number;
    product: { id: number; name: string };
  }>;
};

export default function StockTransfersPage() {
  const { selectedBranchId } = useBranch();
  const orgId = localStorage.getItem("current_organization_id");
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [fromBranchId, setFromBranchId] = useState<string>("");
  const [toBranchId, setToBranchId] = useState<string>("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiClient.getStockTransfers(orgId, selectedBranchId);
      const list = (res as { data?: TransferRow[] })?.data ?? (res as TransferRow[]);
      setTransfers(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load transfers");
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const fetchBranches = async () => {
      if (!orgId) return;
      try {
        const res = await apiClient.getBranches();
        const raw = (res as { data?: unknown })?.data ?? res;
        const arr = Array.isArray(raw) ? raw : [];
        setBranches(arr.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })));
      } catch {
        setBranches([]);
      }
    };
    fetchBranches();
  }, [orgId]);

  const approve = async (id: number) => {
    if (!orgId) return;
    try {
      await apiClient.approveStockTransfer(orgId, id, selectedBranchId);
      toast.success("Transfer approved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Approve failed");
    }
  };

  const reject = async (id: number) => {
    if (!orgId) return;
    try {
      await apiClient.rejectStockTransfer(orgId, id, selectedBranchId);
      toast.success("Transfer rejected");
      load();
    } catch (e: any) {
      toast.error(e.message || "Reject failed");
    }
  };

  const complete = async (id: number) => {
    if (!orgId) return;
    try {
      await apiClient.completeStockTransfer(orgId, id, selectedBranchId);
      toast.success("Transfer completed");
      load();
    } catch (e: any) {
      toast.error(e.message || "Complete failed");
    }
  };

  const createTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !fromBranchId || !toBranchId || fromBranchId === toBranchId) {
      toast.error("Select two different branches");
      return;
    }
    const pid = parseInt(productId, 10);
    const q = parseInt(qty, 10);
    if (!pid || q < 1) {
      toast.error("Valid product ID and quantity required");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.createStockTransfer(
        orgId,
        {
          fromBranchId: parseInt(fromBranchId, 10),
          toBranchId: parseInt(toBranchId, 10),
          items: [{ productId: pid, quantity: q }],
        },
        selectedBranchId
      );
      toast.success("Transfer created");
      setProductId("");
      setQty("1");
      load();
    } catch (err: any) {
      toast.error(err.message || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return (
      <div className="p-6 text-muted-foreground">
        Select an organization to manage stock transfers.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-7 w-7" />
        <div>
          <h1 className="text-2xl font-semibold">Stock transfers</h1>
          <p className="text-sm text-muted-foreground">
            Move inventory between branches (approve, then complete to move stock).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New transfer</CardTitle>
          <CardDescription>
            One product per request for simplicity; create multiple transfers for more lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createTransfer} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label>From branch</Label>
              <Select value={fromBranchId} onValueChange={setFromBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To branch</Label>
              <Select value={toBranchId} onValueChange={setToBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product ID</Label>
              <Input
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="e.g. 12"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create transfer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No transfers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono">{t.id}</TableCell>
                    <TableCell>
                      {t.fromBranch?.name} → {t.toBranch?.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.items?.map((i) => (
                        <div key={i.product.id}>
                          {i.product.name} × {i.quantity}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {t.status === "PENDING" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => approve(t.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reject(t.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                      {t.status === "APPROVED" && (
                        <Button size="sm" onClick={() => complete(t.id)}>
                          Complete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
