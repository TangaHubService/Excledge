import { useState } from "react";
import type { FormEvent } from "react";
import * as yup from "yup";
import { api } from "../api/client";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";

const schema = yup.object({
  email: yup.string().email("Enter a valid email").required("Email is required"),
});

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = await validateWithYup(schema, { email });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await api.post("/auth/forgot-password", { email });
    setMessage("If the email exists, a reset link has been sent.");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Forgot Password</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Enter your email to receive a password reset link.</p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label>Email Address</label>
            <input placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email ? <p>{errors.email}</p> : null}
          </div>
          <Button type="submit" style={{ marginTop: '8px' }}>Send reset link</Button>
        </form>
        {message ? <p style={{ color: 'var(--success)', textAlign: 'center', fontSize: '13px' }}>{message}</p> : null}
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <Link to="/login" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Back to Login</Link>
        </div>
      </div>
    </div>
  );
}
