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
    <div className="login">
      <h1>Reset password</h1>
      <form onSubmit={onSubmit}>
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        {errors.newPassword ? <p>{errors.newPassword}</p> : null}
        <Button type="submit">Reset password</Button>
      </form>
      {message ? <p>{message}</p> : null}
    </div>
    </div>
  );
}
