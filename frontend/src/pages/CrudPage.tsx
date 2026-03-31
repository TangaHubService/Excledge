import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as yup from "yup";
import { api } from "../api/client";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { StateView } from "../components/StateView";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

type SelectFieldConfig = {
  endpoint: string;
  labelKey: string;
  valueKey?: string;
  placeholder?: string;
};

export function CrudPage({
  title,
  endpoint,
  fields,
  selectFields = {},
}: {
  title: string;
  endpoint: string;
  fields: string[];
  selectFields?: Record<string, SelectFieldConfig>;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: [endpoint, { page, search }],
    queryFn: async () => (await api.get(`/${endpoint}`, { params: { page, pageSize: 10, search } })).data,
  });
  const mutation = useMutation({
    mutationFn: async () => (await api.post(`/${endpoint}`, form)).data,
    onSuccess: () => {
      setForm({});
      setIsCreateOpen(false);
      qc.invalidateQueries({ queryKey: [endpoint] });
    },
  });
  const selectEntries = Object.entries(selectFields);
  const selectQueries = useQueries({
    queries: selectEntries.map(([, cfg]) => ({
      queryKey: [cfg.endpoint],
      queryFn: async () => (await api.get(`/${cfg.endpoint}`, { params: { page: 1, pageSize: 100, search: "" } })).data.data as Record<string, unknown>[],
    })),
  });

  const columns = useMemo(() => fields.map((f) => ({ key: f, title: f })) as any, [fields]);

  return (
    <section className="page-stack">
      <div className="section-header">
        <h1>{title}</h1>
        <Button variant="ghost" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} />
          Add
        </Button>
      </div>
      <div className="panel toolbar">
        <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <StateView isLoading={q.isLoading} isError={q.isError} isEmpty={!q.isLoading && (q.data?.data?.length ?? 0) === 0} />
      <div className="panel">
        <DataTable columns={columns} rows={q.data?.data ?? []} />
      </div>
      <Pagination page={q.data?.page ?? page} pageSize={q.data?.pageSize ?? 10} total={q.data?.total ?? 0} onChange={setPage} />
      <Modal open={isCreateOpen} title={`Add ${title}`} onClose={() => setIsCreateOpen(false)}>
        <form
          className="form-grid modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const schema = yup.object(
              fields.reduce<Record<string, yup.StringSchema>>((acc, field) => {
                acc[field] = yup.string().required(`${field} is required`);
                return acc;
              }, {}),
            );
            validateWithYup(schema, form).then((errs) => {
              setFormErrors(errs);
              if (!Object.keys(errs).length) mutation.mutate();
            });
          }}
        >
          {fields.map((f) => (
            <div key={f} className="form-field">
              <label>{f}</label>
              {selectFields[f] ? (
                <select value={form[f] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))}>
                  <option value="">{selectFields[f].placeholder ?? `Select ${f}`}</option>
                  {(selectQueries[selectEntries.findIndex(([key]) => key === f)]?.data ?? []).map((row) => {
                    const valueKey = selectFields[f].valueKey ?? "id";
                    const value = String(row[valueKey] ?? "");
                    const label = String(row[selectFields[f].labelKey] ?? value);
                    return (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input placeholder={f} value={form[f] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))} />
              )}
              {formErrors[f] ? <p>{formErrors[f]}</p> : null}
            </div>
          ))}
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
