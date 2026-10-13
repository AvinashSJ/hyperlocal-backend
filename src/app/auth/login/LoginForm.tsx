"use client";

import { useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const HCAPTCHA_SITEKEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);
  const router = useRouter();

  // CAPTCHA is only enforced when a sitekey is configured. While it is unset
  // the widget is not rendered and no token is sent, so login behaves exactly
  // as before (Supabase's CAPTCHA toggle is off until we opt in).
  const captchaEnabled = Boolean(HCAPTCHA_SITEKEY);

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
        captchaToken: captchaToken ?? undefined,
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
      // Captcha tokens are single-use: reset and require a fresh one.
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
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
      {captchaEnabled && HCAPTCHA_SITEKEY ? (
        <div>
          <HCaptcha
            ref={captchaRef}
            sitekey={HCAPTCHA_SITEKEY}
            onVerify={(token) => setCaptchaToken(token)}
            onExpire={() => setCaptchaToken(null)}
          />
        </div>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary btn-lg w-100"
        disabled={loading || (captchaEnabled && !captchaToken)}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
