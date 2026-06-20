import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../test/mocks/supabase-clients";
import "../../../test/mocks/next-cache";
import "../../../test/mocks/next-navigation";
import { getServerClient, resetSupabaseClients, setServerUser } from "../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../test/mocks/next-cache";
import { redirectMock } from "../../../test/mocks/next-navigation";
import { buildFormData } from "../../../test/fixtures/formdata";
import { runAction } from "../../../test/helpers/invoke-action";

import { signIn, signOut, updateOwnPassword } from "./actions";

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
    // profile lookup → must_reset_password = false
    server.enqueueResponse({
      data: { must_reset_password: false },
      error: null,
    });

    const fd = buildFormData({ email: "x@y.com", password: "right" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  // P31: forced password reset on first login after admin reset.
  it("P31: redirects to /auth/reset-password when must_reset_password is true", async () => {
    const server = getServerClient();
    server.enqueueResponse({
      data: { user: { id: "u-1" }, session: { access_token: "tok" } },
      error: null,
    });
    // profile lookup → must_reset_password = true
    server.enqueueResponse({
      data: { must_reset_password: true },
      error: null,
    });

    const fd = buildFormData({ email: "x@y.com", password: "right" });
    const result = await runAction(signIn, fd);
    expect(result.redirectedTo).toBe("/auth/reset-password");
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

// P31: updateOwnPassword is called from /auth/reset-password. The
// user is already signed in (reached the page via the must_reset
// redirect). The action changes the auth password, clears
// must_reset_password on the profile, and redirects to /dashboard.
describe("updateOwnPassword", () => {
  it("rejects when new_password is empty", async () => {
    setServerUser({ id: "u-1", email: "x@y.com" });
    const fd = buildFormData({ new_password: "", confirm_password: "" });
    await expect(updateOwnPassword(fd)).rejects.toThrow(/New password is required/);
  });

  it("rejects when new_password is too short", async () => {
    setServerUser({ id: "u-1", email: "x@y.com" });
    const fd = buildFormData({ new_password: "12345", confirm_password: "12345" });
    await expect(updateOwnPassword(fd)).rejects.toThrow(/at least 6/);
  });

  it("rejects when passwords don't match", async () => {
    setServerUser({ id: "u-1", email: "x@y.com" });
    const fd = buildFormData({ new_password: "abcdef", confirm_password: "xyzxyz" });
    await expect(updateOwnPassword(fd)).rejects.toThrow(/do not match/);
  });

  it("redirects to /auth/login when not signed in", async () => {
    // setServerUser(null) is the default; the action should redirect
    const fd = buildFormData({ new_password: "abcdef", confirm_password: "abcdef" });
    const result = await runAction(updateOwnPassword, fd);
    expect(result.redirectedTo).toBe("/auth/login");
  });

  it("calls auth.updateUser with the new password, clears must_reset_password, redirects to /dashboard", async () => {
    const server = getServerClient();
    setServerUser({ id: "u-1", email: "x@y.com" });
    // 1) auth.updateUser → success
    // 2) profile update (must_reset_password = false) → success
    server.setResponses({ data: null, error: null }, { data: null, error: null });

    const fd = buildFormData({ new_password: "newpass123", confirm_password: "newpass123" });
    const result = await runAction(updateOwnPassword, fd);
    expect(result.redirectedTo).toBe("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");

    // Verify auth.updateUser was called with the new password
    const updateCalls = server.calls.filter((c) => c.method === "auth.updateUser");
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].args[0]).toMatchObject({ password: "newpass123" });

    // Verify the profile was updated to clear must_reset_password
    const profileChains = server.chainsForTable("profiles");
    const updateCall = profileChains[0].find((c) => c.method === "update")!;
    const updateArg = updateCall.args[0] as Record<string, unknown>;
    expect(updateArg.must_reset_password).toBe(false);
  });

  it("propagates auth.updateUser errors", async () => {
    const server = getServerClient();
    setServerUser({ id: "u-1", email: "x@y.com" });
    server.setResponses({ data: null, error: { message: "weak password" } });

    const fd = buildFormData({ new_password: "newpass123", confirm_password: "newpass123" });
    const result = await runAction(updateOwnPassword, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/weak password/);
  });
});
