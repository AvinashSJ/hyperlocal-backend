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
  asSuperAdmin,
  resetPermissionMock,
  assertPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { buildFormData } from "../../../../test/fixtures/formdata";
import {
  makeStore,
  makeCommission,
  makeCommissionPayment,
} from "../../../../test/fixtures/factories";

import {
  getCommissions,
  getCommissionPayments,
  generateCommission,
  recordPayment,
  deleteCommissionPayment,
  getStoresLight,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getStoresLight", () => {
  it("returns the light store list", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeStore({ id: "s-1" }), makeStore({ id: "s-2" })],
      error: null,
    });

    const result = await getStoresLight();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
  });
});

describe("getCommissions", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissions()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns the commission list with payment counts", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCommission({ id: "c-1" }), makeCommission({ id: "c-2" })],
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { commission_id: "c-1" },
        { commission_id: "c-1" },
        { commission_id: "c-2" },
      ],
      error: null,
    });

    const result = await getCommissions();
    expect(result).toHaveLength(2);
    const c1 = result.find((c) => c.id === "c-1");
    expect(c1?.payment_count).toBe(2);
  });

  it("filters by storeId when provided", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await getCommissions("s-1");
    const commissionChain = admin.chainsForTable("store_commissions")[0];
    expect(commissionChain.find((c) => c.method === "eq")).toEqual({
      method: "eq",
      args: ["store_id", "s-1"],
    });
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: [], error: null });

    const result = await getCommissions();
    expect(result).toEqual([]);
  });
});

describe("getCommissionPayments", () => {
  it("rejects users without commissions:view permission", async () => {
    asAdmin({});
    await expect(getCommissionPayments("c-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns payments for a commission", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [makeCommissionPayment({ commission_id: "c-1" })],
      error: null,
    });

    const result = await getCommissionPayments("c-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when data is null", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    const result = await getCommissionPayments("c-1");
    expect(result).toEqual([]);
  });
});

describe("generateCommission", () => {
  it("rejects users without commissions:create permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when store_id is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow(/Store.*required/);
  });

  it("throws when period_start is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ store_id: "s-1", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow(/period start.*required/);
  });

  it("throws when period_end is missing", async () => {
    asAdmin({ commissions: ["create"] });
    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01" });
    await expect(generateCommission(fd)).rejects.toThrow(/period end.*required/);
  });

  it("throws when the store is not found", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ store_id: "s-1", period_start: "2025-01-01", period_end: "2025-01-31" });
    await expect(generateCommission(fd)).rejects.toThrow("Store not found");
  });

  it("computes commission_amount = total_revenue * (rate/100)", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({
      data: [
        { total_amount: 1000 },
        { total_amount: 500 },
        { total_amount: 2500 },
      ],
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.total_revenue).toBe(4000);
    expect(insertArg.commission_rate).toBe(10);
    expect(insertArg.commission_amount).toBe(400);
    expect(insertArg.balance_due).toBe(400);
  });

  it("sets status to 'unpaid' when commission_amount > 0", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({
      data: [{ total_amount: 1000 }],
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.status).toBe("unpaid");
  });

  it("sets status to 'paid' when commission_amount = 0", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 0 }),
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.status).toBe("paid");
  });

  it("revalidates /commissions on success", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 10 }),
      error: null,
    });
    admin.enqueueResponse({ data: [], error: null });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
    });
    await generateCommission(fd);

    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
  });

  it("stores notes when provided", async () => {
    asAdmin({ commissions: ["create"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: makeStore({ id: "s-1", commission_rate: 5 }),
      error: null,
    });
    admin.enqueueResponse({ data: [{ total_amount: 100 }], error: null });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
      notes: "Monthly settlement",
    });
    await generateCommission(fd);

    const insertArg = admin.chainsForTable("store_commissions")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.notes).toBe("Monthly settlement");
  });
});

describe("recordPayment", () => {
  it("rejects users without commissions:edit permission", async () => {
    asAdmin({ commissions: ["view"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when amount is NaN", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "not-a-number" });
    await expect(recordPayment(fd)).rejects.toThrow(/amount/);
  });

  it("throws when amount is <= 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const fd = buildFormData({ commission_id: "c-1", amount: "0" });
    await expect(recordPayment(fd)).rejects.toThrow(/amount/);
  });

  it("throws when the commission is not found", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await expect(recordPayment(fd)).rejects.toThrow("Commission not found");
  });

  it("throws when amount exceeds balance_due", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 500, status: "unpaid" },
      error: null,
    });

    const fd = buildFormData({ commission_id: "c-1", amount: "1000" });
    await expect(recordPayment(fd)).rejects.toThrow(/exceeds balance/);
  });

  it("transitions status to 'paid' when newBalance = 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 100, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await recordPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(0);
    expect(commissionUpdate.status).toBe("paid");
  });

  it("transitions status to 'partially_paid' when newBalance > 0", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "300" });
    await recordPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(700);
    expect(commissionUpdate.status).toBe("partially_paid");
  });

  it("stores the payment record with the right amount and notes", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 1000, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({
      commission_id: "c-1",
      amount: "250",
      notes: "First installment",
    });
    await recordPayment(fd);

    const paymentInsert = admin.chainsForTable("commission_payments")[0]
      .find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(paymentInsert.commission_id).toBe("c-1");
    expect(paymentInsert.amount).toBe(250);
    expect(paymentInsert.notes).toBe("First installment");
  });

  it("revalidates /commissions on success", async () => {
    asAdmin({ commissions: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 100, status: "unpaid" },
      error: null,
    });
    admin.enqueueResponse({ data: { user: { id: "u-1" } }, error: null });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ commission_id: "c-1", amount: "100" });
    await recordPayment(fd);

    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
  });
});

describe("deleteCommissionPayment", () => {
  it("rejects users without commissions:delete permission", async () => {
    asAdmin({ commissions: ["view", "edit"] });
    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when the payment is not found", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toThrow("Payment not found");
  });

  it("throws when the commission is not found", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: { amount: 100 },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: { message: "Not found" } });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await expect(deleteCommissionPayment(fd)).rejects.toThrow("Commission not found");
  });

  it("transitions status to 'unpaid' when newBalance >= commission_amount", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 1000 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 0, commission_amount: 1000, status: "paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await deleteCommissionPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(1000);
    expect(commissionUpdate.status).toBe("unpaid");
  });

  it("transitions status to 'partially_paid' when 0 < newBalance < commission_amount", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 200 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 600, commission_amount: 1000, status: "partially_paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await deleteCommissionPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(800);
    expect(commissionUpdate.status).toBe("partially_paid");
  });

  it("transitions status to 'paid' when newBalance is negative (overpayment reversal)", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 500 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 200, commission_amount: 1000, status: "partially_paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await deleteCommissionPayment(fd);

    const commissionUpdate = admin.chainsForTable("store_commissions")[1]
      .find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(commissionUpdate.balance_due).toBe(700);
    expect(commissionUpdate.status).toBe("partially_paid");
  });

  it("deletes the payment and revalidates", async () => {
    asAdmin({ commissions: ["delete"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: { amount: 100 }, error: null });
    admin.enqueueResponse({
      data: { id: "c-1", balance_due: 0, commission_amount: 1000, status: "paid" },
      error: null,
    });
    admin.enqueueResponse({ data: null, error: null });
    admin.enqueueResponse({ data: null, error: null });

    const fd = buildFormData({ payment_id: "p-1", commission_id: "c-1" });
    await deleteCommissionPayment(fd);

    const paymentDelete = admin.chainsForTable("commission_payments")[1]
      .find((c) => c.method === "delete");
    expect(paymentDelete).toBeDefined();
    expect(revalidatePathMock).toHaveBeenCalledWith("/commissions");
  });
});
