import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as yup from "yup";
import { api } from "../api/client";
import { validateWithYup } from "../utils/validation";
import { Button } from "../components/ui/Button";

const loginSchema = yup.object({
  email: yup.string().email("Enter a valid email").required("Email is required"),
  password: yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
});

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = await validateWithYup(loginSchema, { email, password });
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.data.token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="auth-page">
      <div className="login">
        <h1>Inventory Login</h1>
        <form onSubmit={onSubmit}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email ? <p>{fieldErrors.email}</p> : null}
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {fieldErrors.password ? <p>{fieldErrors.password}</p> : null}
          <Button type="submit">Sign in</Button>
        </form>
        {error ? <p>{error}</p> : null}
        <p>
          No account? <Link to="/signup">Sign up</Link>
        </p>
        <p>
          Forgot password? <Link to="/forgot-password">Reset it</Link>
        </p>
      </div>
    </div>
  );
}
