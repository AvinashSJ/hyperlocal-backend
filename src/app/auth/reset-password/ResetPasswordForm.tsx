"use client";

import { useState, FormEvent } from "react";
import { updateOwnPassword } from "../actions";

export default function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    try {
      await updateOwnPassword(form);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update password");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="d-grid gap-3">
      {error ? (
        <div className="alert alert-danger py-2" role="alert">{error}</div>
      ) : null}
      <div>
        <label htmlFor="new_password" className="form-label">New password</label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={6}
          placeholder="At least 6 characters"
          className="form-control form-control-lg"
        />
      </div>
      <div>
        <label htmlFor="confirm_password" className="form-label">Confirm new password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={6}
          placeholder="Repeat the password"
          className="form-control form-control-lg"
        />
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-100" disabled={loading}>
        {loading ? "Updating..." : "Set new password"}
      </button>
    </form>
  );
}
