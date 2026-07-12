import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../../test/mocks/supabase-clients";
import {
  resetSupabaseClients,
  getAdminClient,
} from "../../../../../test/mocks/supabase-clients";
import type { NextRequest } from "next/server";
import { POST } from "./route";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const VALID_BODY = { latitude: 12.9716, longitude: 77.5946, storeId: "s-1" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/delivery/charge", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetSupabaseClients();
  mockFetch.mockReset();
});

describe("POST /api/delivery/charge", () => {
  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/delivery/charge", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ storeId: "s-1" }));
    expect(res.status).toBe(400);
  });

  it("returns isEligible=false when no zone matches", async () => {
    const admin = getAdminClient();
    admin.setRpcResult("get_applicable_delivery_zone", { data: [], error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isEligible: false });
  });

  it("returns 500 when the zone RPC errors", async () => {
    const admin = getAdminClient();
    admin.setRpcResult("get_applicable_delivery_zone", {
      data: null,
      error: { message: "RPC failed" },
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it("returns isEligible=true with zone details when zone matches", async () => {
    process.env.OLA_MAPS_API_KEY = "test-key";
    const admin = getAdminClient();
    admin.setRpcResult("get_applicable_delivery_zone", {
      data: [{ id: "z-1", name: "Central", delivery_charge: 30, free_delivery_min_order: 200, is_express: false }],
      error: null,
    });
    admin.setResponses({ data: { lat: 12.934, lng: 77.61 }, error: null });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        rows: [{ elements: [{ distance: 4200, duration: 600, status: "ok" }] }],
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isEligible).toBe(true);
    expect(body.deliveryCharge).toBe(30);
    expect(body.freeDeliveryMinOrder).toBe(200);
    expect(body.zoneName).toBe("Central");
    expect(body.roadDistanceKm).toBe(4.2);
  });

  it("handles store with no lat/lng gracefully", async () => {
    const admin = getAdminClient();
    admin.setRpcResult("get_applicable_delivery_zone", {
      data: [{ id: "z-1", name: "Central", delivery_charge: 30, free_delivery_min_order: 200, is_express: false }],
      error: null,
    });
    admin.setResponses({ data: { lat: null, lng: null }, error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isEligible).toBe(true);
    expect(body.roadDistanceKm).toBeUndefined();
  });

  it("handles OLA Maps API failure gracefully (non-fatal)", async () => {
    const admin = getAdminClient();
    admin.setRpcResult("get_applicable_delivery_zone", {
      data: [{ id: "z-1", name: "Central", delivery_charge: 30, free_delivery_min_order: 200, is_express: false }],
      error: null,
    });
    admin.setResponses({ data: { lat: 12.934, lng: 77.61 }, error: null });

    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isEligible).toBe(true);
    expect(body.deliveryCharge).toBe(30);
  });
});
