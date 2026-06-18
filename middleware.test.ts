import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { updateSessionMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(async (_request: NextRequest) => {
    return NextResponse.next();
  }),
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: updateSessionMock,
}));

import { middleware } from "./middleware";
import { config as middlewareConfig } from "./middleware";

beforeEach(() => {
  updateSessionMock.mockClear();
});

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost"), { headers });
}

describe("middleware (root)", () => {
  it("returns early (undefined) when the request has a 'next-action' header", async () => {
    const req = makeRequest("/api/x", { "next-action": "abc123" });
    const res = await middleware(req);
    expect(res).toBeUndefined();
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("calls updateSession for normal requests and returns its result", async () => {
    const nextResponse = NextResponse.next();
    updateSessionMock.mockResolvedValueOnce(nextResponse);

    const req = makeRequest("/dashboard");
    const res = await middleware(req);
    expect(updateSessionMock).toHaveBeenCalledWith(req);
    expect(res).toBe(nextResponse);
  });

  it("awaits updateSession even when it returns a redirect response", async () => {
    const redirectResponse = NextResponse.redirect(new URL("/auth/login", "http://localhost"));
    updateSessionMock.mockResolvedValueOnce(redirectResponse);

    const req = makeRequest("/dashboard");
    const res = await middleware(req);
    expect(res).toBe(redirectResponse);
    expect(res?.status).toBeGreaterThanOrEqual(300);
  });
});

describe("middleware config (matcher)", () => {
  it("declares a matcher array", () => {
    expect(Array.isArray(middlewareConfig.matcher)).toBe(true);
  });

  it("matcher excludes _next/static and _next/image", () => {
    expect(middlewareConfig.matcher.join("|")).toMatch(/_next\/static/);
    expect(middlewareConfig.matcher.join("|")).toMatch(/_next\/image/);
  });

  it("matcher excludes favicon and common image extensions", () => {
    const matcher = middlewareConfig.matcher.join("|");
    expect(matcher).toMatch(/favicon/);
    expect(matcher).toMatch(/svg/);
    expect(matcher).toMatch(/png/);
    expect(matcher).toMatch(/jpe?g/);
    expect(matcher).toMatch(/webp/);
  });
});
