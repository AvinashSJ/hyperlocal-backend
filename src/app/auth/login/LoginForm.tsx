"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/auth/login/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // P31: API may return a redirect target if the user is flagged
      // for a forced password reset on first login.
      const target = data.redirectTo || "/dashboard";
      router.push(target);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Invalid email or password.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="d-grid gap-3 mb-3">
      {error ? (
        <div className="alert alert-danger py-2" role="alert">{error}</div>
      ) : null}
      <div>
        <label htmlFor="email" className="form-label">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="admin@example.com"
          className="form-control form-control-lg"
        />
      </div>
      <div>
        <label htmlFor="password" className="form-label">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          placeholder="Enter your password"
          className="form-control form-control-lg"
        />
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-100" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
