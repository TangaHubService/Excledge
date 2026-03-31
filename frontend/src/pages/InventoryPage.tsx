import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, History, Package, ArrowRightLeft } from "lucide-react";
import * as yup from "yup";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

export function InventoryPage() {
  const [adjustment, setAdjustment] = useState({ branchId: "", productId: "", quantityDelta: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const qc = useQueryClient();
  
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches", { params: { page: 1, pageSize: 100, search: "" } })).data.data as any[] });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get("/products", { params: { page: 1, pageSize: 100, search: "" } })).data.data as any[] });
  const balances = useQuery({ queryKey: ["balances"], queryFn: async () => (await api.get("/inventory/balances")).data.data });
  const movements = useQuery({ queryKey: ["movements"], queryFn: async () => (await api.get("/inventory/movements")).data.data });
  
  const createAdj = useMutation({
    mutationFn: async () => api.post("/inventory/adjustments", { ...adjustment, quantityDelta: Number(adjustment.quantityDelta) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setAdjustment({ branchId: "", productId: "", quantityDelta: "", reason: "" });
      setIsAddOpen(false);
    },
  });

  const schema = yup.object({
    branchId: yup.string().required("Branch is required"),
    productId: yup.string().required("Product is required"),
    quantityDelta: yup.number().typeError("Must be a number").required("Quantity is required"),
    reason: yup.string().required("Reason is required"),
  });

  const branchName = (id: string) => (branches.data ?? []).find((b) => b.id === id)?.name ?? id;
  const productName = (id: string) => (products.data ?? []).find((p) => p.id === id)?.name ?? id;

  return (
    <div className="page-stack">
      <div className="section-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Inventory Tracking</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>Manage stock levels and view movements across branches</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={18} />
          Create Adjustment
        </Button>
      </div>

      <div style={{ display: 'grid', gap: '24px' }}>
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Package size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Current Balances</h2>
          </div>
          <div className="panel">
            <DataTable
              rows={balances.data ?? []}
              columns={[
                { key: "branchId", title: "Branch", render: (row: any) => <span style={{ fontWeight: 500 }}>{branchName(String(row.branchId))}</span> },
                { key: "productId", title: "Product", render: (row: any) => productName(String(row.productId)) },
                { key: "quantity", title: "Available Qty", render: (row: any) => (
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    background: Number(row.quantity) < 10 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: Number(row.quantity) < 10 ? 'var(--danger)' : 'var(--success)',
                    fontWeight: 600
                  }}>
                    {row.quantity as React.ReactNode}
                  </span>
                )},
              ]}
            />
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <History size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Stock Movements</h2>
          </div>
          <div className="panel">
            <DataTable
              rows={movements.data ?? []}
              columns={[
                { key: "type", title: "Type", render: (row: any) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ArrowRightLeft size={14} color="var(--text-muted)" />
                    <span style={{ textTransform: 'capitalize' }}>{String(row.type).toLowerCase()}</span>
                  </div>
                )},
                { key: "productId", title: "Product", render: (row: any) => productName(String(row.productId)) },
                { key: "quantityDelta", title: "Adjustment", render: (row: any) => (
                  <span style={{ color: Number(row.quantityDelta) > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {Number(row.quantityDelta) > 0 ? '+' : ''}{row.quantityDelta as React.ReactNode}
                  </span>
                )},
                { key: "referenceType", title: "Source", render: (row: any) => <span style={{ color: 'var(--text-muted)' }}>{String(row.referenceType)}</span> },
              ]}
            />
          </div>
        </section>
      </div>

      <Modal open={isAddOpen} title="Manual Stock Adjustment" onClose={() => setIsAddOpen(false)}>
        <form 
          className="form-grid" 
          style={{ gridTemplateColumns: '1fr 1fr' }}
          onSubmit={(e) => { 
            e.preventDefault(); 
            validateWithYup(schema, adjustment).then((errs) => { 
              setErrors(errs); 
              if (!Object.keys(errs).length) createAdj.mutate(); 
            }); 
          }}
        >
          <div className="form-field">
            <label>Target Branch</label>
            <select value={adjustment.branchId} onChange={(e) => setAdjustment((s) => ({ ...s, branchId: e.target.value }))}>
              <option value="">Select branch</option>
              {(branches.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {errors.branchId ? <p>{errors.branchId}</p> : null}
          </div>
          <div className="form-field">
            <label>Product</label>
            <select value={adjustment.productId} onChange={(e) => setAdjustment((s) => ({ ...s, productId: e.target.value }))}>
              <option value="">Select product</option>
              {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            {errors.productId ? <p>{errors.productId}</p> : null}
          </div>
          <div className="form-field">
            <label>Quantity Change (+/-)</label>
            <input type="number" placeholder="e.g. 10 or -5" value={adjustment.quantityDelta} onChange={(e) => setAdjustment((s) => ({ ...s, quantityDelta: e.target.value }))} />
            {errors.quantityDelta ? <p>{errors.quantityDelta}</p> : null}
          </div>
          <div className="form-field">
            <label>Reason / Note</label>
            <input placeholder="e.g. Restock or Damage" value={adjustment.reason} onChange={(e) => setAdjustment((s) => ({ ...s, reason: e.target.value }))} />
            {errors.reason ? <p>{errors.reason}</p> : null}
          </div>
          <div className="modal-actions" style={{ gridColumn: 'span 2' }}>
            <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createAdj.isPending}>Confirm Adjustment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
