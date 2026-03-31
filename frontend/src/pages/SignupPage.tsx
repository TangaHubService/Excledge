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
    <div className="login">
      <h1>Create account</h1>
      <form onSubmit={onSubmit}>
        <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} />
        {fieldErrors.fullName ? <p>{fieldErrors.fullName}</p> : null}
        <input placeholder="Email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
        {fieldErrors.email ? <p>{fieldErrors.email}</p> : null}
        <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} />
        {fieldErrors.password ? <p>{fieldErrors.password}</p> : null}
        <Button type="submit">Sign up</Button>
      </form>
      {error ? <p>{error}</p> : null}
      <p>
        Have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
    </div>
  );
}
