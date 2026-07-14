import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../test/mocks/supabase-clients";
import {
  getAdminClient,
  resetSupabaseClients,
  setServerUser,
} from "../../test/mocks/supabase-clients";
import { logActivity, getEntityActivityLog } from "./activity-log";


beforeEach(() => {
  resetSupabaseClients();
  vi.restoreAllMocks();
});

describe("logActivity", () => {
  it("inserts a row with the user_id from auth.getUser()", async () => {
    setServerUser({ id: "u-1", email: "admin@test.com" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await logActivity({
      action: "create",
      entityType: "product",
      entityId: "p-1",
      details: { name: "Widget" },
    });

    const insertCall = admin.calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    const insertArg = insertCall!.args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      user_id: "u-1",
      action: "create",
      entity_type: "product",
      entity_id: "p-1",
      details: { name: "Widget" },
    });
  });

  it("tolerates a missing user (user_id = null)", async () => {
    // No setServerUser call → null user
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await logActivity({
      action: "update",
      entityType: "product",
      entityId: "p-2",
    });

    const insertCall = admin.calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    const insertArg = insertCall!.args[0] as Record<string, unknown>;
    expect(insertArg.user_id).toBeNull();
    expect(insertArg.details).toBeNull(); // no details provided
  });

  it("does NOT throw when the insert fails (best-effort)", async () => {
    setServerUser({ id: "u-1", email: "admin@test.com" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "db down" } });

    // Should resolve, not reject — the calling action must not fail.
    await expect(
      logActivity({
        action: "delete",
        entityType: "product",
        entityId: "p-3",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[activity-log] insert failed:",
      "db down",
    );
  });

  it("captures bulk_import action with summary details (no entity_id)", async () => {
    setServerUser({ id: "u-1", email: "admin@test.com" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await logActivity({
      action: "bulk_import",
      entityType: "product",
      entityId: null, // bulk summary is not tied to a single entity
      details: { imported: 47, errors: 3 },
    });

    const insertCall = admin.calls.find((c) => c.method === "insert");
    const insertArg = insertCall!.args[0] as Record<string, unknown>;
    expect(insertArg).toMatchObject({
      action: "bulk_import",
      entity_type: "product",
      entity_id: null,
      details: { imported: 47, errors: 3 },
    });
  });
});

describe("getEntityActivityLog", () => {
  it("queries with eq entity_type, eq entity_id, order desc, limit", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        {
          id: 1,
          user_id: "u-1",
          action: "update",
          entity_type: "product",
          entity_id: "p-1",
          details: { fields_received: ["mrp"] },
          created_at: "2026-06-19T10:00:00Z",
          profiles: { full_name: "Admin User" },
        },
      ],
      error: null,
    });

    const result = await getEntityActivityLog("product", "p-1");

    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("update");
    expect(result[0].profiles?.full_name).toBe("Admin User");

    // Verify the query shape
    const chain = admin.chainsForTable("activity_logs")[0];
    const entityTypeEq = chain.find((c) => c.method === "eq" && c.args[0] === "entity_type");
    const entityIdEq = chain.find((c) => c.method === "eq" && c.args[0] === "entity_id");
    expect(entityTypeEq?.args[1]).toBe("product");
    expect(entityIdEq?.args[1]).toBe("p-1");
    const orderCall = chain.find((c) => c.method === "order");
    expect(orderCall?.args).toEqual(["created_at", { ascending: false }]);
    const limitCall = chain.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(100);
  });

  it("respects a custom limit parameter", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await getEntityActivityLog("product", "p-1", 25);

    const chain = admin.chainsForTable("activity_logs")[0];
    const limitCall = chain.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(25);
  });

  it("returns an empty array when no entries exist", async () => {
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    const result = await getEntityActivityLog("product", "p-none");
    expect(result).toEqual([]);
  });
});
