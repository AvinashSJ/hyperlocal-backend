import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type CookieBehaviour = {
  getUserResult: { data: { user: { id: string; email: string } | null }; error: null };
};

let currentBehaviour: CookieBehaviour = {
  getUserResult: { data: { user: null }, error: null as never },
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => currentBehaviour.getUserResult,
    },
  }),
}));

import { updateSession } from "./middleware";

beforeEach(() => {
  currentBehaviour = {
    getUserResult: { data: { user: null }, error: null as never },
  };
});

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost"), { headers });
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
      getUserResult: { data: { user: { id: "u-1", email: "x@y.com" } }, error: null as never },
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
      getUserResult: { data: { user: { id: "u-1", email: "x@y.com" } }, error: null as never },
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
});
