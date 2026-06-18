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
import { makeGstNumber } from "../../../../test/fixtures/factories";
import { runAction } from "../../../../test/helpers/invoke-action";

import {
  getGstNumbers,
  createGstNumber,
  updateGstNumber,
  deleteGstNumber,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  revalidatePathMock.mockClear();
  assertPermissionMock.mockClear();
});

describe("getGstNumbers", () => {
  it("returns GST numbers ordered by created_at desc with joined store name", async () => {
    const admin = getAdminClient();
    const g1 = makeGstNumber({ id: "g-1", gstin: "29ABCDE1234F1Z5" });
    const g2 = makeGstNumber({ id: "g-2", gstin: "29XYZAB5678F2Z6" });
    admin.setResponses({ data: [g1, g2], error: null });

    const result = await getGstNumbers();
    expect(result).toHaveLength(2);

    const chains = admin.chainsForTable("gst_numbers");
    const selectCall = chains[0].find((c) => c.method === "select")!;
    expect(selectCall.args[0]).toBe("*, stores(name)");
    const orderCall = chains[0].find((c) => c.method === "order");
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe("created_at");
    expect((orderCall!.args[1] as { ascending?: boolean })?.ascending).toBe(false);
  });

  it("applies eq filter on store_id when storeId is provided", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGstNumbers("s-1");

    const chains = admin.chainsForTable("gst_numbers");
    const eqCall = chains[0].find((c) => c.method === "eq");
    expect(eqCall).toBeDefined();
    expect(eqCall!.args).toEqual(["store_id", "s-1"]);
  });

  it("does NOT apply store_id eq when storeId is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });
    await getGstNumbers(null);

    const chains = admin.chainsForTable("gst_numbers");
    expect(chains[0].some((c) => c.method === "eq")).toBe(false);
  });

  it("returns [] when data is null", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });
    const result = await getGstNumbers();
    expect(result).toEqual([]);
  });

  it("throws when error is returned", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "db down" } });
    await expect(getGstNumbers()).rejects.toThrow(/db down/);
  });
});

describe("createGstNumber", () => {
  it("rejects users without gst_numbers:create permission", async () => {
    asAdmin({ gst_numbers: ["view"] });
    const fd = buildFormData({ gstin: "29ABCDE1234F1Z5", store_id: "s-1" });
    await expect(createGstNumber(fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when gstin is empty", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const fd = buildFormData({ gstin: "", store_id: "s-1" });
    await expect(createGstNumber(fd)).rejects.toThrow(/GSTIN is required/);
  });

  it("throws when store_id is empty", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const fd = buildFormData({ gstin: "29ABCDE1234F1Z5", store_id: "" });
    await expect(createGstNumber(fd)).rejects.toThrow(/Store is required/);
  });

  it("inserts a GST number with all fields and revalidates", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      legal_name: "Acme Corp",
      business_address: "123 Test St, Bangalore",
      state_code: "29",
      is_primary: "on",
      is_active: "true",
      current_turnover: 5000000,
      financial_year: "2025-2026",
      threshold_amount: 4000000,
    });
    await runAction(createGstNumber, fd);

    const chains = admin.chainsForTable("gst_numbers");
    const insertCall = chains[0].find((c) => c.method === "insert")!;
    const insertArg = insertCall.args[0] as Record<string, unknown>;
    expect(insertArg).toEqual({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      legal_name: "Acme Corp",
      business_address: "123 Test St, Bangalore",
      state_code: "29",
      is_primary: true,
      is_active: true,
      current_turnover: 5000000,
      financial_year: "2025-2026",
      threshold_amount: 4000000,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/gst-numbers");
  });

  it("treats is_primary='true' as true", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      is_primary: "true",
    });
    await runAction(createGstNumber, fd);

    const insertArg = admin.chainsForTable("gst_numbers")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_primary).toBe(true);
  });

  it("treats is_primary absent or 'off' as false", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      is_primary: "off",
    });
    await runAction(createGstNumber, fd);

    const insertArg = admin.chainsForTable("gst_numbers")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.is_primary).toBe(false);
  });

  it("defaults numeric fields to 0 when missing", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ store_id: "s-1", gstin: "29ABCDE1234F1Z5" });
    await runAction(createGstNumber, fd);

    const insertArg = admin.chainsForTable("gst_numbers")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insertArg.current_turnover).toBe(0);
    expect(insertArg.threshold_amount).toBe(0);
  });

  it("does NOT validate state_code format (no 2-digit check)", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      state_code: "INVALID",
    });
    await runAction(createGstNumber, fd);

    const insertArg = admin.chainsForTable("gst_numbers")[0].find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    // No state_code validation — whatever is provided is inserted
    expect(insertArg.state_code).toBe("INVALID");
  });

  it("does NOT enforce is_primary uniqueness (no guard against multiple primaries)", async () => {
    // Source bug: there's no guard. If two GST numbers are created with
    // is_primary=true, the DB will accept both (or reject both if there's a
    // unique partial index). The action layer doesn't care.
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd1 = buildFormData({
      store_id: "s-1",
      gstin: "29ABCDE1234F1Z5",
      is_primary: "on",
    });
    await runAction(createGstNumber, fd1);

    const fd2 = buildFormData({
      store_id: "s-1",
      gstin: "29XYZAB5678F2Z6",
      is_primary: "on",
    });
    await runAction(createGstNumber, fd2);

    const chains = admin.chainsForTable("gst_numbers");
    expect(chains).toHaveLength(2);
    chains.forEach((chain) => {
      const insertArg = chain.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
      expect(insertArg.is_primary).toBe(true);
    });
  });

  it("throws when insert returns an error", async () => {
    asAdmin({ gst_numbers: ["create"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "duplicate gstin" } });
    const fd = buildFormData({ store_id: "s-1", gstin: "29ABCDE1234F1Z5" });
    const result = await runAction(createGstNumber, fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/duplicate gstin/);
  });
});

describe("updateGstNumber", () => {
  it("rejects users without gst_numbers:edit permission", async () => {
    asAdmin({ gst_numbers: ["view"] });
    const fd = buildFormData({ gstin: "29ABCDE1234F1Z5" });
    await expect(updateGstNumber("g-1", fd)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws when gstin is empty", async () => {
    asAdmin({ gst_numbers: ["edit"] });
    const fd = buildFormData({ gstin: "" });
    await expect(updateGstNumber("g-1", fd)).rejects.toThrow(/GSTIN is required/);
  });

  it("does NOT require store_id on update", async () => {
    asAdmin({ gst_numbers: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({ gstin: "29ABCDE1234F1Z5" });
    await runAction((f) => updateGstNumber("g-1", f), fd);

    const updateArg = admin.chainsForTable("gst_numbers")[0].find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(updateArg.store_id).toBe("");
  });

  it("updates the GST number by id and revalidates", async () => {
    asAdmin({ gst_numbers: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const fd = buildFormData({
      store_id: "s-2",
      gstin: "29XYZAB5678F2Z6",
      legal_name: "Updated Corp",
      business_address: "456 New St",
      state_code: "07",
      is_primary: "true",
      is_active: "on",
      current_turnover: 6000000,
      financial_year: "2026-2027",
      threshold_amount: 5000000,
    });
    await runAction((f) => updateGstNumber("g-1", f), fd);

    const chains = admin.chainsForTable("gst_numbers");
    const updateCall = chains[0].find((c) => c.method === "update")!;
    expect(updateCall.args[0]).toMatchObject({
      store_id: "s-2",
      gstin: "29XYZAB5678F2Z6",
      legal_name: "Updated Corp",
      business_address: "456 New St",
      state_code: "07",
      is_primary: true,
      is_active: true,
      current_turnover: 6000000,
      financial_year: "2026-2027",
      threshold_amount: 5000000,
    });
    const eqCall = chains[0].find((c) => c.method === "eq")!;
    expect(eqCall.args).toEqual(["id", "g-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/gst-numbers");
  });

  it("throws when update returns an error", async () => {
    asAdmin({ gst_numbers: ["edit"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "constraint" } });
    const fd = buildFormData({ gstin: "29ABCDE1234F1Z5" });
    const result = await runAction((f) => updateGstNumber("g-1", f), fd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/constraint/);
  });
});

describe("deleteGstNumber", () => {
  it("rejects users without gst_numbers:delete permission", async () => {
    asAdmin({ gst_numbers: ["view", "edit"] });
    await expect(deleteGstNumber("g-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("deletes the GST number by id and revalidates", async () => {
    asAdmin({ gst_numbers: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    await deleteGstNumber("g-1");

    const chains = admin.chainsForTable("gst_numbers");
    expect(chains[0].some((c) => c.method === "delete")).toBe(true);
    expect(chains[0].find((c) => c.method === "eq")!.args).toEqual(["id", "g-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/gst-numbers");
  });

  it("throws when delete returns an error", async () => {
    asAdmin({ gst_numbers: ["delete"] });
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: { message: "fk violation" } });
    await expect(deleteGstNumber("g-1")).rejects.toThrow(/fk violation/);
  });
});
