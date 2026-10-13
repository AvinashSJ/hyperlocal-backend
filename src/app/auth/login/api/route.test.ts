import { describe, it, expect, beforeEach } from "vitest";
import "../../../../../test/mocks/supabase-clients";
import {
  getAdminClient,
  getServerClient,
  resetSupabaseClients,
} from "../../../../../test/mocks/supabase-clients";

import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function signInCall() {
  return getServerClient().calls.find((c) => c.method === "auth.signInWithPassword");
}

beforeEach(() => {
  resetSupabaseClients();
});

describe("POST /auth/login/api (hCaptcha)", () => {
  it("forwards captchaToken via options when provided", async () => {
    const server = getServerClient();
    server.setResponses({ data: { user: { id: "u1" } }, error: null });
    getAdminClient().enqueueResponse({ data: { name: "Staff" }, error: null });
    server.enqueueResponse({
      data: { must_reset_password: false, role_id: "r1" },
      error: null,
    });

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret", captchaToken: "tok-123" }),
    );

    expect(res.status).toBe(200);
    expect(signInCall()?.args[0]).toEqual({
      email: "a@b.com",
      password: "secret",
      options: { captchaToken: "tok-123" },
    });
  });

  it("omits captcha options when no token is sent", async () => {
    const server = getServerClient();
    server.setResponses({ data: { user: { id: "u1" } }, error: null });
    getAdminClient().enqueueResponse({ data: { name: "Staff" }, error: null });
    server.enqueueResponse({
      data: { must_reset_password: false, role_id: "r1" },
      error: null,
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "secret" }));

    expect(res.status).toBe(200);
    expect(signInCall()?.args[0]).toEqual({ email: "a@b.com", password: "secret" });
  });

  it("returns 400 with a captcha-specific message on captcha_failed", async () => {
    getServerClient().setResponses({
      data: { user: null },
      error: { code: "captcha_failed", message: "captcha protection: request disallowed" },
    });

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret", captchaToken: "bad" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Please complete the CAPTCHA and try again.");
  });

  it("returns 400 (captcha message) when the error message mentions captcha", async () => {
    getServerClient().setResponses({
      data: { user: null },
      error: { message: "captcha protection: no captcha_token found" },
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "secret" }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Please complete the CAPTCHA and try again.");
  });

  it("returns 401 with a generic message for non-captcha auth errors", async () => {
    getServerClient().setResponses({
      data: { user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "wrong" }));

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid email or password.");
  });

  it("returns 400 when email or password is missing (before any auth call)", async () => {
    const res = await POST(makeRequest({ email: "", password: "" }));

    expect(res.status).toBe(400);
    expect(signInCall()).toBeUndefined();
  });
});
