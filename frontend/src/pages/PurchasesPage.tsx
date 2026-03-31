export function PurchasesPage() {
  return <TransactionPage />;
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as yup from "yup";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

function TransactionPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ branchId: "", supplierId: "", referenceNo: "", productId: "", quantity: "", unitCost: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isAddOpen, setIsAddOpen] = useState(false);
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches", { params: { page: 1, pageSize: 100, search: "" } })).data.data as any[] });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await api.get("/suppliers", { params: { page: 1, pageSize: 100, search: "" } })).data.data as any[] });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get("/products", { params: { page: 1, pageSize: 100, search: "" } })).data.data as any[] });
  const list = useQuery({ queryKey: ["purchases"], queryFn: async () => (await api.get("/purchases")).data.data });
  const create = useMutation({
    mutationFn: async () =>
      api.post("/purchases", {
        branchId: form.branchId,
        supplierId: form.supplierId,
        referenceNo: form.referenceNo,
        items: [{ productId: form.productId, quantity: Number(form.quantity), unitCost: Number(form.unitCost) }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      setIsAddOpen(false);
      setForm({ branchId: "", supplierId: "", referenceNo: "", productId: "", quantity: "", unitCost: "" });
    },
  });
  const schema = yup.object({
    branchId: yup.string().required("branchId is required"),
    supplierId: yup.string().required("supplierId is required"),
    referenceNo: yup.string().required("referenceNo is required"),
    productId: yup.string().required("productId is required"),
    quantity: yup.number().positive("quantity must be positive").required("quantity is required"),
    unitCost: yup.number().positive("unitCost must be positive").required("unitCost is required"),
  });
  const branchName = (id: string) => (branches.data ?? []).find((b) => b.id === id)?.name ?? id;
  const supplierName = (id: string) => (suppliers.data ?? []).find((s) => s.id === id)?.name ?? id;
  return (
    <section className="page-stack">
      <div className="section-header">
        <h1>Purchases</h1>
        <Button variant="ghost" onClick={() => setIsAddOpen(true)}>
          <Plus size={16} />
          Add Purchase
        </Button>
      </div>
      <div className="panel">
        <DataTable
          rows={list.data ?? []}
          columns={[
            { key: "referenceNo", title: "Reference" },
            { key: "branchId", title: "Branch", render: (row) => branchName(String(row.branchId)) },
            { key: "supplierId", title: "Supplier", render: (row) => supplierName(String(row.supplierId)) },
            { key: "totalAmount", title: "Total" },
            { key: "createdAt", title: "Created" },
          ]}
        />
      </div>
      <Modal open={isAddOpen} title="Record purchase" onClose={() => setIsAddOpen(false)}>
        <form className="form-grid modal-form" onSubmit={(e) => { e.preventDefault(); validateWithYup(schema, form).then((errs) => { setErrors(errs); if (!Object.keys(errs).length) create.mutate(); }); }}>
          <div className="form-field">
            <label>Branch</label>
            <select value={form.branchId} onChange={(e) => setForm((s) => ({ ...s, branchId: e.target.value }))}>
              <option value="">Select branch</option>
              {(branches.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {errors.branchId ? <p>{errors.branchId}</p> : null}
          </div>
          <div className="form-field">
            <label>Supplier</label>
            <select value={form.supplierId} onChange={(e) => setForm((s) => ({ ...s, supplierId: e.target.value }))}>
              <option value="">Select supplier</option>
              {(suppliers.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            {errors.supplierId ? <p>{errors.supplierId}</p> : null}
          </div>
          <div className="form-field">
            <label>Product</label>
            <select value={form.productId} onChange={(e) => setForm((s) => ({ ...s, productId: e.target.value }))}>
              <option value="">Select product</option>
              {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            {errors.productId ? <p>{errors.productId}</p> : null}
          </div>
          <div className="form-field">
            <label>Reference No</label>
            <input placeholder="Reference No" value={form.referenceNo} onChange={(e) => setForm((s) => ({ ...s, referenceNo: e.target.value }))} />
            {errors.referenceNo ? <p>{errors.referenceNo}</p> : null}
          </div>
          <div className="form-field">
            <label>Quantity</label>
            <input placeholder="Quantity" value={form.quantity} onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))} />
            {errors.quantity ? <p>{errors.quantity}</p> : null}
          </div>
          <div className="form-field">
            <label>Unit Cost</label>
            <input placeholder="Unit Cost" value={form.unitCost} onChange={(e) => setForm((s) => ({ ...s, unitCost: e.target.value }))} />
            {errors.unitCost ? <p>{errors.unitCost}</p> : null}
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Record purchase</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
