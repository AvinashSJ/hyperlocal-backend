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

type DeliveryRule = {
  id: string;
  name: string;
  min_order_value: number | null;
  max_order_value: number | null;
  min_distance_km: number | null;
  max_distance_km: number | null;
  charge: number;
  priority: number;
};

type ChargeResponse = {
  isEligible: boolean;
  deliveryCharge?: number;
  freeDeliveryMinOrder?: number;
  zoneName?: string;
  roadDistanceKm?: number;
  appliedRule?: string | null;
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

  let deliveryCharge = z.delivery_charge;
  let appliedRule: string | null = null;

  const { data: rules } = await supabase
    .from("delivery_rules")
    .select("id, name, min_order_value, max_order_value, min_distance_km, max_distance_km, charge, priority")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (rules && rules.length > 0) {
    const numOrderValue = typeof orderValue === "number" ? orderValue : null;
    const numDistance = roadDistanceKm ?? null;

    for (const rule of rules as DeliveryRule[]) {
      if (numOrderValue !== null) {
        if (rule.min_order_value !== null && numOrderValue < rule.min_order_value) continue;
        if (rule.max_order_value !== null && numOrderValue > rule.max_order_value) continue;
      }
      if (numDistance !== null) {
        if (rule.min_distance_km !== null && numDistance < rule.min_distance_km) continue;
        if (rule.max_distance_km !== null && numDistance > rule.max_distance_km) continue;
      }
      deliveryCharge = rule.charge;
      appliedRule = rule.name;
      break;
    }
  }

  return NextResponse.json(
    {
      isEligible: true,
      deliveryCharge,
      freeDeliveryMinOrder: z.free_delivery_min_order,
      zoneName: z.name,
      roadDistanceKm,
      appliedRule,
    } satisfies ChargeResponse,
    { headers: CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return OPTIONS_RESPONSE;
}
