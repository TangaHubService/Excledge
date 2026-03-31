import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
    branchId: yup.string().required("branchId is required"),
    productId: yup.string().required("productId is required"),
    quantityDelta: yup.number().required("quantityDelta is required"),
    reason: yup.string().required("reason is required"),
  });
  const branchName = (id: string) => (branches.data ?? []).find((b) => b.id === id)?.name ?? id;
  const productName = (id: string) => (products.data ?? []).find((p) => p.id === id)?.name ?? id;
  return (
    <section className="page-stack">
      <div className="section-header">
        <h1>Inventory</h1>
        <Button variant="ghost" onClick={() => setIsAddOpen(true)}>
          <Plus size={16} />
          Add Adjustment
        </Button>
      </div>
      <h3>Balances</h3>
      <div className="panel">
        <DataTable
          rows={balances.data ?? []}
          columns={[
            { key: "branchId", title: "Branch", render: (row) => branchName(String(row.branchId)) },
            { key: "productId", title: "Product", render: (row) => productName(String(row.productId)) },
            { key: "quantity", title: "Qty" },
          ]}
        />
      </div>
      <h3>Recent Movements</h3>
      <div className="panel">
        <DataTable
          rows={movements.data ?? []}
          columns={[
            { key: "type", title: "Type" },
            { key: "productId", title: "Product", render: (row) => productName(String(row.productId)) },
            { key: "quantityDelta", title: "Delta" },
            { key: "referenceType", title: "Ref Type" },
          ]}
        />
      </div>
      <Modal open={isAddOpen} title="Add stock adjustment" onClose={() => setIsAddOpen(false)}>
        <form className="form-grid modal-form" onSubmit={(e) => { e.preventDefault(); validateWithYup(schema, adjustment).then((errs) => { setErrors(errs); if (!Object.keys(errs).length) createAdj.mutate(); }); }}>
          <div className="form-field">
            <label>Branch</label>
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
            <label>Quantity Delta</label>
            <input placeholder="Quantity delta" value={adjustment.quantityDelta} onChange={(e) => setAdjustment((s) => ({ ...s, quantityDelta: e.target.value }))} />
            {errors.quantityDelta ? <p>{errors.quantityDelta}</p> : null}
          </div>
          <div className="form-field">
            <label>Reason</label>
            <input placeholder="Reason" value={adjustment.reason} onChange={(e) => setAdjustment((s) => ({ ...s, reason: e.target.value }))} />
            {errors.reason ? <p>{errors.reason}</p> : null}
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createAdj.isPending}>Apply adjustment</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
