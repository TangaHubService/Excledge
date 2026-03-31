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
    <div className="login">
      <h1>Forgot password</h1>
      <form onSubmit={onSubmit}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {errors.email ? <p>{errors.email}</p> : null}
        <Button type="submit">Send reset link</Button>
      </form>
      {message ? <p>{message}</p> : null}
    </div>
    </div>
  );
}
