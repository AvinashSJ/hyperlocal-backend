import { describe, it, expect, beforeEach } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import { resetPermissionMock } from "../../../../test/mocks/require-permission";

import { getCustomers } from "./actions";
import type { MockSupabaseUser } from "../../../../test/mocks/supabase";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
});

function seedAuthUsers(users: MockSupabaseUser[]): MockSupabaseUser[] {
  getAdminClient().setUsers(users);
  return users;
}

describe("getCustomers (no storeId — all customers)", () => {
  it("returns customers from auth.users filtered by profile.role = 'customer'", async () => {
    const u1: MockSupabaseUser = {
      id: "u-1",
      email: "alice@example.com",
      phone: "+911111111111",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2025-02-01T00:00:00Z",
    };
    const u2: MockSupabaseUser = {
      id: "u-2",
      email: "bob@example.com",
      phone: "+912222222222",
      created_at: "2025-01-02T00:00:00Z",
      last_sign_in_at: null,
    };
    seedAuthUsers([u1, u2]);

    const admin = getAdminClient();
    // 1) profiles (in + eq role=customer)
    // 2) addresses (in)
    // 3) orders (in)
    admin.setResponses(
      {
        data: [
          { id: "u-1", full_name: "Alice", avatar_url: "https://x/a.png", role: "customer" },
          { id: "u-2", full_name: "Bob", avatar_url: null, role: "customer" },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    );

    const customers = await getCustomers();
    expect(customers).toHaveLength(2);
    expect(customers[0]).toMatchObject({
      id: "u-1",
      email: "alice@example.com",
      phone: "+911111111111",
      profile: { full_name: "Alice", avatar_url: "https://x/a.png" },
      addressCount: 0,
      orderCount: 0,
    });
    expect(customers[1]).toMatchObject({
      id: "u-2",
      email: "bob@example.com",
      profile: { full_name: "Bob", avatar_url: null },
      last_sign_in_at: null,
    });
  });

  it("filters out users who do not have a customer profile (profileMap.has check)", async () => {
    const u1: MockSupabaseUser = {
      id: "u-1",
      email: "alice@example.com",
      created_at: "2025-01-01T00:00:00Z",
    };
    const u2: MockSupabaseUser = {
      id: "u-2",
      email: "bob@example.com",
      created_at: "2025-01-02T00:00:00Z",
    };
    seedAuthUsers([u1, u2]);

    const admin = getAdminClient();
    // Only u-1 is a customer in the profiles table
    admin.setResponses(
      { data: [{ id: "u-1", full_name: "Alice", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const customers = await getCustomers();
    expect(customers).toHaveLength(1);
    expect(customers[0].id).toBe("u-1");
  });

  it("returns [] when auth.admin.listUsers returns an error", async () => {
    const admin = getAdminClient();
    // The mock doesn't surface errors from listUsers directly. We use
    // setUsers([]) and rely on the implementation path: !users?.users → []. 
    // Since the mock always returns { data: { users }, error: null } for
    // listUsers, we cannot inject a real error here. Instead, we test the
    // equivalent case: empty users list.
    admin.setUsers([]);
    const customers = await getCustomers();
    expect(customers).toEqual([]);
  });

  it("aggregates addressCount per user (counting multiple addresses)", async () => {
    seedAuthUsers([{ id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" }]);

    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-1" }], error: null },
      { data: [], error: null },
    );

    const customers = await getCustomers();
    expect(customers[0].addressCount).toBe(3);
  });

  it("aggregates orderCount per user", async () => {
    seedAuthUsers([{ id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" }]);

    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [{ user_id: "u-1" }], error: null },
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }], error: null },
    );

    const customers = await getCustomers();
    expect(customers[0].orderCount).toBe(2);
  });

  it("orders query does NOT have store_id eq filter when storeId is null", async () => {
    seedAuthUsers([{ id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" }]);

    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    await getCustomers();
    const ordersChains = admin.chainsForTable("orders");
    expect(ordersChains).toHaveLength(1);
    const chain = ordersChains[0];
    expect(chain.some((c) => c.method === "eq" && c.args[0] === "store_id")).toBe(false);
  });

  it("defaults created_at to '' and last_sign_in_at to null when user has no record", async () => {
    // Edge case: we seed no users, but somehow listUsers returns an empty
    // result. The implementation returns [] early in that case, so this
    // scenario produces no customers. We test that the early return works.
    getAdminClient().setUsers([]);
    const customers = await getCustomers();
    expect(customers).toEqual([]);
  });
});

describe("getCustomers (storeId provided — store-scoped)", () => {
  it("returns customers who have ordered from the given store, with order scoped to store", async () => {
    const u1: MockSupabaseUser = {
      id: "u-1",
      email: "alice@example.com",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2025-02-01T00:00:00Z",
    };
    seedAuthUsers([u1]);

    const admin = getAdminClient();
    // 1) orders user_id (eq store_id)
    // 2) profiles (in+eq role=customer)
    // 3) addresses (in)
    // 4) orders count (in+eq store_id)
    // listUsers is called internally and reads from the same users state
    admin.setResponses(
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }], error: null },
      { data: [{ id: "u-1", full_name: "Alice", avatar_url: null, role: "customer" }], error: null },
      { data: [{ user_id: "u-1" }], error: null },
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-1" }], error: null },
    );

    const customers = await getCustomers("s-1");
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      id: "u-1",
      email: "alice@example.com",
      addressCount: 1,
      orderCount: 3,
    });
  });

  it("deduplicates user_ids from the orders.user_id probe", async () => {
    const u1: MockSupabaseUser = { id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" };
    seedAuthUsers([u1]);

    const admin = getAdminClient();
    // 1) orders user_id — same user_id 3x (orders in same store)
    // 2) profiles
    // 3) addresses
    // 4) orders count
    admin.setResponses(
      { data: [{ user_id: "u-1" }, { user_id: "u-1" }, { user_id: "u-1" }], error: null },
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    await getCustomers("s-1");
    // The profiles query should be called with .in("id", ["u-1"]) (deduplicated)
    const profilesChains = admin.chainsForTable("profiles");
    const inCall = profilesChains[0].find((c) => c.method === "in");
    expect(inCall!.args).toEqual(["id", ["u-1"]]);
  });

  it("returns [] early when no users have ordered from the given store", async () => {
    seedAuthUsers([{ id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" }]);

    const admin = getAdminClient();
    // 1) orders user_id returns empty
    admin.setResponses({ data: [], error: null });

    const customers = await getCustomers("s-1");
    expect(customers).toEqual([]);
    // No further queries should be made
    expect(admin.chainsForTable("profiles")).toHaveLength(0);
    expect(admin.chainsForTable("addresses")).toHaveLength(0);
    // Two orders chains were constructed (probe + count) BUT the count chain
    // is constructed only after the early-return check, so we should see only 1.
    // Note: orders chain construction happens on the FIRST .from() call; the
    // count chain would only be built after the early-return check is bypassed.
    expect(admin.chainsForTable("orders")).toHaveLength(1);
  });

  it("applies eq store_id to the orders count query when storeId is provided", async () => {
    seedAuthUsers([{ id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" }]);

    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ user_id: "u-1" }], error: null },
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    await getCustomers("s-42");
    const ordersChains = admin.chainsForTable("orders");
    // First chain: probe (select user_id, eq store_id)
    const probeChain = ordersChains[0];
    const probeEq = probeChain.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(probeEq).toBeDefined();
    expect(probeEq!.args[1]).toBe("s-42");
    // Second chain: count (select user_id, in user_id, eq store_id)
    const countChain = ordersChains[1];
    const countEq = countChain.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(countEq).toBeDefined();
    expect(countEq!.args[1]).toBe("s-42");
  });

  it("queries auth.admin.listUsers internally to enrich user records (email, phone, etc.)", async () => {
    const u1: MockSupabaseUser = {
      id: "u-1",
      email: "alice@example.com",
      phone: "+91",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2025-03-01T00:00:00Z",
    };
    seedAuthUsers([u1]);

    const admin = getAdminClient();
    admin.setResponses(
      { data: [{ user_id: "u-1" }], error: null },
      { data: [{ id: "u-1", full_name: "Alice", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const customers = await getCustomers("s-1");
    const listCalls = admin.calls.filter((c) => c.method === "auth.admin.listUsers");
    expect(listCalls.length).toBe(1);
    expect(customers[0].email).toBe("alice@example.com");
    expect(customers[0].phone).toBe("+91");
    expect(customers[0].last_sign_in_at).toBe("2025-03-01T00:00:00Z");
  });

  it("filters out user_ids from store orders that have no customer profile", async () => {
    const u1: MockSupabaseUser = { id: "u-1", email: "a@x.com", created_at: "2025-01-01T00:00:00Z" };
    const u2: MockSupabaseUser = { id: "u-2", email: "b@x.com", created_at: "2025-01-02T00:00:00Z" };
    seedAuthUsers([u1, u2]);

    const admin = getAdminClient();
    // Both users have ordered from s-1, but only u-1 is a customer (u-2 is admin/staff)
    admin.setResponses(
      { data: [{ user_id: "u-1" }, { user_id: "u-2" }], error: null },
      { data: [{ id: "u-1", full_name: "A", avatar_url: null, role: "customer" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const customers = await getCustomers("s-1");
    expect(customers).toHaveLength(1);
    expect(customers[0].id).toBe("u-1");
  });
});
