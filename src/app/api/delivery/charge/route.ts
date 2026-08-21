import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OlaMaps } from "@/lib/ola-maps";
import { CORS_HEADERS, OPTIONS_RESPONSE } from "@/lib/cors";

type ChargeBody = {
  latitude: number;
  longitude: number;
  storeId: string;
  orderValue?: number;
};

type ChargeResponse = {
  isEligible: boolean;
  deliveryCharge?: number;
  freeDeliveryMinOrder?: number;
  zoneName?: string;
  roadDistanceKm?: number;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: ChargeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { latitude, longitude, storeId, orderValue } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number" || !storeId) {
    return NextResponse.json(
      { error: "latitude, longitude (numbers) and storeId (string) are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const supabase = createAdminClient();

  const { data: zone, error: zoneError } = await supabase.rpc(
    "get_applicable_delivery_zone",
    { p_lat: latitude, p_lng: longitude, p_store_id: storeId },
  );

  if (zoneError) {
    return NextResponse.json(
      { error: zoneError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!zone || zone.length === 0) {
    return NextResponse.json(
      { isEligible: false } satisfies ChargeResponse,
      { headers: CORS_HEADERS },
    );
  }

  const z = zone[0] as {
    id: string;
    name: string;
    delivery_charge: number;
    free_delivery_min_order: number;
    min_order_value: number | null;
    max_order_value: number | null;
    min_distance_km: number | null;
    max_distance_km: number | null;
    is_express: boolean;
  };

  let roadDistanceKm: number | undefined;
  if (process.env.OLA_MAPS_API_KEY) {
    try {
      const { data: store } = await supabase
        .from("stores")
        .select("lat, lng")
        .eq("id", storeId)
        .single();

      if (store?.lat && store?.lng) {
        const ola = new OlaMaps();
        const { distances } = await ola.distanceMatrix(
          [{ lat: store.lat, lng: store.lng }],
          [{ lat: latitude, lng: longitude }],
        );
        const d = distances[0]?.[0];
        if (d != null) {
          roadDistanceKm = Math.round((d / 1000) * 10) / 10;
        }
      }
    } catch {
      // Non-fatal: distance is informational, eligibility is already confirmed
    }
  }

  // Check zone conditions
  const numOrderValue = typeof orderValue === "number" ? orderValue : null;
  const numDistance = roadDistanceKm ?? null;

  if (numOrderValue !== null) {
    if (z.min_order_value !== null && numOrderValue < z.min_order_value) {
      return NextResponse.json(
        { isEligible: false, reason: `Minimum order value is ₹${z.min_order_value}` } satisfies ChargeResponse & { reason: string },
        { headers: CORS_HEADERS },
      );
    }
    if (z.max_order_value !== null && numOrderValue > z.max_order_value) {
      return NextResponse.json(
        { isEligible: false, reason: `Maximum order value is ₹${z.max_order_value}` } satisfies ChargeResponse & { reason: string },
        { headers: CORS_HEADERS },
      );
    }
  }

  if (numDistance !== null) {
    if (z.min_distance_km !== null && numDistance < z.min_distance_km) {
      return NextResponse.json(
        { isEligible: false, reason: `Minimum delivery distance is ${z.min_distance_km} km` } satisfies ChargeResponse & { reason: string },
        { headers: CORS_HEADERS },
      );
    }
    if (z.max_distance_km !== null && numDistance > z.max_distance_km) {
      return NextResponse.json(
        { isEligible: false, reason: `Maximum delivery distance is ${z.max_distance_km} km` } satisfies ChargeResponse & { reason: string },
        { headers: CORS_HEADERS },
      );
    }
  }

  // Enforce free delivery threshold server-side
  const finalCharge =
    numOrderValue !== null &&
    z.free_delivery_min_order > 0 &&
    numOrderValue >= z.free_delivery_min_order
      ? 0
      : z.delivery_charge;

  return NextResponse.json(
    {
      isEligible: true,
      deliveryCharge: finalCharge,
      freeDeliveryMinOrder: z.free_delivery_min_order,
      zoneName: z.name,
      roadDistanceKm,
    } satisfies ChargeResponse,
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return OPTIONS_RESPONSE;
}
