import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../test/mocks/supabase-clients";
import "../../../test/mocks/next-cache";
import "../../../test/mocks/next-navigation";
import { getServerClient, resetSupabaseClients } from "../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../test/mocks/next-cache";
import { redirectMock } from "../../../test/mocks/next-navigation";
import { buildFormData } from "../../../test/fixtures/formdata";
import { runAction } from "../../../test/helpers/invoke-action";

import { signIn, signOut } from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  revalidatePathMock.mockClear();
  redirectMock.mockClear();
});

describe("signIn", () => {
  it("redirects to login with error when email is missing", async () => {
    const fd = buildFormData({ email: "", password: "x" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/auth/login?error=Email%20and%20password%20are%20required");
  });

  it("redirects to login with error when password is missing", async () => {
    const fd = buildFormData({ email: "x@y.com", password: "" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/auth/login?error=Email%20and%20password%20are%20required");
  });

  it("redirects to login with sanitized error on invalid credentials", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const fd = buildFormData({ email: "x@y.com", password: "wrong" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/auth/login?error=Invalid%20email%20or%20password.");
  });

  it("redirects to login with 'please confirm your email' message on unconfirmed email", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });

    const fd = buildFormData({ email: "x@y.com", password: "wrong" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toContain("Please%20confirm%20your%20email%20address%20first");
  });

  it("redirects to login with 'already registered' on duplicate", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });

    const fd = buildFormData({ email: "x@y.com", password: "wrong" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toContain("An%20account%20with%20that%20email%20already%20exists");
  });

  it("redirects to login with rate limit message", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: null, session: null },
      error: { message: "Rate limit exceeded" },
    });

    const fd = buildFormData({ email: "x@y.com", password: "wrong" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toContain("Too%20many%20attempts");
  });

  it("redirects to login with generic error on unknown error message", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: null, session: null },
      error: { message: "Some weird internal error" },
    });

    const fd = buildFormData({ email: "x@y.com", password: "wrong" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toContain("An%20error%20occurred");
  });

  it("redirects to /dashboard and revalidates on success", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: { id: "u-1" }, session: { access_token: "tok" } },
      error: null,
    });

    const fd = buildFormData({ email: "x@y.com", password: "right" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});

describe("signOut", () => {
  it("calls auth.signOut, revalidates, and redirects to login with success message", async () => {
    const server = getServerClient();
    server.enqueueResponse({ error: null });

    const result = await runAction(signOut, new FormData());
    expect(server.calls.some((c) => c.method === "auth.signOut")).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(result.redirectedTo).toBe("/auth/login?message=Signed%20out%20successfully.");
  });
});
