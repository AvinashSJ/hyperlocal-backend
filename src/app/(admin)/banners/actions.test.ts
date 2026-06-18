import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";
import {
  asAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import { makeBanner } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getBanners", () => {
  it("returns banners ordered by position asc, all stores when no storeId", async () => {
    const admin = getAdminClient();
    const b1 = makeBanner({ id: "bn-1", name: "Banner 1", position: 0, store_id: null });
    const b2 = makeBanner({ id: "bn-2", name: "Banner 2", position: 1, store_id: "s-1" });
    admin.setResponses({ data: [b1, b2], error: null });

    const result = await getBanners();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("bn-1");

    const chains = admin.chainsForTable("banners");
    expect(chains[0].some((c) => c.method === "order")).toBe(true);
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("applies store_id eq filter when storeId is provided", async () => {
    const admin = getAdminClient();
    const b1 = makeBanner({ id: "bn-1", name: "Banner 1", store_id: "s-1" });
    admin.setResponses({ data: [b1], error: null });

    await getBanners("s-1");

    const chains = admin.chainsForTable("banners");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-1"]);
  });

  it("does NOT apply store_id eq when storeId is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getBanners(null);
    const chains = admin.chainsForTable("banners");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("does NOT apply store_id eq when storeId is undefined", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getBanners();
    const chains = admin.chainsForTable("banners");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getBanners();
    expect(result).toEqual([]);
  });

  it("throws when there is an error", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getBanners()).rejects.toThrow(/db down/);
  });
});

describe("createBanner", () => {
  it("rejects users without banners:create permission", async () => {
    asAdmin({ banners: ["view"] });
    const fd = buildFormData({ name: "Banner 1" });
    await expect(createBanner(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty", async () => {
    asAdmin({ banners: ["create"] });
    const fd = buildFormData({ name: "" });
    await expect(createBanner(fd)).rejects.toThrow(/Banner name is required/);
  });

  it("inserts a banner with parsed fields and revalidates /banners", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Holiday Sale",
      link: "https://example.com/sale",
      image_url: "https://x/banner.png",
      position: 2,
      is_active: "on",
    });
    await runAction(createBanner, fd);

    const chains = admin.chainsForTable("banners");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      name: "Holiday Sale",
      link: "https://example.com/sale",
      image_url: "https://x/banner.png",
      position: 2,
      is_active: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/banners");
  });

  it("treats is_active='on' as true", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const fd = buildFormData({ name: "X", is_active: "on" });
    await runAction(createBanner, fd);
    const insertArg = admin.chainsForTable("banners")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(true);
  });

  it("treats is_active='true' (string) as true", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const fd = buildFormData({ name: "X", is_active: "true" });
    await runAction(createBanner, fd);
    const insertArg = admin.chainsForTable("banners")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(true);
  });

  it("treats is_active absent or 'off' as false", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const fd = buildFormData({ name: "X", is_active: "off" });
    await runAction(createBanner, fd);
    const insertArg = admin.chainsForTable("banners")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_active).toBe(false);
  });

  it("defaults position to 0 when missing", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const fd = buildFormData({ name: "X" });
    await runAction(createBanner, fd);
    const insertArg = admin.chainsForTable("banners")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.position).toBe(0);
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ banners: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({ name: "X" });
    const result = await runAction(createBanner, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("updateBanner", () => {
  it("rejects users without banners:edit permission", async () => {
    asAdmin({ banners: ["view"] });
    const fd = buildFormData({ name: "X" });
    await expect(updateBanner("bn-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when name is empty", async () => {
    asAdmin({ banners: ["edit"] });
    const fd = buildFormData({ name: "" });
    await expect(updateBanner("bn-1", fd)).rejects.toThrow(/Banner name is required/);
  });

  it("updates banner by id", async () => {
    asAdmin({ banners: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      name: "Updated Banner",
      link: "https://x.com",
      image_url: "https://x/u.png",
      position: 5,
      is_active: "on",
    });
    await runAction((f) => updateBanner("bn-1", f), fd);

    const chains = admin.chainsForTable("banners");
    const updateChain = chains[0];
    const updateCall = updateChain.find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toEqual({
      name: "Updated Banner",
      link: "https://x.com",
      image_url: "https://x/u.png",
      position: 5,
      is_active: true,
    });
    const eqCall = updateChain.find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "bn-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/banners");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ banners: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    const fd = buildFormData({ name: "X" });
    const result = await runAction((f) => updateBanner("bn-1", f), fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/fk violation/);
  });
});

describe("deleteBanner", () => {
  it("rejects users without banners:delete permission", async () => {
    asAdmin({ banners: ["view", "edit"] });
    await expect(deleteBanner("bn-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the banner by id", async () => {
    asAdmin({ banners: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteBanner("bn-1");

    const chains = admin.chainsForTable("banners");
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "bn-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/banners");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ banners: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    await expect(deleteBanner("bn-1")).rejects.toThrow(/fk violation/);
  });
});

describe("reorderBanners", () => {
  it("rejects users without banners:edit permission", async () => {
    asAdmin({ banners: ["view"] });
    await expect(reorderBanners([])).rejects.toBeInstanceOf(PermissionError);
  });

  it("issues one update per item with the new position", async () => {
    asAdmin({ banners: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    await reorderBanners([
      { id: "bn-1", position: 2 },
      { id: "bn-2", position: 0 },
      { id: "bn-3", position: 1 },
    ]);

    const chains = admin.chainsForTable("banners");
    expect(chains).toHaveLength(3);
    chains.forEach((chain, idx) => {
      const update = chain.find((c) => c.method === "update")!;
      const eq = chain.find((c) => c.method === "eq")!;
      expect(update.args[0]).toEqual({ position: [2, 0, 1][idx] });
    });
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "bn-1"]);
    expect(chains[1].find((c) => c.method === "eq")!.args).toEqual(["id", "bn-2"]);
    expect(chains[2].find((c) => c.method === "eq")!.args).toEqual(["id", "bn-3"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/banners");
  });

  it("throws on first error and aborts remaining updates", async () => {
    asAdmin({ banners: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: { message: "boom" } });

    await expect(
      reorderBanners([
        { id: "bn-1", position: 0 },
        { id: "bn-2", position: 1 },
        { id: "bn-3", position: 2 },
      ]),
    ).rejects.toThrow(/boom/);

    // Only 2 chains should have been issued
    const chains = admin.chainsForTable("banners");
    expect(chains).toHaveLength(2);
  });

  it("handles empty items array (no updates, just revalidate)", async () => {
    asAdmin({ banners: ["edit"] });
    const admin = getAdminClient();
    await reorderBanners([]);
    expect(admin.chainsForTable("banners")).toHaveLength(0);
    expect(revalidatePathMock).toHaveBeenCalledWith("/banners");
  });
});
