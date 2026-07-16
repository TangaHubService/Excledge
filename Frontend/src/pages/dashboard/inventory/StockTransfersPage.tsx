import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { apiClient } from "../../../lib/api-client";
import { useBranch } from "../../../context/BranchContext";
import { parseInventoryGetProductsResponse } from "../../../lib/inventory-response";
import { cn } from "../../../lib/utils";
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
import { SearchableSelect } from "../../../components/ui/SearchableSelect";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  COMPLETED: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function statusBadgeClass(status: string) {
  return STATUS_BADGE_CLASSES[status] ?? "";
}

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
  const [products, setProducts] = useState<Array<{ id: number; name: string; sku?: string | null }>>([]);
  const [fromBranchId, setFromBranchId] = useState<string>("");
  const [toBranchId, setToBranchId] = useState<string>("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

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

  useEffect(() => {
    const fetchProducts = async () => {
      if (!orgId) return;
      try {
        const res = await apiClient.getProducts({ organizationId: orgId, limit: 1000 });
        const items = parseInventoryGetProductsResponse(res).items as Array<{
          id: number;
          name: string;
          sku?: string | null;
        }>;
        setProducts(items);
      } catch {
        setProducts([]);
      }
    };
    fetchProducts();
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
    setAttempted(true);
    if (!orgId) return;
    if (!fromBranchId) {
      toast.error("Select a from branch");
      return;
    }
    if (!toBranchId) {
      toast.error("Select a to branch");
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error("From and to branches must be different");
      return;
    }
    const pid = parseInt(productId, 10);
    const q = parseInt(qty, 10);
    if (!pid) {
      toast.error("Select a product");
      return;
    }
    if (!q || q < 1) {
      toast.error("Enter a valid quantity");
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
      setAttempted(false);
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

  const fromBranchName = branches.find((b) => String(b.id) === fromBranchId)?.name;
  const toBranchName = branches.find((b) => String(b.id) === toBranchId)?.name;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ArrowRightLeft className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock transfers</h1>
          <p className="text-sm text-muted-foreground">
            Move inventory between branches — approve, then complete to move stock.
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
        <CardContent className="space-y-4">
          <form onSubmit={createTransfer} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  From branch <span className="text-destructive">*</span>
                </Label>
                <Select value={fromBranchId} onValueChange={setFromBranchId}>
                  <SelectTrigger
                    className={cn(attempted && !fromBranchId && "border-destructive ring-1 ring-destructive/30")}
                  >
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)} disabled={String(b.id) === toBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attempted && !fromBranchId && (
                  <p className="text-xs text-destructive">Select a branch to transfer from.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  To branch <span className="text-destructive">*</span>
                </Label>
                <Select value={toBranchId} onValueChange={setToBranchId}>
                  <SelectTrigger
                    className={cn(attempted && !toBranchId && "border-destructive ring-1 ring-destructive/30")}
                  >
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)} disabled={String(b.id) === fromBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attempted && !toBranchId && (
                  <p className="text-xs text-destructive">Select a branch to transfer to.</p>
                )}
              </div>
            </div>

            {fromBranchName && toBranchName && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fromBranchName}</span>
                <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium text-foreground">{toBranchName}</span>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-[1fr_140px]">
              <div className="space-y-1.5">
                <Label>
                  Product <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={productId}
                  onChange={setProductId}
                  placeholder="Search product by name..."
                  searchPlaceholder="Type to search products..."
                  emptyText="No products found."
                  className={cn(attempted && !productId && "border-destructive ring-1 ring-destructive/30")}
                  options={products.map((p) => ({
                    value: String(p.id),
                    label: p.name,
                    sublabel: p.sku ?? undefined,
                  }))}
                />
                {attempted && !productId && (
                  <p className="text-xs text-destructive">Select a product to transfer.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  inputMode="numeric"
                  min={1}
                />
              </div>
            </div>

            <div>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create transfer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Transfers</CardTitle>
            <CardDescription>{transfers.length} total</CardDescription>
          </div>
          {transfers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {(["PENDING", "APPROVED", "COMPLETED", "REJECTED"] as const)
                .map((status) => ({ status, count: transfers.filter((t) => t.status === status).length }))
                .filter(({ count }) => count > 0)
                .map(({ status, count }) => (
                  <Badge key={status} className={statusBadgeClass(status)}>
                    {count} {status.charAt(0) + status.slice(1).toLowerCase()}
                  </Badge>
                ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ArrowRightLeft className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No transfers yet.</p>
            </div>
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
                    <TableCell className="font-mono text-muted-foreground">#{t.id}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {t.fromBranch?.name}
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        {t.toBranch?.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(t.status)}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.items?.map((i) => (
                        <div key={i.product.id}>
                          {i.product.name} <span className="text-muted-foreground">× {i.quantity}</span>
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
