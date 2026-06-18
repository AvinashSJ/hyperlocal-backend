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
import { makeNotification } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getNotifications,
  createNotification,
  deleteNotification,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getNotifications", () => {
  it("returns notifications ordered by created_at desc with profile join", async () => {
    const admin = getAdminClient();
    const n1 = makeNotification({ id: "n-1", title: "Order Placed" });
    const n2 = makeNotification({ id: "n-2", title: "Promo" });
    admin.setResponses({ data: [n1, n2], error: null });

    const result = await getNotifications();
    expect(result).toHaveLength(2);

    const chains = admin.chainsForTable("notifications");
    const selectCall = chains[0].find((c) => c.method === "select")!;
    expect(selectCall.args[0]).toBe("*, profiles(full_name, email)");
    const orderCall = chains[0].find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("created_at");
    expect((orderCall!.args[1] as { ascending?: boolean })?.ascending).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getNotifications();
    expect(result).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getNotifications()).rejects.toThrow(/db down/);
  });
});

describe("createNotification", () => {
  // NOTE: source uses `assertPermission("notifications", "create")` but the
  // notifications module in PERMISSION_MODULES only has ["view", "send", "delete"].
  // This means in production, non-super-admin users CANNOT create notifications
  // (the permission check always throws). The mock does not validate action
  // names against PERMISSION_MODULES structure, so tests pass by directly
  // granting "create" in the role permissions object.
  it("rejects users without notifications:create permission (per mock)", async () => {
    asAdmin({ notifications: ["view"] });
    const fd = buildFormData({ title: "Hi", user_id: "u-1" });
    await expect(createNotification(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when title is empty", async () => {
    asAdmin({ notifications: ["create"] });
    const fd = buildFormData({ title: "", user_id: "u-1" });
    await expect(createNotification(fd)).rejects.toThrow(/Notification title is required/);
  });

  it("throws when user_id is empty", async () => {
    asAdmin({ notifications: ["create"] });
    const fd = buildFormData({ title: "Hi", user_id: "" });
    await expect(createNotification(fd)).rejects.toThrow(/User ID is required/);
  });

  it("inserts a notification with all fields and revalidates", async () => {
    asAdmin({ notifications: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      user_id: "u-1",
      title: "Order Shipped",
      body: "Your order #1234 is on the way",
      type: "order",
    });
    await runAction(createNotification, fd);

    const chains = admin.chainsForTable("notifications");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      user_id: "u-1",
      title: "Order Shipped",
      body: "Your order #1234 is on the way",
      type: "order",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/notifications");
  });

  it("accepts any type string (no enum validation)", async () => {
    asAdmin({ notifications: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      user_id: "u-1",
      title: "X",
      type: "totally-custom-type",
    });
    await runAction(createNotification, fd);

    const insertArg = admin.chainsForTable("notifications")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.type).toBe("totally-custom-type");
  });

  it("does NOT auto-set is_read, read_at, or created_at (relies on DB defaults)", async () => {
    asAdmin({ notifications: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ user_id: "u-1", title: "X" });
    await runAction(createNotification, fd);

    const insertArg = admin.chainsForTable("notifications")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg).not.toHaveProperty("is_read");
    expect(insertArg).not.toHaveProperty("read_at");
    expect(insertArg).not.toHaveProperty("created_at");
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ notifications: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    const fd = buildFormData({ user_id: "u-1", title: "X" });
    const result = await runAction(createNotification, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/fk violation/);
  });
});

describe("deleteNotification", () => {
  it("rejects users without notifications:delete permission", async () => {
    asAdmin({ notifications: ["view"] });
    await expect(deleteNotification("n-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the notification by id and revalidates", async () => {
    asAdmin({ notifications: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteNotification("n-1");

    const chains = admin.chainsForTable("notifications");
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "n-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/notifications");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ notifications: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    await expect(deleteNotification("n-1")).rejects.toThrow(/fk violation/);
  });
});
