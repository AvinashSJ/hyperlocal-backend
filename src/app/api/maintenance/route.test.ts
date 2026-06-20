import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../test/mocks/supabase-clients";
import { resetSupabaseClients, getAdminClient } from "../../../../test/mocks/supabase-clients";
import { GET } from "./route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  resetSupabaseClients();
  mockFetch.mockReset();
});

describe("GET /api/maintenance", () => {
  it("returns the default app and an empty stores map when both settings are missing", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: [], error: null });

    const res = await GET();
    const body = await res.json();
    expect(body.app.enabled).toBe(false);
    expect(body.app.reason).toBe("maintenance");
    expect(body.stores).toEqual({});
  });

  it("returns a normalized app value and a populated stores map", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        {
          key: "app_maintenance",
          value: { enabled: true, reason: "operations", message: "down", etaHours: 4 },
        },
        {
          key: "store_maintenance",
          value: {
            "s-1": { enabled: true, reason: "technical", message: "", etaHours: 2 },
            "s-2": { enabled: false, reason: "maintenance", message: "", etaHours: null },
          },
        },
      ],
      error: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.app.enabled).toBe(true);
    expect(body.app.reason).toBe("operations");
    expect(body.app.message).toBe("down");
    expect(body.app.etaHours).toBe(4);
    expect(body.stores["s-1"].enabled).toBe(true);
    expect(body.stores["s-1"].reason).toBe("technical");
    expect(body.stores["s-1"].etaHours).toBe(2);
    expect(body.stores["s-2"].enabled).toBe(false);
  });

  it("falls back to 'maintenance' for an unknown reason", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        {
          key: "app_maintenance",
          value: { enabled: true, reason: "weird-reason", message: "", etaHours: null },
        },
      ],
      error: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.app.reason).toBe("maintenance");
  });

  it("clamps negative etaHours to null", async () => {
    const admin = getAdminClient();
    admin.setResponses({
      data: [
        {
          key: "app_maintenance",
          value: { enabled: true, reason: "operations", message: "", etaHours: -2 },
        },
      ],
      error: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.app.etaHours).toBeNull();
  });

  it("returns a 200 with the JSON contract even when nothing is stored", async () => {
    const admin = getAdminClient();
    admin.setResponses({ data: null, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
  });
});
