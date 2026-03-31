import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as yup from "yup";
import { api } from "../api/client";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";

const signupSchema = yup.object({
  fullName: yup.string().required("Full name is required"),
  email: yup.string().email("Enter a valid email").required("Email is required"),
  password: yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
});

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = await validateWithYup(signupSchema, form);
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await api.post("/auth/signup", form);
      navigate("/login");
    } catch {
      setError("Signup failed");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Get started with your inventory management.</p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label>Full Name</label>
            <input placeholder="John Doe" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} />
            {fieldErrors.fullName ? <p>{fieldErrors.fullName}</p> : null}
          </div>
          <div className="form-field">
            <label>Email Address</label>
            <input placeholder="name@company.com" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            {fieldErrors.email ? <p>{fieldErrors.email}</p> : null}
          </div>
          <div className="form-field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} />
            {fieldErrors.password ? <p>{fieldErrors.password}</p> : null}
          </div>
          <Button type="submit" style={{ marginTop: '8px', height: '44px' }}>Create account</Button>
        </form>
        {error ? <p style={{ color: 'var(--danger)', textAlign: 'center', fontSize: '13px' }}>{error}</p> : null}
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
