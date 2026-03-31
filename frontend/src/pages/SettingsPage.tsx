import { useState } from "react";
import type { FormEvent } from "react";
import * as yup from "yup";
import { api } from "../api/client";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";

const schema = yup.object({
  currentPassword: yup.string().required("Current password is required"),
  newPassword: yup.string().min(6, "New password must be at least 6 characters").required("New password is required"),
});

export function SettingsPage() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = await validateWithYup(schema, form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await api.post("/auth/change-password", form);
    setMessage("Password changed");
    setForm({ currentPassword: "", newPassword: "" });
  };

  return (
    <section className="page-stack">
      <h1>Settings</h1>
      <div className="panel">
        <p>Default currency: RWF</p>
        <p>Future compliance integration: EBM/VSDC readiness enabled in backend sale model.</p>
      </div>
      <h3>Change password</h3>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <input type="password" placeholder="Current password" value={form.currentPassword} onChange={(e) => setForm((s) => ({ ...s, currentPassword: e.target.value }))} />
        {errors.currentPassword ? <p>{errors.currentPassword}</p> : null}
        <input type="password" placeholder="New password" value={form.newPassword} onChange={(e) => setForm((s) => ({ ...s, newPassword: e.target.value }))} />
        {errors.newPassword ? <p>{errors.newPassword}</p> : null}
        <Button type="submit">Update password</Button>
      </form>
      {message ? <p>{message}</p> : null}
    </section>
  );
}
