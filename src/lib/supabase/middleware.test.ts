import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type AuthError = { code?: string; message?: string; __isAuthError?: boolean };

type GetUserResult =
  | { data: { user: { id: string; email: string } | null }; error: null }
  | never;

type GetUserBehaviour = {
  result?: GetUserResult;
  error?: AuthError;
  profile?: { role_id: number | null } | null;
  role?: { name: string } | null;
};

let currentBehaviour: GetUserBehaviour = {
  result: { data: { user: null }, error: null as never },
};

function chainableQuery(result: unknown) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: result, error: null }),
      }),
    }),
  };
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => {
        if (currentBehaviour.error) throw currentBehaviour.error;
        return currentBehaviour.result;
      },
    },
    from: (table: string) => {
      if (table === "profiles") return chainableQuery(currentBehaviour.profile ?? null);
      if (table === "roles") return chainableQuery(currentBehaviour.role ?? null);
      return chainableQuery(null);
    },
  }),
}));

import { updateSession } from "./middleware";

beforeEach(() => {
  currentBehaviour = {
    result: { data: { user: null }, error: null as never },
    profile: null,
    role: null,
  };
});

function makeRequest(
  path: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const req = new NextRequest(new URL(path, "http://localhost"), { headers });
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("updateSession", () => {
  it("returns a passthrough response for an unauthenticated user on a non-login path", async () => {
    const req = makeRequest("/dashboard");
    const res = await updateSession(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(200);
  });

  it("redirects an authenticated user from /auth/login to /dashboard", async () => {
    currentBehaviour = {
      result: { data: { user: { id: "u-1", email: "x@y.com" } }, error: null as never },
    };
    const req = makeRequest("/auth/login");
    const res = await updateSession(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBeGreaterThanOrEqual(300);
    expect(res?.status).toBeLessThan(400);
    expect(res?.headers.get("location")).toContain("/dashboard");
  });

  it("does NOT redirect an authenticated user away from a non-login path", async () => {
    currentBehaviour = {
      result: { data: { user: { id: "u-1", email: "x@y.com" } }, error: null as never },
    };
    const req = makeRequest("/dashboard");
    const res = await updateSession(req);
    expect(res?.status).toBe(200);
  });

  it("does NOT redirect an unauthenticated user from /auth/login (lets them sign in)", async () => {
    const req = makeRequest("/auth/login");
    const res = await updateSession(req);
    expect(res?.status).toBe(200);
  });

  it("clears sb-* cookies and treats the user as unauthenticated when getUser throws refresh_token_not_found", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    currentBehaviour = {
      error: {
        code: "refresh_token_not_found",
        message: "Invalid Refresh Token: Refresh Token Not Found",
        __isAuthError: true,
      },
    };
    const req = makeRequest("/dashboard", {
      "sb-access-token": "expired-access",
      "sb-refresh-token": "stale-refresh",
    });
    const res = await updateSession(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(res?.cookies.get("sb-access-token")?.value).toBe("");
    expect(res?.cookies.get("sb-refresh-token")?.value).toBe("");
    warnSpy.mockRestore();
  });

  it("clears auth-token cookies when getUser throws refresh_token_not_found", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    currentBehaviour = {
      error: {
        code: "refresh_token_not_found",
        message: "Invalid Refresh Token: Refresh Token Not Found",
        __isAuthError: true,
      },
    };
    const req = makeRequest("/dashboard", {
      "sb-tok-project-auth-token": "stale",
    });
    const res = await updateSession(req);
    expect(res?.cookies.get("sb-tok-project-auth-token")?.value).toBe("");
    warnSpy.mockRestore();
  });

  it("re-throws unknown errors so they remain visible", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknown = new Error("network down");
    currentBehaviour = { error: unknown as unknown as AuthError };
    const req = makeRequest("/dashboard");
    await expect(updateSession(req)).rejects.toBe(unknown);
    spy.mockRestore();
  });

  it("does not redirect to /dashboard when getUser throws refresh_token_not_found on /auth/login", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    currentBehaviour = {
      error: {
        code: "refresh_token_not_found",
        message: "Invalid Refresh Token: Refresh Token Not Found",
        __isAuthError: true,
      },
    };
    const req = makeRequest("/auth/login", { "sb-access-token": "x" });
    const res = await updateSession(req);
    expect(res?.status).toBe(200);
    warnSpy.mockRestore();
  });
});
