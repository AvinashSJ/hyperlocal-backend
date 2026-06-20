import { describe, it, expect, beforeEach, vi } from "vitest";
import "../mocks/supabase-clients";
import "../mocks/require-permission";
import "../mocks/next-cache";
import "../mocks/next-navigation";

import {
  getAdminClient,
  getServerClient,
  setServerUser,
  resetSupabaseClients,
} from "../mocks/supabase-clients";
import {
  asSuperAdmin,
  asAdmin,
  asAnonymous,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../mocks/require-permission";
import { revalidatePathMock } from "../mocks/next-cache";
import { redirectMock } from "../mocks/next-navigation";
import { buildFormData, buildFormDataWithFiles } from "../fixtures/formdata";
import { runAction } from "../helpers/invoke-action";
import { makeProduct, makeCategory } from "../fixtures/factories";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  redirectMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("P1 smoke: chainable Supabase mock", () => {
  it("records .from().select().eq() chain calls", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    createAdminClient();
    const handle = getAdminClient();
    handle.setResponses({ data: [makeProduct()], error: null });

    const admin = createAdminClient();
    const result = await admin.from("products").select("*").eq("status", "active").limit(5);

    expect(result.data).toHaveLength(1);
    const chains = handle.chainsForTable("products");
    expect(chains.length).toBeGreaterThan(0);
    const lastChain = chains[chains.length - 1];
    expect(lastChain[0]).toEqual({ method: "from", args: ["products"] });
    expect(lastChain[1]).toEqual({ method: "select", args: ["*"] });
    expect(lastChain[2]).toEqual({ method: "eq", args: ["status", "active"] });
    expect(lastChain[3]).toEqual({ method: "limit", args: [5] });
  });

  it("supports insert().select().single()", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    createAdminClient();
    const handle = getAdminClient();
    handle.setResponses({ data: { id: "new-1" }, error: null });
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("categories")
      .insert({ name: "Test" })
      .select("id")
      .single();

    expect(data).toEqual({ id: "new-1" });
    expect(error).toBeNull();
  });

  it("queues multiple responses consumed in order", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    createAdminClient();
    const handle = getAdminClient();
    handle.setResponses(
      { data: [makeCategory({ name: "A" })], error: null },
      { data: [makeCategory({ name: "B" })], error: null },
    );
    const admin = createAdminClient();

    const r1 = await admin.from("categories").select("*");
    const r2 = await admin.from("categories").select("*");

    expect((r1.data as any[])[0].name).toBe("A");
    expect((r2.data as any[])[0].name).toBe("B");
  });

  it("surfaces errors from queued responses", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    createAdminClient();
    const handle = getAdminClient();
    handle.setResponses({ data: null, error: { message: "boom" } });
    const admin = createAdminClient();

    const { data, error } = await admin.from("products").insert({ name: "x" });
    expect(data).toBeNull();
    expect((error as any).message).toBe("boom");
  });
});

describe("P1 smoke: server client + user injection", () => {
  it("returns null user by default", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });

  it("returns injected user when setServerUser is called", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    setServerUser({ id: "u-1", email: "x@y.com" });
    const client = await createClient();
    const { data } = await client.auth.getUser();
    expect(data.user).toEqual({ id: "u-1", email: "x@y.com" });
  });
});

describe("P1 smoke: permission mock", () => {
  it("asSuperAdmin allows every action", async () => {
    asSuperAdmin();
    const { assertPermission } = await import("@/lib/require-permission");
    await expect(assertPermission("orders", "delete")).resolves.toBeDefined();
  });

  it("asAdmin with permission allows", async () => {
    asAdmin({ orders: ["view", "edit"] });
    const { assertPermission } = await import("@/lib/require-permission");
    await expect(assertPermission("orders", "edit")).resolves.toBeDefined();
  });

  it("asAdmin without permission throws PermissionError", async () => {
    asAdmin({ orders: ["view"] });
    const { assertPermission } = await import("@/lib/require-permission");
    await expect(assertPermission("orders", "delete")).rejects.toBeInstanceOf(PermissionError);
  });

  it("asAnonymous makes assertPermission throw", async () => {
    asAnonymous();
    const { assertPermission } = await import("@/lib/require-permission");
    await expect(assertPermission("orders", "view")).rejects.toThrow();
  });
});

describe("P1 smoke: next-cache + next-navigation mocks", () => {
  it("revalidatePath is a vi.fn", async () => {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/products");
    expect(revalidatePathMock).toHaveBeenCalledWith("/products");
  });

  it("redirect throws NEXT_REDIRECT with url in digest (production format)", async () => {
    const { redirect } = await import("next/navigation");
    let caught: unknown = null;
    try {
      redirect("/dashboard");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("NEXT_REDIRECT");
    expect((caught as { digest: string }).digest).toBe("NEXT_REDIRECT;push;/dashboard;307;");
  });
});

describe("P1 smoke: formdata builders", () => {
  it("buildFormData coerces booleans to on/off", () => {
    const fd = buildFormData({ name: "x", is_active: true, is_featured: false });
    expect(fd.get("name")).toBe("x");
    expect(fd.get("is_active")).toBe("on");
    expect(fd.get("is_featured")).toBe("off");
  });

  it("buildFormDataWithFiles appends files", () => {
    const fd = buildFormDataWithFiles({
      fields: { name: "x" },
      files: { files: { name: "a.png", type: "image/png" } },
    });
    expect(fd.get("name")).toBe("x");
    const files = fd.getAll("files");
    expect(files).toHaveLength(1);
    expect((files[0] as File).name).toBe("a.png");
  });
});

describe("P1 smoke: runAction helper", () => {
  it("captures NEXT_REDIRECT as redirectedTo", async () => {
    const fn = vi.fn(async () => {
      const { redirect } = await import("next/navigation");
      redirect("/dashboard");
    });
    const result = await runAction(fn as any, new FormData());
    expect(result.redirectedTo).toBe("/dashboard");
  });

  it("captures thrown errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await runAction(fn as any, new FormData());
    expect(result.error?.message).toBe("boom");
  });

  it("returns value on success", async () => {
    const fn = vi.fn(async () => ({ imported: 3 }));
    const result = await runAction(fn as any, new FormData());
    expect(result.value).toEqual({ imported: 3 });
  });
});
