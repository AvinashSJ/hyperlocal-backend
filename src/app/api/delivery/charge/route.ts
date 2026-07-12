import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OlaMaps } from "@/lib/ola-maps";

type ChargeBody = {
  latitude: number;
  longitude: number;
  storeId: string;
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { latitude, longitude, storeId } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number" || !storeId) {
    return NextResponse.json(
      { error: "latitude, longitude (numbers) and storeId (string) are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: zone, error: zoneError } = await supabase.rpc(
    "get_applicable_delivery_zone",
    { p_lat: latitude, p_lng: longitude, p_store_id: storeId },
  );

  if (zoneError) {
    return NextResponse.json({ error: zoneError.message }, { status: 500 });
  }

  if (!zone || zone.length === 0) {
    return NextResponse.json({ isEligible: false } satisfies ChargeResponse);
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

  return NextResponse.json({
    isEligible: true,
    deliveryCharge: z.delivery_charge,
    freeDeliveryMinOrder: z.free_delivery_min_order,
    zoneName: z.name,
    roadDistanceKm,
  } satisfies ChargeResponse);
}
