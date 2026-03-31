import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as yup from "yup";
import { api } from "../api/client";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";

const schema = yup.object({
  newPassword: yup.string().min(6, "Password must be at least 6 characters").required("New password is required"),
});

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") ?? "", [location.search]);
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = await validateWithYup(schema, { newPassword });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await api.post("/auth/reset-password", { token, newPassword });
    setMessage("Password reset successful");
    setTimeout(() => navigate("/login"), 1000);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset Password</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Enter your new password below.</p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label>New Password</label>
            <input type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            {errors.newPassword ? <p>{errors.newPassword}</p> : null}
          </div>
          <Button type="submit" style={{ marginTop: '8px' }}>Reset Password</Button>
        </form>
        {message ? <p style={{ color: 'var(--success)', textAlign: 'center', fontSize: '13px' }}>{message}</p> : null}
      </div>
    </div>
  );
}
